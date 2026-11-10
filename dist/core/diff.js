/** State comparison and message helpers. Pure functions over already decoded (tagged) data. */
import { isTagged } from "./decode.js";
/** JSON with sorted keys, used to compare values and to keep exports deterministic. */
export function stable(value) {
    return JSON.stringify(sortKeys(value)) ?? "null";
}
export function sortKeys(value) {
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            Object.defineProperty(out, key, {
                value: sortKeys(value[key]),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        return out;
    }
    return value;
}
function fieldsOf(message) {
    if (isTagged(message)) {
        return message.value !== null && typeof message.value === "object" ? message.value : null;
    }
    if (message !== null && typeof message === "object" && !Array.isArray(message))
        return message;
    return null;
}
/** `AIMessage`, `ToolMessage`, ... (last segment of the type), or null when it is not a tagged message. */
export function messageKind(message) {
    if (!isTagged(message))
        return null;
    const last = message.$type.split(".").at(-1) ?? "";
    return last.endsWith("Message") || last.endsWith("MessageChunk") ? last : null;
}
export function messageId(message) {
    const id = fieldsOf(message)?.id;
    return typeof id === "string" ? id : null;
}
export function extractToolCalls(message) {
    const calls = fieldsOf(message)?.tool_calls;
    if (!Array.isArray(calls))
        return [];
    return calls.flatMap((c) => {
        if (c === null || typeof c !== "object")
            return [];
        const call = c;
        return [{ id: typeof call.id === "string" ? call.id : null, name: String(call.name ?? "?"), args: call.args ?? null }];
    });
}
export function extractToolResult(message) {
    if (messageKind(message) !== "ToolMessage")
        return null;
    const fields = fieldsOf(message);
    if (fields === null)
        return null;
    return {
        toolCallId: typeof fields.tool_call_id === "string" ? fields.tool_call_id : null,
        content: fields.content ?? null,
    };
}
function asMessageList(value) {
    if (Array.isArray(value))
        return value;
    return value === undefined || value === null ? [] : [value];
}
export function messageDelta(before, after) {
    const a = asMessageList(before);
    const b = asMessageList(after);
    const beforeIds = new Set(a.map(messageId).filter((x) => x !== null));
    const beforeRaw = new Set(a.map(stable));
    const afterIds = new Set(b.map(messageId).filter((x) => x !== null));
    const added = b.filter((m) => {
        const id = messageId(m);
        return id !== null ? !beforeIds.has(id) : !beforeRaw.has(stable(m));
    });
    return {
        added,
        addedIds: added.map(messageId).filter((x) => x !== null),
        removedIds: [...beforeIds].filter((id) => !afterIds.has(id)),
    };
}
/** Match every tool call with the ToolMessage that answers it (same tool_call_id). */
export function pairToolCalls(messages, scope) {
    const results = new Map();
    for (const m of messages) {
        const r = extractToolResult(m);
        if (r?.toolCallId)
            results.set(r.toolCallId, r.content);
    }
    const pairs = [];
    for (const m of messages) {
        for (const call of extractToolCalls(m)) {
            const hasResult = call.id !== null && results.has(call.id);
            if (!hasResult)
                continue;
            const resultMessage = messages.find((x) => extractToolResult(x)?.toolCallId === call.id);
            if (scope && !scope.has(m) && !scope.has(resultMessage))
                continue;
            pairs.push({ id: call.id, name: call.name, args: call.args, result: results.get(call.id) });
        }
    }
    return pairs;
}
export function diffStates(a, b) {
    const keys = [...new Set([...Object.keys(a.channelValues), ...Object.keys(b.channelValues)])]
        .filter((k) => !isInternalChannel(k))
        .sort();
    const changes = [];
    for (const key of keys) {
        const inA = key in a.channelValues;
        const inB = key in b.channelValues;
        const before = a.channelValues[key];
        const after = b.channelValues[key];
        if (inA && inB && stable(before) === stable(after))
            continue;
        if (key === "messages") {
            changes.push({ key, kind: !inA ? "added" : !inB ? "removed" : "changed" });
        }
        else if (!inA) {
            changes.push({ key, kind: "added", after });
        }
        else if (!inB) {
            changes.push({ key, kind: "removed", before });
        }
        else {
            changes.push({ key, kind: "changed", before, after });
        }
    }
    const messages = messageDelta(a.channelValues.messages, b.channelValues.messages);
    const allAfter = asMessageList(b.channelValues.messages);
    return {
        from: { step: a.step, checkpointId: a.checkpointId },
        to: { step: b.step, checkpointId: b.checkpointId },
        changes,
        messages,
        toolPairs: pairToolCalls(allAfter, new Set(messages.added)),
    };
}
/** Engine bookkeeping channels (`__start__`, `branch:to:<node>`, ...) are not user state. */
export function isInternalChannel(key) {
    return key.startsWith("__") || key.startsWith("branch:to:");
}
