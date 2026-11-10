# How LangGraph stores a run in SQLite

This is the format graphtrail reads (checked against `langgraph-checkpoint-sqlite` 3.1.3 for Python and `@langchain/langgraph-checkpoint-sqlite` 1.1.0 for JS, 2026-11-10). Everything here can be seen with `sqlite3 file.sqlite .schema`.

## Two tables

| table | one row is | key columns |
|---|---|---|
| `checkpoints` | a snapshot of the whole graph state after one step | `thread_id`, `checkpoint_ns`, `checkpoint_id`, `parent_checkpoint_id`, `type`, `checkpoint`, `metadata` |
| `writes` | one value a task produced while running *from* that checkpoint | `thread_id`, `checkpoint_ns`, `checkpoint_id`, `task_id`, `idx`, `channel`, `type`, `value` (+ `task_path` in newer versions) |

- **thread**: one conversation or run, named by `thread_id`.
- **parent chain**: `parent_checkpoint_id` links each checkpoint to the one before it. The first one has no parent. `metadata.step` counts up from -1 (the input) and `metadata.source` is `input`, `loop`, `update` or `fork`.
- **namespace**: `checkpoint_ns` is empty for the root graph. A subgraph writes its own chain under a name such as `sub:<task id>`.
- **where is the node name?** Not stored. The writes under a checkpoint belong to the tasks that ran next. graphtrail estimates the node from `versions_seen` of the following checkpoint (the node whose seen versions moved). The output says "estimated".

## Blob encodings (`type` column)

| `type` | written by | how graphtrail reads it |
|---|---|---|
| `msgpack` | Python | msgpack with extension types, see below |
| `json` | JS | JSON text; LangChain `{"lc":1,"type":"constructor","id":[...],"kwargs":{...}}` envelopes become tags |
| `bytes`, `bytearray` | either | reported as `{"$bytes": n}` |
| `null` | either | `null` |
| `pickle` (and anything else) | Python with pickle fallback enabled | **never interpreted**: `{"$unsupported":"pickle","bytes":n}` |

`metadata` is always JSON text.

## msgpack extension types

| code | `$ext` | payload `[module, name, ...]` | what the Python side would do on load (graphtrail does not) |
|---|---|---|---|
| 0 | `ctor_single_arg` | `[module, name, arg]` | `module.name(arg)` |
| 1 | `ctor_pos_args` | `[module, name, [args]]` | `module.name(*args)` |
| 2 | `ctor_kw_args` | `[module, name, {kwargs}]` | `module.name(**kwargs)` |
| 3 | `method_single_arg` | `[module, name, arg, method]` | `module.name.method(arg)` |
| 4 | `pydantic_v1` | `[module, name, {fields}]` | model construction |
| 5 | `pydantic_v2` | `[module, name, {fields}, method]` | `module.name.method(...)` |
| 6 | `numpy_array` | `[dtype, shape, order, bytes]` | array rebuild |
| 7 | `delta_snapshot` | opaque | shown as a marker; values are not reconstructed |

Loading these with the library imports the named module and calls the named constructor, which is why opening an untrusted checkpoint file with `get_state_history()` can run code. graphtrail only prints the tag:

```json
{ "$type": "demo_types.Budget", "$ext": "ctor_kw_args", "value": { "used": 3, "limit": 10 } }
```

## Interrupts and resume

A pause is a write on the channel `__interrupt__` under the checkpoint of the task that asked. Resume values are written on `__resume__` by the task id `00000000-0000-0000-0000-000000000000` (the null task), which graphtrail does not count as a node run.

## Not covered yet

Postgres storage (`checkpoint_blobs` join), delta channel reconstruction and fork trees. A database with several leaves shows the chain of the newest one and prints a warning.

Timeline columns: each row is the step that runs from that checkpoint to the next one. `nodes` and `changed keys` both describe that step (changed keys = this checkpoint vs. its child). The last row has no child, so both are `-`.
