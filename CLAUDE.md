# CLAUDE.md

## Project

thos is a visual orchestration layer for Claude Code — a web UI that runs alongside the CLI providing real-time agent visibility, persistent memory, change management, and task orchestration.

## Tech Stack

- Next.js 16 + React 19 + TypeScript (strict mode)
- Standalone WebSocket server (ws, port 9900) for agent relay
- Tailwind CSS 4 + shadcn/ui (new-york style) + Lucide icons
- File-based JSON persistence (.thos/sessions/, .thos/tasks/)
- pnpm 10 package manager

## Commands

- `pnpm dev` — Start Next.js (port 3000, Turbopack) + WebSocket server (port 9900) concurrently
- `pnpm dev:next` — Next.js only
- `pnpm dev:ws` — WebSocket server only
- `pnpm build` — Production build
- `pnpm lint` — ESLint

## Architecture

- **app/** — Next.js app router pages (dashboard is the main UI)
- **components/dashboard/** — React components for agent sidebar, chat, messages, tasks
- **hooks/use-websocket.ts** — Central React hook managing WS connection and all agent state
- **server/ws.ts** — Standalone WebSocket relay server (agent lifecycle, message routing, persistence)
- **server/session-store.ts** — Debounced file-based agent/session persistence
- **server/task-store.ts** — File-based task persistence
- **lib/types.ts** — Shared TypeScript types (Claude NDJSON protocol + browser↔server messages)
- **middleware.ts** — IP allowlist (localhost + Tailscale)

Two WebSocket connection families: `/browser` (dashboard tabs) and `/claude/:agentId` (CLI instances).

## Conventions

- All interactive components use `"use client"` directive
- Functional components only, hooks for state
- Path alias `@/*` maps to project root
- Dark mode is the default theme
- CSS class merging via `cn()` utility (clsx + tailwind-merge)
- OKLch color space for theme variables
- Debounced persistence (150ms) for streaming events, sync writes for critical state changes
- Message deduplication: Claude CLI sends cumulative snapshots, server stores only final versions
- Unidirectional data flow: useWebSocket hook → page → child components
- All changes must be documented in CHANGELOG.md
- Then well documented in a commit and pushe
-
