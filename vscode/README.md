# graphtrail for VS Code

Open a LangGraph `SqliteSaver` database (`.sqlite`, `.sqlite3`, `.db`) read-only: right-click the file, choose "Open With...", then "graphtrail checkpoint viewer". The explorer gets a "graphtrail threads" tree (thread, then checkpoints); the editor shows the timeline, state changes and tool calls.

Nothing from the database is imported or executed, and the extension makes no network requests. See the main project README for details.

The display language (English or Korean) follows the VS Code display language; set `graphtrail.language` to `en` or `ko` to override it. The setting changes the tree, the report and dialogs; command and view names always follow the VS Code display language.
