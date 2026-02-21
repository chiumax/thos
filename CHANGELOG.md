# Changelog

## 2026-03-03 — Custom scrollbar styling

Styled all scrollbars to be thin (6px) with subtle translucent thumbs and transparent tracks. Thumbs brighten on hover. Uses both `scrollbar-width`/`scrollbar-color` (Firefox) and `::-webkit-scrollbar` pseudo-elements (Chrome/Safari/Edge). Light theme overrides included.

### Changes

- **`app/globals.css`** — Added `scrollbar-width: thin` and `scrollbar-color` to the universal `*` selector. Added `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb`, `::-webkit-scrollbar-thumb:hover`, and `::-webkit-scrollbar-corner` rules. Light theme overrides via `.light` selectors.

## Known limitations — Connection resilience

When the laptop sleeps or internet drops, two things can break independently:

1. **Browser ↔ thos WS server** — Auto-reconnects after 2s (`use-websocket.ts` `onclose` handler). On reconnect the server re-sends `agent_list` + `task_list`, and message histories are lazy-loaded per agent. This path is already resilient.

2. **Claude CLI ↔ Anthropic API** — If the CLI's HTTP request to Anthropic fails mid-stream (laptop sleep, network drop), that's between the CLI process and Anthropic's servers. thos has no visibility into it and can't retry on the CLI's behalf.

**Double-sending a message** does not help — the server queues messages in `pendingMessages` and flushes all of them when the CLI reconnects, so a duplicate prompt gets sent twice and likely confuses Claude.

### Possible future improvements

- **Heartbeat on the CLI socket** — `ws.ping()` with a timeout to detect dead CLI connections faster than TCP keepalive (which can take minutes). Surface a "stale" status on the dashboard.
- **Track `keep_alive` timestamps** — Claude CLI already sends `keep_alive` messages (`server/ws.ts` line 575). Could track last-seen time per agent and flag agents that go silent.
- **Deduplicate outgoing user messages** — Prevent accidental double-sends from being queued and flushed as two separate prompts.

## 2026-02-27 — Move agent to workspace

Added a "Move to…" option in the agent sidebar context menu that lets you reassign an agent to a different workspace (or unassign it entirely).

- Right-click an agent → hover "Move to…" → pick a workspace from the submenu
- Lists all workspaces except the agent's current one
- "No workspace" option appears when the agent is already assigned
- New `move_agent` WebSocket message type, server handler, and hook callback
- `AgentClientState` now tracks `workspaceId` from the server

### Changes

- **`lib/types.ts`** — Added `BrowserMoveAgent` interface + union member
- **`server/ws.ts`** — Added `move_agent` case handler
- **`hooks/use-websocket.ts`** — Added `workspaceId` to `AgentClientState`, `moveAgent` callback
- **`app/dashboard/page.tsx`** — Pass `onMoveAgent` to sidebar
- **`components/dashboard/agent-sidebar.tsx`** — New `onMoveAgent` prop, `ContextMenuSub` hover submenu component, "Move to…" menu item

## 2026-02-27 — IDE-like collapsible diffs + agent sidebar improvements

### Collapsible diffs

Diffs now render with an IDE-style collapsible file header and start **collapsed by default**. The header shows the tool type dot, tool name, file basename (full path on hover), and +/- line change counts. Click to expand and see the full syntax-highlighted diff.

- Diffs in messages and the diffs panel start collapsed
- Diffs toggled open in condensed tool groups start expanded (since user explicitly opened them)

### Agent sidebar

Each agent row now shows the agent ID and workspace name below the label.

### Changes

- **`components/dashboard/diff-viewer.tsx`** — Added collapsible header bar with chevron, tool dot, basename, +/- counts. New `defaultExpanded` prop (defaults to `false`). Diff content only renders when expanded.
- **`components/dashboard/condensed-tool-group.tsx`** — Pass `defaultExpanded` to `DiffViewer` when user toggles a diff open
- **`components/dashboard/agent-sidebar.tsx`** — Show agent ID and workspace name below label in each agent row

## 2026-02-26 — Virtualized chat message list

Replaced the plain scrollable div with react-virtuoso for the processed chat view. Only ~20-30 message DOM nodes are mounted at any time regardless of total message count, significantly improving performance for long agent sessions with hundreds of messages.

- Auto-scrolls to bottom when at the latest message; stops following when you scroll up to read older messages
- "Latest" button appears when scrolled away from bottom
- Starts at the bottom (most recent messages) when loading a chat
- Empty state and context usage card use Virtuoso's built-in EmptyPlaceholder and Footer components
- Raw message view (debug) remains non-virtualized

### Changes

- **`package.json`** — Added `react-virtuoso` dependency
- **`components/dashboard/chat.tsx`** — Replaced scroll container with `<Virtuoso>`. Removed manual `scrollRef` and auto-scroll `useEffect`. Added `atBottom` state for smart follow-output, `VirtuosoHandle` ref for scroll-to-bottom button, and `initialTopMostItemIndex` for starting at the bottom. Spacing migrated from `space-y-2` to per-item `pb-2` wrapper with a `Header` component for top padding.
- **`components/dashboard/message.tsx`** — Wrapped `Message` in `React.memo` to skip re-renders when props haven't changed (avoids re-running react-markdown on every parent update)
- **`components/dashboard/control-request.tsx`** — Wrapped `ControlRequest` in `React.memo`
- **`components/dashboard/condensed-tool-group.tsx`** — Wrapped `CondensedToolGroup` in `React.memo`
- **`components/dashboard/user-question.tsx`** — Wrapped `UserQuestion` in `React.memo`

## 2026-02-19 — Context usage visual card

The `/context` slash command output is now rendered as a styled card instead of raw markdown tables. Shows model badge, token usage progress bar, stacked category breakdown with colored bars, and collapsible sections for memory files and skills.

### Changes

- **`components/dashboard/context-usage-card.tsx`** — New component: parses `/context` CLI markdown output into structured data and renders a visual card with progress bars, category breakdown, and collapsible memory/skills sections
- **`components/dashboard/message.tsx`** — Detect context usage responses and route to `ContextUsageCard` instead of default markdown rendering

## 2026-02-19 — Pinned agents, icebox, + recency sort in sidebar

Agent sidebar now has four sections: **Pinned**, **Active**, **Icebox**, and **Archived**. Agents within each section are sorted by creation time (most recent first). Pin/Unpin and Icebox/Un-icebox are available via right-click context menu. Both states persist across server restarts.

- **Pinned** — Agents you want quick access to, always at the top.
- **Active** — Non-pinned agents that are currently spawning/connected/thinking.
- **Icebox** — Agents you want to return to later but aren't working on now (dimmed).
- **Archived** — Finished/disconnected/errored agents (dimmed).

### Changes

- **`lib/types.ts`** — Added `pinned` and `iceboxed` fields to `AgentInfo`, added `BrowserPinAgent` and `BrowserIceboxAgent` message types
- **`server/session-store.ts`** — Added `pinned` and `iceboxed` to `PersistedAgent` state
- **`server/ws.ts`** — Added `pinned` and `iceboxed` to `AgentState`, handle `pin_agent` and `icebox_agent` messages, include in `buildAgentList` and `toPersistedAgent`, restore from disk
- **`hooks/use-websocket.ts`** — Added `pinned` and `iceboxed` to `AgentClientState`, sync from `agent_list`, expose `pinAgent` and `iceboxAgent` actions
- **`components/dashboard/agent-sidebar.tsx`** — Four-section layout (Pinned/Active/Icebox/Archived), recency sort within each, Pin/Unpin and Icebox/Un-icebox in context menu, pin and snowflake icon indicators
- **`app/dashboard/page.tsx`** — Wire `pinAgent` and `iceboxAgent` to sidebar props

## 2026-02-19 — Model selector in status bar

Added a model selector dropdown to the status bar. Shows the active agent's model name and lets you choose which model to use for the next spawn. Includes presets for Claude Sonnet 4, Opus 4, Qwen3 Coder (Ollama), and Devstral (Ollama), plus a custom model input. Enables Ollama/local model support via Claude Code's `--model` flag.

### Changes

- **`lib/types.ts`** — Added `model` field to `AgentInfo` and `BrowserSpawn`
- **`server/session-store.ts`** — Added `model` to `PersistedAgent` state
- **`server/ws.ts`** — Store model on `AgentState`, capture from `system/init`, pass `--model` flag to spawned CLI, include in `buildAgentList`, persist/restore model
- **`hooks/use-websocket.ts`** — Added `model` to `AgentClientState`, extract from `system/init` relay and `agent_list`, expose `activeModel`, pass model in spawn message
- **`components/dashboard/status-bar.tsx`** — Model display with short labels, dropdown selector with presets and custom input, click-outside/Escape dismiss
- **`components/dashboard/chat.tsx`** — Pass `activeModel`, `selectedModel`, `onModelChange` through to StatusBar
- **`app/dashboard/page.tsx`** — `selectedModel` state, wire model props to Chat, pass selected model on spawn

## 2026-02-18 — Single submit button + "Other" option for questions

When Claude asks multiple questions at once, the UI now shows a single shared "Submit" button at the bottom instead of one per question. Each question also has an "Other" chip that reveals a freeform text input, matching Claude Code's built-in behavior.

### Changes

- **`components/dashboard/user-question.tsx`** — Lifted selection state into the parent `UserQuestion` for a single submit button. Added "Other" chip per question with a text input that appears when active. For single-select, picking "Other" clears predefined selections and vice versa. For multi-select, "Other" can be combined with predefined options.

## 2026-02-18 — Diff comments

Click a line number in any diff to open an inline comment input. Type a comment and press Enter — it gets sent to the active Claude session as a message with file path, line number, and code context. Works in the diffs panel, condensed tool groups, and standalone message diffs.

### Changes

- **`components/dashboard/diff-viewer.tsx`** — Added `onComment` prop and `onLineNumberClick` handler. Shows inline comment bar below the diff with file:line context, send/cancel buttons, Enter to submit, Escape to dismiss.
- **`components/dashboard/diffs-panel.tsx`** — Thread `onSendMessage` → `DiffViewer.onComment`
- **`components/dashboard/condensed-tool-group.tsx`** — Thread `onSendMessage` → `DiffViewer.onComment`
- **`components/dashboard/message.tsx`** — Thread `onSendMessage` → `DiffViewer.onComment`
- **`components/dashboard/chat.tsx`** — Pass `onSendMessage` to `Message` and `CondensedToolGroup`
- **`app/dashboard/page.tsx`** — Pass `sendMessage` to `DiffsPanel` as `onSendMessage`

## 2026-02-18 — Add SFX for user message send

Added a "select" sound effect that plays when the user sends a message in the chat.

### Changes

- **`lib/sfx.ts`** — Added `send` pool with `select-{001..003}` sounds, new `sfxSend()` export, and "Message Send" category in `SFX_CATEGORIES`.

- **`lib/select-{001..003}.ts`** — New sound assets (installed via `npx shadcn add @soundcn/select-{001..003}`).

- **`hooks/use-websocket.ts`** — Call `sfxSend()` in the `sendMessage` callback when the user sends a message.

## 2026-02-18 — Swap Bash and Session Start SFX + fix duplicate key warning

Replaced Bash sounds (computer-noise → glitch) and Session Start sounds (begin/power-up → maximize) for better feel. Fixed React duplicate key warning in condensed tool groups.

### Changes

- **`lib/sfx.ts`** — Swapped Bash pool from `computer-noise-{000..003}` to `glitch-{001..004}` (digital glitch sounds). Swapped Session Start pool from `begin`/`power-up-1` to `maximize-{001..004}` (window-open rising tones).

- **`lib/glitch-{001..004}.ts`** — New sound assets (installed via `npx shadcn add @soundcn/glitch-{001..004}`).

- **`lib/maximize-{001..004}.ts`** — New sound assets (installed via `npx shadcn add @soundcn/maximize-{001..004}`).

- **`components/dashboard/condensed-tool-group.tsx`** — Fixed React duplicate key warning by appending index to `toolUseId` in the key prop (`${tc.toolUseId}-${i}`), preventing collisions when the same tool_use_id appears in cumulative snapshots.

## 2026-02-18 — SFX settings panel

Added a sound settings modal accessible from the Volume2 icon in the status bar. Lets you inspect, preview, and configure all sound categories.

Features:
- Master volume slider + mute-all toggle
- Per-category rows with colored dots, labels, tool descriptions
- Per-category volume slider and enable/disable checkbox
- Preview button plays a random sound from that category's pool
- Settings persisted to localStorage (`thos-sfx-settings`)
- Respects all settings in real-time — muted categories are silent, volumes scale with master

### Changes

- **`lib/sfx.ts`** — Refactored to settings-aware architecture. Added `SfxSettings` type, `SFX_CATEGORIES` registry, `getSfxSettings()`/`setSfxSettings()` with localStorage persistence, `sfxPreview()` for the settings UI. All `sfx*` functions now check enabled state and multiply category volume by master volume.

- **`components/dashboard/sfx-settings.tsx`** — New modal component. Master volume row, 8 category rows with color dot, label, description, volume slider, preview button, and enable/disable checkbox. Follows FolderBrowser modal pattern. Closes on Escape and click-outside.

- **`components/dashboard/status-bar.tsx`** — Added Volume2 icon button next to the existing toggles. Passes `onOpenSfxSettings` callback.

- **`components/dashboard/chat.tsx`** — Added `onOpenSfxSettings` prop, passed through to StatusBar.

- **`app/dashboard/page.tsx`** — Added `sfxSettingsOpen` state and `<SfxSettings>` modal render.

## 2026-02-18 — Diff viewer with sidebar panel

File diffs render inline in the chat view and in a dedicated sidebar panel using `@pierre/diffs`. When Claude edits or writes files, the old/new content is shown as a syntax-highlighted diff. In condensed tool groups, click a file name to expand the diff. The diffs panel (toggle via status bar) collects all file changes from the session, grouped by file path.

### Changes

- **`@pierre/diffs`** — Added as dependency for diff rendering (`MultiFileDiff` component)
- **`lib/types.ts`** — Added optional `input` field to `ToolCallInfo` to carry tool input data for Edit/Write/MultiEdit
- **`hooks/use-websocket.ts`** — Preserve tool input in `relayChatMessage()` for diff-capable tools
- **`components/dashboard/diff-viewer.tsx`** — New component wrapping `MultiFileDiff`, handles Edit (old→new), Write (empty→new), and MultiEdit (concatenated hunks). Skips diffs over 100KB.
- **`components/dashboard/diffs-panel.tsx`** — New sidebar panel collecting all file diffs from the session, grouped by file path with collapsible sections per file
- **`components/dashboard/condensed-tool-group.tsx`** — Per-tool-call expandable diffs in collapsed view, shows file basename
- **`components/dashboard/message.tsx`** — Inline diffs for standalone assistant messages with file-modifying tool calls
- **`components/dashboard/status-bar.tsx`** — Added diffs toggle button (GitCompareArrows icon)
- **`components/dashboard/chat.tsx`** — Thread `showDiffs`/`onToggleDiffs` props to StatusBar
- **`app/dashboard/page.tsx`** — Added `showDiffs` state, diffs panel drawer (w-96, right side), mobile backdrop

## 2026-02-18 — SFX on everything

Every agent event now has a sound effect — different sound pools per tool type, plus sounds for session start, task completion, errors, and control requests. Random variant selection from each pool keeps it from getting monotonous. All sounds from soundcn (Kenney, CC0 licensed), embedded as base64 data URIs using the Web Audio API.

Sound mapping:
- **Write / Edit / MultiEdit** — impact-generic-light (percussive hit)
- **Read** — click (soft tap)
- **Bash** — computer-noise (electronic blip)
- **Grep / Glob / search tools** — tick (quick scan)
- **Session start** — begin / power-up
- **Task result (success)** — confirmation chime
- **Error** — error buzz
- **Control request / question** — question tone

### Changes

- **`lib/sfx.ts`** — New file. Central SFX module with sound pools mapped to tool names and event types. Exports `sfxTool()`, `sfxDone()`, `sfxError()`, `sfxQuestion()`, `sfxBegin()`. Each picks a random variant from the pool and plays via `playSound()` at calibrated volumes.

- **`hooks/use-websocket.ts`** — Replaced old code-write-only SFX with full coverage. Imports from `lib/sfx.ts`. Triggers: `sfxTool()` on every relay with tool calls (first tool in message), `sfxDone()`/`sfxError()` on result messages, `sfxQuestion()` on control requests, `sfxBegin()` on session init, `sfxError()` on error messages.

- **`hooks/use-sound.ts`** — New file (installed via `npx shadcn add @soundcn/use-sound`). React hook for declarative sound playback using Web Audio API.

- **`lib/sound-engine.ts`** — New file (installed via soundcn). Shared AudioContext singleton, base64 decoding with buffer cache, and imperative `playSound()` function.

- **`lib/sound-types.ts`** — New file (installed via soundcn). TypeScript interfaces for `SoundAsset`, `UseSoundOptions`, and `UseSoundReturn`.

- **Sound assets** (all installed via `npx shadcn add @soundcn/...`):
  - `lib/impact-generic-light-{000..004}.ts` — 5 impact sounds
  - `lib/click-{soft,001..004}.ts` — 5 click sounds
  - `lib/computer-noise-{000..003}.ts` — 4 computer noise sounds
  - `lib/tick-{001,002,004}.ts` — 3 tick sounds
  - `lib/confirmation-{001..004}.ts` — 4 confirmation sounds
  - `lib/error-{001..003}.ts` — 3 error sounds
  - `lib/question-{001..003}.ts` — 3 question sounds
  - `lib/begin.ts`, `lib/power-up-1.ts` — 2 session start sounds

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
