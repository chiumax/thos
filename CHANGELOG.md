# Changelog

## 2026-02-18 — Workspaces with server-side folder browser

Added workspaces to group agents and tasks by project directory. Each workspace has a name and an absolute `cwd` path. Agents spawned within a workspace start their tmux session in that directory. The sidebar workspace switcher filters agents and tasks per-workspace, or shows everything in "All Workspaces" mode.

Creating a workspace uses a server-side folder browser — the browser sends `browse_directory` messages over WebSocket and the server responds with directory listings. This works over Tailscale since it doesn't rely on native file dialogs.

### Changes

- **`lib/types.ts`** — Added `Workspace` and `DirectoryEntry` interfaces. Added `workspaceId` to `AgentInfo`, `Task`, and `BrowserSpawn`. Added browser messages (`set_workspace`, `create_workspace`, `rename_workspace`, `delete_workspace`, `browse_directory`) and server messages (`workspace_list`, `directory_listing`). Also fixed pre-existing build errors: added `total_cost_usd` to `ClaudeResult`, added `"icebox"` to `TaskStatus`.

- **`server/workspace-store.ts`** — New file. JSON persistence for workspaces at `.thos/workspaces.json` with `loadAll()` and `saveSync()`.

- **`server/session-store.ts`** — Added `workspaceId: string | null` to `PersistedAgent.state`.

- **`server/ws.ts`** — Added `WorkspaceStore`, workspace state maps, and per-browser workspace scoping (`browserWorkspaceScope`). `buildAgentList()` and `buildTaskList()` now accept optional workspace filter. `broadcastAgentList()` and `broadcastTaskList()` send scoped data per-browser. `spawnClaude()` accepts `workspaceId` and starts tmux in the workspace's cwd. Added handlers for `set_workspace`, `create_workspace`, `rename_workspace`, `delete_workspace`, and `browse_directory`. Workspace cleanup on browser disconnect and persistence on shutdown. Also fixed pre-existing implicit `any` type on `verifyClient`.

- **`hooks/use-websocket.ts`** — Added workspace state (`workspaces`, `activeWorkspaceId`, `directoryListing`), handlers for `workspace_list` and `directory_listing` messages, and action functions (`setActiveWorkspaceId`, `createWorkspace`, `renameWorkspace`, `deleteWorkspace`, `browseDirectory`).

- **`components/dashboard/workspace-switcher.tsx`** — New component. Dropdown in the sidebar header showing the active workspace name and cwd. Lists all workspaces with inline rename and delete actions. "Open Folder..." triggers the folder browser modal.

- **`components/dashboard/folder-browser.tsx`** — New component. Modal dialog for browsing the server's filesystem. Shows breadcrumb navigation, directory listing (folders only, dotfiles hidden), parent directory navigation, and a name input that auto-fills with the directory basename.

- **`components/dashboard/agent-sidebar.tsx`** — Replaced the branding header with `WorkspaceSwitcher`. Added workspace props.

- **`app/dashboard/page.tsx`** — Wired workspace values from the hook to the sidebar and folder browser. Added `FolderBrowser` modal state.

- **`components/dashboard/task-card.tsx`** — Added `icebox` to status color, label, and cycle maps (pre-existing build fix).

- **`middleware.ts`** — Fixed `req.ip` type error for Next.js 16 compatibility.

## 2026-02-18 — Fix status message duplication on page reload

Reloading the browser caused "Done — X turns" and "Session started" status messages to stack up, appearing dozens of times. The server's message deduplication only covered `assistant` and `user` message types — `system/init` and `result` messages were always appended to history, so each reload replayed all of them.

### Changes

- **`server/ws.ts`** — Extended `getRelayMessageId()` to return stable dedup keys for `system/init` (keyed by `init:<session_id>`) and `result` (keyed by `result:<session_id>`) messages, so they replace rather than append in `messageHistory`.

## 2026-02-18 — Slash command autocomplete

Added a slash command autocomplete menu to the chat input. When the user types `/` as the first character, a dropdown appears above the input showing matching Claude Code commands. Commands are sent as text to the CLI which handles them natively; `/clear` is handled client-side.

### Changes

- **`components/dashboard/slash-command-menu.tsx`** — New component with a registry of 12 slash commands (commit, review-pr, clear, compact, cost, doctor, init, config, memory, status, model, help), each with an icon and description. Exports `filterCommands()` for case-insensitive substring matching and `SlashCommandMenu` dropdown component. Uses `onMouseDown` with `preventDefault` to prevent input blur on click.

- **`components/dashboard/chat.tsx`** — Integrated slash command detection: typing `/` triggers the menu, arrow keys navigate, Enter selects, Tab autocompletes the command name, Escape dismisses. Client-side commands (like `/clear`) call the appropriate handler directly; all others are sent as regular messages to the CLI. Added `onClearHistory` prop for the `/clear` command.

- **`app/dashboard/page.tsx`** — Wired `onClearHistory` callback to call `clearHistory(activeAgentId)` from the WebSocket hook.

## 2026-02-17 — Tool call result previews

Condensed tool groups showed which tools were called but not their results. Now each tool call displays a truncated one-line preview of its result inline, giving context without expanding the group. Previews show when collapsed; expanding still reveals the full messages.

### Changes

- **`lib/types.ts`** — Added optional `resultPreview` field to `ToolCallInfo`.

- **`hooks/use-websocket.ts`** — When building `ToolCallInfo` from assistant content blocks, pair each `tool_use` with its corresponding `tool_result` (matched by `tool_use_id`) and extract a truncated first-line preview (max 120 chars).

- **`components/dashboard/condensed-tool-group.tsx`** — When collapsed, render per-tool-call rows with a colored dot, tool name, and truncated result preview. Added color mapping for common tool names.

## 2026-02-17 — Kanban board for tasks

Replaced the task panel with a dual-mode view: a compact list (right sidebar, w-80) and a full-width kanban board. Toggle between modes via the header button. Added an Icebox column for parking ideas.

**List mode** — right sidebar alongside the chat, grouped by status (In Progress, Todo, Icebox, Done). Icebox and Done are collapsible. Cards are draggable between groups.

**Board mode** — replaces the chat area with four columns (Icebox, Todo, In Progress, Done). Cards drag between columns. Horizontally scrollable with min-width per column.

### Changes

- **`lib/types.ts`** — Added `"icebox"` to `TaskStatus` union for parking ideas/later items.

- **`components/dashboard/kanban-board.tsx`** — Unified `TaskPanel` component with list/board toggle. List mode renders grouped task sections with collapsible Icebox and Done. Board mode renders four kanban columns. Both modes support drag-and-drop between groups/columns. Exports `TaskViewMode` type.

- **`components/dashboard/task-card.tsx`** — Added icebox to status color map (purple), label map, and status cycling (icebox → todo).

- **`app/dashboard/page.tsx`** — Task view state is now `"hidden" | "list" | "board"`. List mode shows task panel as a right sidebar (w-80) alongside the chat. Board mode hides chat and gives the panel full width. The status bar toggle opens list mode; switching to board happens from within the panel header.

- **`components/dashboard/task-panel.tsx`** — Deleted. Replaced by unified `TaskPanel` in kanban-board.tsx.

## 2026-02-17 — Connection status toast

WebSocket reconnection happened silently. Added brief toast notifications when the connection drops ("Connection lost") and restores ("Reconnected") to build trust that the system is recovering. Toasts do not fire on the initial page load.

### Changes

- **`package.json`** — Added `sonner` for toast notifications.

- **`components/ui/sonner.tsx`** — New Toaster wrapper component with dark theme and monospace font.

- **`app/dashboard/page.tsx`** — Added `useEffect` watching `connected` state with a `hasConnectedRef` guard to skip the initial connection. Shows `toast.error` on disconnect and `toast.success` on reconnect. Renders `<Toaster />` in the page.

## 2026-02-17 — Fix duplicate "Session started" on follow-up messages

Sending a follow-up message to a running agent would re-display "Session started — model: ..., cwd: ..." in the chat. The CLI re-sends `system/init` on every turn, and the server was relaying and storing all of them.

### Changes

- **`server/ws.ts`** — Only relay the first `system/init` message per agent. Subsequent init messages (re-sent by CLI on each turn) are still used to update `sessionId` and status, but are no longer recorded in history or broadcast to browsers.

- **`hooks/use-websocket.ts`** — Changed `system/init` ChatMessage ID from `nextId()` (random) to `dedup-init-{session_id}` (stable) as a belt-and-suspenders safeguard.

## 2026-02-17 — Fix message duplication in chat

Claude CLI sends cumulative NDJSON snapshots for assistant messages (each line is a complete snapshot of the message so far). The server correctly deduplicates these in stored history, but the browser received every snapshot as a live relay and appended each one as a new ChatMessage, causing messages to appear 2-4x in the chat window. Also caused React duplicate key warnings.

### Changes

- **`hooks/use-websocket.ts`** — Added `getRelayDedupKey()` to extract stable message IDs from relay messages (assistant `message.id`, user `uuid`). Changed `relayChatMessage()` to use these stable IDs (prefixed with `dedup-`) instead of generating new random IDs for each snapshot. Updated the relay handler to replace existing ChatMessages with the same dedup ID instead of appending. Added `findLastRawIndex()` helper to also deduplicate raw messages in the debug view.

## 2026-02-17 — Message timestamps

Messages had no timestamps, making it hard to track conversation flow. Added relative timestamps ("just now", "2m ago", "1h ago") below each user and assistant message bubble, with absolute time shown on hover via the native tooltip.

### Changes

- **`components/dashboard/message.tsx`** — Added `formatRelativeTime()` utility and `RelativeTime` component that auto-updates every 30s. Renders below each user/assistant bubble as a small muted label. Uses `<time>` element with `title` for hover-to-see-absolute-time and `dateTime` for accessibility.

## 2026-02-17 — Agent cost/duration summary

Added a compact summary bar at the top of the chat area showing total cost, duration, turn count, and token usage for the active agent. Stats are extracted from `result` messages in the raw NDJSON stream.

### Changes

- **`components/dashboard/agent-summary.tsx`** — New component that scans raw Claude messages for `result` entries and displays total cost (last result's cumulative `total_cost_usd`), total duration (summed `duration_ms`), total turns (summed `num_turns`), and total token usage (summed from each result's `usage` object) in a slim bar with icons. Hovering the token count shows a breakdown of input, output, cache read, and cache write tokens. Only renders when result data is available.

- **`components/dashboard/chat.tsx`** — Added `AgentSummary` between the status bar and the scrollable message area.

- **`lib/types.ts`** — Added `total_cost_usd` field to `ClaudeResult` (the actual field name used by the CLI, alongside the existing `cost_usd`).

- **`hooks/use-websocket.ts`** — Updated result summary text to prefer `total_cost_usd` over `cost_usd`.

## 2026-02-17 — Empty state for chat area

When no agent is selected, the chat area showed only a single line of text. Replaced it with a proper empty state featuring a terminal icon, descriptive copy, and quick-reference cards for Chat and Tasks features.

### Changes

- **`components/dashboard/chat.tsx`** — Replaced the minimal "Type a prompt to spawn a Claude agent" text with a centered empty state panel showing a terminal icon, heading, description, and two feature hint cards (Chat, Tasks). Added `Terminal`, `MessageSquare`, and `ListTodo` icon imports from lucide-react.

## 2026-02-17 — Copy message button

No way to copy a message's content. A small copy icon on hover makes it easy.

### Changes

- **`components/dashboard/message.tsx`** — Added a `CopyButton` component that appears in the top-right corner of user and assistant message bubbles on hover. Uses `navigator.clipboard.writeText` and shows a checkmark for 1.5s after copying. The message bubble gets `group relative` classes to support the hover reveal.

## 2026-02-17 — Archive agent when task marked as complete

When a task with a linked agent was marked as "done", the agent kept running. Now the server automatically stops (archives) the linked agent when the task status is set to "done".

### Changes

- **`server/ws.ts`** — In the `update_task` handler, after persisting and broadcasting the task update, check if the task was marked "done" and has a linked `agentId`. If so, call `stopAgent()` to kill the tmux session and set the agent to "done" status.

## 2026-02-17 — Edit todo functionality

Task editing was only accessible via a hidden double-click gesture on the title, making it hard to discover.

### Changes

- **`components/dashboard/task-card.tsx`** — Added explicit edit button (pencil icon) to the task card hover actions, visible alongside delegate and delete buttons. Edit mode now includes an inline priority selector so all task fields (title, description, priority) can be edited in one pass. Double-click on title still works as a shortcut. All edit state (title, description, priority) is properly initialized when entering edit mode from either entry point.

## 2026-02-17 — Improved tool approval window

The tool approval card was too small (`max-w-lg`) and showed raw JSON, making it hard to review tool inputs before approving.

### Changes

- **`components/dashboard/control-request.tsx`** — Redesigned the tool approval card:
  - Wider layout (`max-w-2xl`)
  - Header row with shield icon, formatted tool name, and full name for namespaced tools
  - Individual input parameters displayed as labeled fields instead of raw JSON dump
  - Long string values (commands, file contents) render in scrollable code blocks
  - Short strings render as inline `<code>` elements
  - Allow/Deny buttons now have icons (Check/X) and Deny uses `outline` variant instead of `destructive`
  - Resolved state shows a colored pill badge ("Allowed" / "Denied") instead of generic "Resolved" text
  - Dimmed styling when resolved to reduce visual noise
  - Shows `description` field from the protocol when available

- **`lib/types.ts`** — Added optional `description` field to `ChatMessage.controlRequest` type.

- **`hooks/use-websocket.ts`** — Pass through `description` from `ClaudeControlRequest` to the `ChatMessage` control request payload.

## 2026-02-17 — Fix initial message missing from chat history

When spawning a new agent, the initial user prompt was sent to the CLI but never recorded in `messageHistory` or relayed to the browser. This meant the first message never appeared in the chat view, and was also missing after page reloads.

### Changes

- **`server/ws.ts`** — Added `recordAndSend()` calls in both prompt delivery paths (direct CLI connect and `hook_response` fallback) so the initial user message is stored in history and broadcast to browsers, matching the behavior of follow-up `send_message` handling.

## 2026-02-16 — Markdown rendering

**Task:** [#58300471] Markdown rendering

Assistant messages were rendered as plain text, so markdown output from Claude (code blocks, headers, lists, bold, tables) showed as raw syntax.

### Changes

- **`package.json`** — Added `react-markdown` (v10.1.0) and `remark-gfm` (v4.0.1) for markdown parsing with GitHub Flavored Markdown support (tables, strikethrough, task lists, autolinks).

- **`components/dashboard/message.tsx`** — Assistant messages now render through `<Markdown remarkPlugins={[remarkGfm]}>` instead of plain text. User messages remain plain text with `whitespace-pre-wrap`. System messages unchanged.

- **`app/globals.css`** — Added `.prose-msg` class with styles for all markdown elements:
  - Headings (h1–h4), bold/strong
  - Inline code (subtle background) and fenced code blocks (darker background, horizontal scroll)
  - Ordered and unordered lists with nested list support
  - Blockquotes (left border accent, muted color)
  - Links (primary color, underlined)
  - Tables (collapsed borders, header background)
  - Horizontal rules, images
  - Light theme overrides for backgrounds and borders
