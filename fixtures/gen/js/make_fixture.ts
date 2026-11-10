// Build fixtures/js-agent.sqlite with the real LangGraph.js SqliteSaver.
// Same scenario as the Python fixture (agent -> tools -> agent -> approve), no LLM, no API key:
// the "model" is a scripted function. Practice data only.
//
// Usage: npm install && npm run make
import { rmSync } from "node:fs";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { Annotation, Command, END, interrupt, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

const outPath = process.argv[2];
if (!outPath) throw new Error("usage: node make_fixture.ts <out.sqlite>");
for (const suffix of ["", "-wal", "-shm"]) rmSync(outPath + suffix, { force: true });

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  approved: Annotation<boolean>(),
});

const agent = (s: typeof State.State) => {
  const hasTool = s.messages.some((m) => m.getType() === "tool");
  return {
    messages: [
      hasTool
        ? new AIMessage({ id: "m-ai-2", content: "The answer is 5." })
        : new AIMessage({
            id: "m-ai-1",
            content: "",
            tool_calls: [{ name: "add", args: { a: 2, b: 3 }, id: "call_1" }],
          }),
    ],
  };
};
const tools = () => ({
  messages: [new ToolMessage({ id: "m-tool-1", content: "5", tool_call_id: "call_1" })],
});
const approve = () => {
  const ok = interrupt({ question: "approve final answer?" });
  return { approved: Boolean(ok) };
};

const saver = SqliteSaver.fromConnString(outPath);
const app = new StateGraph(State)
  .addNode("agent", agent)
  .addNode("tools", tools)
  .addNode("approve", approve)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", (s) => ((s.messages.at(-1) as AIMessage).tool_calls?.length ? "tools" : "approve"), ["tools", "approve"])
  .addEdge("tools", "agent")
  .addEdge("approve", END)
  .compile({ checkpointer: saver });

const cfg = { configurable: { thread_id: "t1" } };
await app.invoke({ messages: [new HumanMessage({ id: "m-human-1", content: "what is 2+3?" })] }, cfg);
await app.invoke(new Command({ resume: true }), cfg);
console.log("wrote", outPath);
