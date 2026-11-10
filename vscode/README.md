# graphtrail for VS Code

Open a LangGraph `SqliteSaver` database (`.sqlite`, `.sqlite3`, `.db`) read-only: right-click the file, choose "Open With...", then "graphtrail checkpoint viewer". The explorer gets a "graphtrail threads" tree (thread, then checkpoints); the editor shows the timeline, state changes and tool calls.

Nothing from the database is imported or executed, and the extension makes no network requests. See the main project README for details.
