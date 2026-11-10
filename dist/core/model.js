/** Shared types of the graphtrail core. Nothing in here executes or constructs user code. */
export class NotCheckpointDbError extends Error {
    name = "NotCheckpointDbError";
}
export class NotFoundError extends Error {
    name = "NotFoundError";
}
