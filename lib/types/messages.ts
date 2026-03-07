/**
 * Browser ↔ Server message types — messages exchanged between the React
 * client and the standalone WS relay server.
 */

import type { AgentStatus } from "./ui";
import type { ClaudeMessage } from "./claude";
import type { Task, TaskPriority, Workspace, DirectoryEntry } from "./domain";

// ── Summary types used by server messages ─────────────────────────────

/** Summary of an agent for the sidebar. */
export interface AgentInfo {
  agentId: string;
  status: AgentStatus;
  tmuxSession: string | null;
  label: string;
  createdAt: number;
  workspaceId: string | null;
  /** Model name reported by system/init, or the model requested at spawn time. */
  model?: string | null;
  /** Whether this agent is pinned to the top of the sidebar. */
  pinned?: boolean;
  /** Whether this agent is in the icebox (parked for later). */
  iceboxed?: boolean;
}

// ── Browser → Server messages ─────────────────────────────────────────

/** Browser asks the server to spawn a new Claude CLI process. */
export interface BrowserSpawn {
  type: "spawn";
  prompt: string;
  workspaceId?: string;
  /** Optional model override (e.g. "claude-opus-4-20250514", "qwen3-coder"). */
  model?: string;
  /** Optional system prompt appended via --append-system-prompt. */
  systemPrompt?: string;
}

/** Browser sends a follow-up message to an already-running Claude session. */
export interface BrowserSendMessage {
  type: "send_message";
  agentId: string;
  content: string;
}

/** Browser responds to a tool approval request (allow or deny). */
export interface BrowserControlResponse {
  type: "control_response";
  agentId: string;
  request_id: string;
  allow: boolean;
}

/** Browser asks the server to kill a running agent's tmux session + CLI. */
export interface BrowserKillAgent {
  type: "kill_agent";
  agentId: string;
}

/** Browser asks the server to permanently delete an agent. */
export interface BrowserDeleteAgent {
  type: "delete_agent";
  agentId: string;
}

/** Browser asks the server to rename an agent. */
export interface BrowserRenameAgent {
  type: "rename_agent";
  agentId: string;
  label: string;
}

/** Browser asks the server to clear an agent's message history. */
export interface BrowserClearHistory {
  type: "clear_history";
  agentId: string;
}

/** Browser asks the server to pin or unpin an agent. */
export interface BrowserPinAgent {
  type: "pin_agent";
  agentId: string;
  pinned: boolean;
}

/** Browser asks the server to icebox or un-icebox an agent. */
export interface BrowserIceboxAgent {
  type: "icebox_agent";
  agentId: string;
  iceboxed: boolean;
}

/** Browser asks the server to move an agent to a different workspace. */
export interface BrowserMoveAgent {
  type: "move_agent";
  agentId: string;
  workspaceId: string | null;
}

/** Browser requests message history for a specific agent (lazy loading). */
export interface BrowserRequestHistory {
  type: "request_history";
  agentId: string;
}

/** Browser asks the server to create a new task. */
export interface BrowserCreateTask {
  type: "create_task";
  title: string;
  description: string;
  priority: TaskPriority;
}

/** Browser asks to update a task's fields. */
export interface BrowserUpdateTask {
  type: "update_task";
  taskId: string;
  updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>;
}

/** Browser asks to delete a task. */
export interface BrowserDeleteTask {
  type: "delete_task";
  taskId: string;
}

/** Browser asks to delegate a task to a new Claude agent. */
export interface BrowserDelegateTask {
  type: "delegate_task";
  taskId: string;
}

/** Browser tells the server which workspace to scope to. */
export interface BrowserSetWorkspace {
  type: "set_workspace";
  workspaceId: string | null;
}

/** Browser asks the server to create a new workspace. */
export interface BrowserCreateWorkspace {
  type: "create_workspace";
  name: string;
  cwd: string;
}

/** Browser asks to rename a workspace. */
export interface BrowserRenameWorkspace {
  type: "rename_workspace";
  workspaceId: string;
  name: string;
}

/** Browser asks to delete a workspace. */
export interface BrowserDeleteWorkspace {
  type: "delete_workspace";
  workspaceId: string;
}

/** Browser asks to browse a directory on the server. */
export interface BrowserBrowseDirectory {
  type: "browse_directory";
  path: string;
}

/** Union of all messages the browser can send to the WS server. */
export type BrowserMessage =
  | BrowserSpawn
  | BrowserSendMessage
  | BrowserControlResponse
  | BrowserKillAgent
  | BrowserDeleteAgent
  | BrowserRenameAgent
  | BrowserClearHistory
  | BrowserPinAgent
  | BrowserIceboxAgent
  | BrowserMoveAgent
  | BrowserRequestHistory
  | BrowserCreateTask
  | BrowserUpdateTask
  | BrowserDeleteTask
  | BrowserDelegateTask
  | BrowserSetWorkspace
  | BrowserCreateWorkspace
  | BrowserRenameWorkspace
  | BrowserDeleteWorkspace
  | BrowserBrowseDirectory;

// ── Server → Browser messages ─────────────────────────────────────────

/** Server relays a raw Claude NDJSON message to the browser. */
export interface ServerRelay {
  type: "relay";
  agentId: string;
  message: ClaudeMessage;
}

/** Server notifies the browser of an agent status change. */
export interface ServerStatus {
  type: "status";
  agentId: string;
  status: AgentStatus;
}

/** Server reports an error (e.g. no active session, process crash). */
export interface ServerError {
  type: "error";
  agentId: string;
  error: string;
}

/** Server sends the full list of agents after every state change. */
export interface ServerAgentList {
  type: "agent_list";
  agents: AgentInfo[];
}

/** Server confirms a new agent was spawned and assigns its ID. */
export interface ServerSpawned {
  type: "spawned";
  agentId: string;
}

/** Server sends full message history for an agent (in response to `request_history`). */
export interface ServerMessageHistory {
  type: "message_history";
  agentId: string;
  messages: ServerMessage[];
}

/** CLI WebSocket disconnected (process may have crashed or exited). */
export interface ServerCliDisconnected {
  type: "cli_disconnected";
  agentId: string;
}

/** CLI WebSocket reconnected (e.g. after relaunch with --resume). */
export interface ServerCliConnected {
  type: "cli_connected";
  agentId: string;
}

/** Server confirms message history was cleared for an agent. */
export interface ServerHistoryCleared {
  type: "history_cleared";
  agentId: string;
}

/** Server sends the full workspace list to the browser. */
export interface ServerWorkspaceList {
  type: "workspace_list";
  workspaces: Workspace[];
}

/** Server responds with a directory listing for the folder browser. */
export interface ServerDirectoryListing {
  type: "directory_listing";
  path: string;
  entries: DirectoryEntry[];
}

/** Server sends the full task list to the browser. */
export interface ServerTaskList {
  type: "task_list";
  tasks: Task[];
}

/** Server confirms a task was updated. */
export interface ServerTaskUpdated {
  type: "task_updated";
  task: Task;
}

/** Server confirms a task was deleted. */
export interface ServerTaskDeleted {
  type: "task_deleted";
  taskId: string;
}

/** Union of all messages the WS server can send to the browser. */
export type ServerMessage =
  | ServerRelay
  | ServerStatus
  | ServerError
  | ServerAgentList
  | ServerSpawned
  | ServerMessageHistory
  | ServerCliDisconnected
  | ServerCliConnected
  | ServerHistoryCleared
  | ServerWorkspaceList
  | ServerDirectoryListing
  | ServerTaskList
  | ServerTaskUpdated
  | ServerTaskDeleted;
