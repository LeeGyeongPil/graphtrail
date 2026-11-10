"""Build fixtures/py-agent.sqlite with the real SqliteSaver.

No LLM and no API key: the "model" is a scripted function that first asks for the
add tool and then answers. The storage format (msgpack ext types, writes,
interrupts) is exactly what LangGraph writes. Practice data only.

Usage: uv run python make_fixture.py ../../py-agent.sqlite
"""
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, TypedDict

from demo_types import Budget, Level, Plan
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt


class State(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    plan: Plan
    budget: Budget
    started: datetime
    timeout: timedelta
    run_id: uuid.UUID
    tags: set
    level: Level
    approved: bool


def agent(state: State):
    n = len(state["messages"])
    if not any(isinstance(m, ToolMessage) for m in state["messages"]):
        msg = AIMessage(
            id="m-ai-1",
            content="",
            tool_calls=[{"name": "add", "args": {"a": 2, "b": 3}, "id": "call_1"}],
        )
    else:
        msg = AIMessage(id="m-ai-2", content="The answer is 5.")
    return {
        "messages": [msg],
        "plan": Plan(goal="add numbers", steps=["call tool", "answer"]),
        "budget": Budget(used=n, limit=10),
        "started": datetime(2026, 11, 10, tzinfo=timezone.utc),
        "timeout": timedelta(seconds=30),
        "run_id": uuid.UUID("12345678-1234-5678-1234-567812345678"),
        "tags": {"demo", "practice"},
        "level": Level.LOW,
    }


def tools(state: State):
    call = state["messages"][-1].tool_calls[0]
    return {"messages": [ToolMessage(id="m-tool-1", content="5", tool_call_id=call["id"])]}


def approve(state: State):
    ok = interrupt({"question": "approve final answer?"})
    return {"approved": bool(ok)}


def route(state: State):
    return "tools" if state["messages"][-1].tool_calls else "approve"


g = StateGraph(State)
g.add_node("agent", agent)
g.add_node("tools", tools)
g.add_node("approve", approve)
g.add_edge(START, "agent")
g.add_conditional_edges("agent", route, {"tools": "tools", "approve": "approve"})
g.add_edge("tools", "agent")
g.add_edge("approve", END)


# ---- t3: a graph with a subgraph (checkpoint_ns is not empty for inner steps) ----
class SubState(TypedDict, total=False):
    text: str


def inner_a(state: SubState):
    return {"text": state.get("text", "") + " > inner_a"}


def inner_b(state: SubState):
    return {"text": state.get("text", "") + " > inner_b"}


sub = StateGraph(SubState)
sub.add_node("inner_a", inner_a)
sub.add_node("inner_b", inner_b)
sub.add_edge(START, "inner_a")
sub.add_edge("inner_a", "inner_b")
sub.add_edge("inner_b", END)

parent = StateGraph(SubState)
parent.add_node("prepare", lambda s: {"text": "start"})
parent.add_node("sub", sub.compile())
parent.add_edge(START, "prepare")
parent.add_edge("prepare", "sub")
parent.add_edge("sub", END)

out_path = sys.argv[1]
if os.path.exists(out_path):
    os.remove(out_path)
conn = sqlite3.connect(out_path, check_same_thread=False)
saver = SqliteSaver(conn)

app = g.compile(checkpointer=saver)
cfg1 = {"configurable": {"thread_id": "t1"}}
app.invoke({"messages": [HumanMessage(id="m-human-1", content="what is 2+3?")]}, cfg1)
app.invoke(Command(resume=True), cfg1)  # approve -> done

cfg2 = {"configurable": {"thread_id": "t2"}}
app.invoke({"messages": [HumanMessage(id="m-human-2", content="what is 2+3? (waiting)")]}, cfg2)  # stops at interrupt

papp = parent.compile(checkpointer=saver)
papp.invoke({"text": ""}, {"configurable": {"thread_id": "t3"}}, subgraphs=False)

# Make the file self-contained and free of leftover pages.
conn.commit()
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
conn.execute("PRAGMA journal_mode=DELETE")
conn.execute("VACUUM")
conn.close()
print("wrote", out_path)
