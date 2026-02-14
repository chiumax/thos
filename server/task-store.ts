/**
 * File-based task persistence for the thos dashboard.
 *
 * Stores all tasks in a single JSON file at `.thos/tasks/tasks.json`.
 * Uses the same debounced/sync write pattern as SessionStore.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Task } from "../lib/types";

const TASK_DIR = join(process.cwd(), ".thos", "tasks");
const TASK_FILE = join(TASK_DIR, "tasks.json");

export class TaskStore {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    mkdirSync(TASK_DIR, { recursive: true });
  }

  /** Load all tasks from disk. Returns empty array if file missing. */
  loadAll(): Task[] {
    if (!existsSync(TASK_FILE)) return [];
    try {
      const raw = readFileSync(TASK_FILE, "utf-8");
      return JSON.parse(raw) as Task[];
    } catch (err) {
      console.error("[task-store] failed to load:", err);
      return [];
    }
  }

  /** Debounced write (150ms). */
  save(tasks: Task[]): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.writeFile(tasks);
    }, 150);
  }

  /** Immediate write for critical changes. */
  saveSync(tasks: Task[]): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.writeFile(tasks);
  }

  /** Flush pending writes (for graceful shutdown). */
  flush(tasks: Task[]): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.writeFile(tasks);
  }

  private writeFile(tasks: Task[]): void {
    try {
      writeFileSync(TASK_FILE, JSON.stringify(tasks, null, 2));
    } catch (err) {
      console.error("[task-store] failed to write:", err);
    }
  }
}
