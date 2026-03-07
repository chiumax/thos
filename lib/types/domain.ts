/**
 * Domain types — workspaces, tasks, and other shared business objects.
 */

// ── Workspaces ───────────────────────────────────────────────────────

/** A workspace represents a project directory. */
export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  createdAt: number;
}

/** A directory entry returned by the server-side folder browser. */
export interface DirectoryEntry {
  name: string;
  path: string;
}

// ── Tasks ──────────────────────────────────────────────────────────────

export type TaskStatus = "icebox" | "todo" | "in-progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** A user-created task, optionally linked to a Claude agent. */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** If delegated, the agentId of the spawned Claude agent. */
  agentId: string | null;
  /** Workspace this task belongs to. */
  workspaceId: string | null;
  createdAt: number;
  updatedAt: number;
}
