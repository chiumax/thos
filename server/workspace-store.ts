/**
 * File-based workspace persistence for the thos dashboard.
 *
 * Stores all workspaces in a single JSON file at `.thos/workspaces.json`.
 * Workspaces change infrequently so only sync writes are used.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Workspace } from "../lib/types";

const THOS_DIR = join(process.cwd(), ".thos");
const WORKSPACE_FILE = join(THOS_DIR, "workspaces.json");

export class WorkspaceStore {
  constructor() {
    mkdirSync(THOS_DIR, { recursive: true });
  }

  /** Load all workspaces from disk. Returns empty array if file missing. */
  loadAll(): Workspace[] {
    if (!existsSync(WORKSPACE_FILE)) return [];
    try {
      const raw = readFileSync(WORKSPACE_FILE, "utf-8");
      return JSON.parse(raw) as Workspace[];
    } catch (err) {
      console.error("[workspace-store] failed to load:", err);
      return [];
    }
  }

  /** Immediate write. */
  saveSync(workspaces: Workspace[]): void {
    try {
      writeFileSync(WORKSPACE_FILE, JSON.stringify(workspaces, null, 2));
    } catch (err) {
      console.error("[workspace-store] failed to write:", err);
    }
  }
}
