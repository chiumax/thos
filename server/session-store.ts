/**
 * File-based session persistence for thos agents.
 *
 * Persists agent state + message history to JSON files in
 * `.thos/sessions/<agentId>.json` so data survives server restarts.
 *
 * Uses debounced writes (150ms) for high-frequency events (streaming) and
 * synchronous writes for critical state changes (spawn, result, status).
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import type { AgentStatus, ServerMessage } from "../lib/types";

const SESSION_DIR = join(process.cwd(), ".thos", "sessions");

/** Shape of a persisted agent on disk. */
export interface PersistedAgent {
  id: string;
  state: {
    agentId: string;
    status: AgentStatus;
    tmuxSession: string | null;
    label: string;
    createdAt: number;
    sessionId: string | null;
  };
  messageHistory: ServerMessage[];
}

export class SessionStore {
  private dir: string;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(dir: string = SESSION_DIR) {
    this.dir = dir;
    mkdirSync(this.dir, { recursive: true });
  }

  /** File path for a given agent ID. */
  private filePath(agentId: string): string {
    return join(this.dir, `${agentId}.json`);
  }

  /** Debounced write — batches rapid stream events (150ms). */
  save(agent: PersistedAgent): void {
    const existing = this.debounceTimers.get(agent.id);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      agent.id,
      setTimeout(() => {
        this.debounceTimers.delete(agent.id);
        this.writeFile(agent);
      }, 150)
    );
  }

  /** Immediate write — use for critical state changes (spawn, result, status). */
  saveSync(agent: PersistedAgent): void {
    // Cancel any pending debounced write
    const existing = this.debounceTimers.get(agent.id);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(agent.id);
    }
    this.writeFile(agent);
  }

  /** Load a single agent from disk. Returns null if not found. */
  load(agentId: string): PersistedAgent | null {
    const fp = this.filePath(agentId);
    if (!existsSync(fp)) return null;
    try {
      const raw = readFileSync(fp, "utf-8");
      return JSON.parse(raw) as PersistedAgent;
    } catch (err) {
      console.error(`[session-store] failed to load ${agentId}:`, err);
      return null;
    }
  }

  /** Load all persisted agents on server startup. */
  loadAll(): PersistedAgent[] {
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      const agents: PersistedAgent[] = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.dir, file), "utf-8");
          agents.push(JSON.parse(raw) as PersistedAgent);
        } catch (err) {
          console.error(`[session-store] failed to parse ${file}:`, err);
        }
      }
      return agents;
    } catch {
      return [];
    }
  }

  /** Delete an agent's persisted file. */
  remove(agentId: string): void {
    const fp = this.filePath(agentId);
    try {
      if (existsSync(fp)) unlinkSync(fp);
    } catch (err) {
      console.error(`[session-store] failed to remove ${agentId}:`, err);
    }
    // Also cancel any pending debounced write
    const existing = this.debounceTimers.get(agentId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(agentId);
    }
  }

  /** Flush all pending debounced writes synchronously (for graceful shutdown). */
  flushAll(allAgents: PersistedAgent[]): void {
    // Cancel all pending timers
    for (const [id, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(id);
    }
    // Write all agents
    for (const agent of allAgents) {
      this.writeFile(agent);
    }
  }

  private writeFile(agent: PersistedAgent): void {
    try {
      writeFileSync(this.filePath(agent.id), JSON.stringify(agent, null, 2));
    } catch (err) {
      console.error(`[session-store] failed to write ${agent.id}:`, err);
    }
  }
}
