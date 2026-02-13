# thos

**the orchestrator you never knew you needed**

A visual orchestration layer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Not another IDE — a UI that sits on top of the terminal-based agents you already use, solving the real friction of working with them day-to-day.

## The Problem

AI coding agents are powerful, but the experience of *using* them has real gaps:

- **You lose track of what's happening.** Multiple agents running across tasks, and you're tab-switching and scrolling terminals to figure out who's doing what. The visibility problem compounds fast.

- **Agents are smart but have the memory of an infant.** Your workflows are specific to you — your project structure, your preferences, your domain knowledge. The agent doesn't retain any of it between sessions. You end up re-explaining the same context over and over. A static CLAUDE.md helps, but it doesn't learn from your conversations or evolve with your codebase.

- **Your machine is the bottleneck.** You have a laptop, not a build server. Agents want to compile, test, run — and your local machine can't keep up.

- **Undoing things is painful.** Agent makes a wrong turn, and now you're doing forensics. Better change tracking, rollback, and context management should be table stakes — not an afterthought.

- **Task management is manual.** Coordinating what gets done, in what order, across which agents — that's on you, in your head, with no tooling to help.

## What thos Is

thos is a UI wrapper around Claude Code. Terminals are fine — but when you're orchestrating work across agents, you need something more visual.

Think of it as a control plane:

- **Agent dashboard** — see what every agent is doing, in real time, at a glance
- **Persistent memory** — agents that learn from your conversations and retain domain knowledge across sessions. Not just saved prompts — context that evolves with your codebase and workflows, so the first time you explain something is the last time.
- **Change management** — track, diff, and roll back agent-generated changes with confidence
- **Task orchestration** — assign, sequence, and track work across agents
- **Remote access** — web UI accessible via localhost, with the option to expose over your network as needed

## What thos Is Not

- **Not an IDE.** VS Code, Cursor, Zed — these are well-engineered. thos doesn't compete with them; it complements them.
- **Not a terminal replacement.** The terminal is the execution layer. thos is the visibility and coordination layer on top.
- **Not a general agent framework.** Focused on Claude Code first. Breadth comes later, if it makes sense.

## Prior Art

Similar space as [superset.sh](https://superset.sh) and [Conductor](https://conductor.sh) — tools that recognize the gap between raw agent capability and the UX of actually orchestrating agent work.

## Architecture

### WebSocket relay server (`server/ws.ts`)

A standalone WebSocket server on port 9900, started alongside Next.js via `concurrently`. Two connection families:

- **`/browser`** — React dashboard connects here. Supports multiple tabs simultaneously.
- **`/claude/:agentId`** — each Claude CLI connects here (passed as `--sdk-url`).

The server acts as a relay: browser spawns agents, the server launches `claude` inside tmux sessions, and all CLI NDJSON messages are forwarded to the browser as `{ type: "relay", agentId, message }`.

### Session persistence (`server/session-store.ts`)

Agent state and full message history are persisted to `$TMPDIR/thos-sessions/<agentId>.json`. This means:

- **Page refresh** restores all conversations — the server replays `message_history` to each connecting browser.
- **Server restart** restores agents from disk. Agents that were active are marked `"disconnected"` and relaunched when a browser reconnects.
- **Multiple browser tabs** see the same state — `sendToBrowser` iterates a `Set<WebSocket>` of all connected browsers.

Writes are **debounced** (150ms) for high-frequency streaming events and **synchronous** for critical state changes (spawn, result, status transitions). On `SIGTERM`/`SIGINT`, all agents are flushed to disk before tmux sessions are killed.

### CLI resilience

| Scenario | Behavior |
|----------|----------|
| CLI process crashes | Status becomes `"disconnected"`, browser sees "CLI disconnected — attempting reconnect..." |
| Browser reconnects | Server relaunches dead agents via `claude --resume --sdk-url ...` if they have a `sessionId` |
| Message sent while CLI is down | Queued in `pendingMessages[]`, flushed when CLI WebSocket reconnects |
| CLI reconnects | Browser sees "CLI reconnected", queued messages are delivered |

### Agent status lifecycle

```
idle → spawning → connected ⇄ thinking → done
                      ↓                    ↑
                 disconnected ─────────────┘
                      ↓          (relaunch)
                    error
```

- `idle` — no process, ready to spawn
- `spawning` — tmux session created, waiting for CLI WebSocket
- `connected` — CLI connected, `system/init` received
- `thinking` — waiting for assistant response
- `done` — CLI WebSocket closed cleanly
- `disconnected` — CLI WebSocket dropped unexpectedly (crash, kill, server restart)
- `error` — unrecoverable failure

### Message flow

```
Browser                    WS Server                    Claude CLI
  │                           │                            │
  │──spawn(prompt)──────────▶│                            │
  │                           │──tmux new-session──────▶│
  │◀──spawned(agentId)───────│                            │
  │                           │◀──hook_response───────────│
  │                           │──user(prompt)────────────▶│
  │◀──relay(system/init)─────│◀──system/init──────────────│
  │◀──relay(assistant)───────│◀──assistant─────────────────│
  │◀──relay(control_request)─│◀──control_request──────────│
  │──control_response───────▶│──control_response─────────▶│
  │◀──relay(result)──────────│◀──result────────────────────│
  │                           │                            │
  │  (page refresh)           │                            │
  │──connect /browser────────▶│                            │
  │◀──agent_list─────────────│                            │
  │◀──message_history────────│  (replays all stored msgs) │
```

### Key files

| File | Purpose |
|------|---------|
| `server/ws.ts` | WebSocket relay server — agent lifecycle, message routing, multi-browser, persistence integration |
| `server/session-store.ts` | File-based JSON persistence with debounced/sync writes |
| `hooks/use-websocket.ts` | React hook — connection management, message processing, dedup, reconnect handling |
| `lib/types.ts` | Shared TypeScript types for all message protocols |
| `components/dashboard/agent-sidebar.tsx` | Agent list with status dots |
| `components/dashboard/chat.tsx` | Chat interface for the active agent |
| `components/dashboard/status-bar.tsx` | Connection and agent status indicator |

## Status

Early stage. Solving my own problems first, seeing where it goes from there.

---

Built by [@chiumax](https://github.com/chiumax)
