/**
 * Handler for incoming browser WebSocket messages.
 *
 * Processes spawn, send_message, control_response, agent management,
 * task CRUD, workspace CRUD, and directory browsing.
 */

import { WebSocket } from "ws";
import { randomBytes } from "crypto";
import { readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { BrowserMessage, Task, Workspace, DirectoryEntry, ServerMessage } from "../../lib/types";
import {
  agents,
  spawnClaude,
  stopAgent,
  deleteAgent,
  persistAgent,
  persistAgentSync,
  setAgentStatus,
} from "../agent-state";
import {
  sendToBrowser,
  broadcastAgentList,
  broadcastTaskList,
  broadcastWorkspaceList,
  buildTaskList,
  browserWorkspaceScope,
} from "../broadcast";
import { buildAgentList } from "../agent-state";

/** Shared mutable state — set from ws.ts on startup. */
let _tasks: Map<string, Task>;
let _workspaces: Map<string, Workspace>;
let _persistTasks: () => void;
let _persistWorkspaces: () => void;
let _sendHistoryToSocket: (ws: WebSocket, agentId: string) => void;

/** Initialize shared state references. Must be called before handling messages. */
export function initBrowserHandler(deps: {
  tasks: Map<string, Task>;
  workspaces: Map<string, Workspace>;
  persistTasks: () => void;
  persistWorkspaces: () => void;
  sendHistoryToSocket: (ws: WebSocket, agentId: string) => void;
}) {
  _tasks = deps.tasks;
  _workspaces = deps.workspaces;
  _persistTasks = deps.persistTasks;
  _persistWorkspaces = deps.persistWorkspaces;
  _sendHistoryToSocket = deps.sendHistoryToSocket;
}

export function handleBrowserMessage(raw: string, senderWs: WebSocket) {
  let msg: BrowserMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error("[browser] invalid JSON:", raw);
    return;
  }

  console.log("[browser →]", msg.type);

  switch (msg.type) {
    case "spawn": {
      const scope = browserWorkspaceScope.get(senderWs) ?? msg.workspaceId ?? null;
      spawnClaude(msg.prompt, scope, msg.model, msg.systemPrompt, _workspaces);
      break;
    }

    case "send_message": {
      const agent = agents.get(msg.agentId);
      if (!agent) {
        sendToBrowser({ type: "error", agentId: msg.agentId, error: "Unknown agent" });
        break;
      }

      agent.messageHistory.push({
        type: "relay",
        agentId: msg.agentId,
        message: { type: "user", message: { role: "user", content: msg.content } },
      } as ServerMessage);
      persistAgent(agent);

      if (agent.claudeSocket?.readyState === WebSocket.OPEN) {
        const userMsg = JSON.stringify({
          type: "user",
          message: { role: "user", content: msg.content },
          parent_tool_use_id: null,
          session_id: agent.sessionId ?? "",
        });
        agent.claudeSocket.send(userMsg + "\n");
        setAgentStatus(msg.agentId, "thinking");
      } else {
        const userMsg = JSON.stringify({
          type: "user",
          message: { role: "user", content: msg.content },
          parent_tool_use_id: null,
          session_id: agent.sessionId ?? "",
        });
        agent.pendingMessages.push(userMsg);
        console.log(`[queue] queued message for agent ${msg.agentId} (${agent.pendingMessages.length} pending)`);
        persistAgentSync(agent);
      }
      break;
    }

    case "control_response": {
      const agent = agents.get(msg.agentId);
      if (agent?.claudeSocket?.readyState === WebSocket.OPEN) {
        const originalInput = agent.pendingControlRequests.get(msg.request_id) ?? {};
        agent.pendingControlRequests.delete(msg.request_id);

        const answers = (msg as { answers?: Record<string, string> }).answers;
        const updatedInput = answers
          ? { ...originalInput, answers }
          : originalInput;

        const response = JSON.stringify({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: msg.request_id,
            response: msg.allow
              ? { behavior: "allow", updatedInput }
              : { behavior: "deny", message: "Denied by user" },
          },
        });
        agent.claudeSocket.send(response + "\n");
      }
      break;
    }

    case "kill_agent":
      stopAgent(msg.agentId);
      break;

    case "delete_agent":
      deleteAgent(msg.agentId);
      break;

    case "rename_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.label = msg.label;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "clear_history": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.messageHistory = [];
      persistAgentSync(agent);
      sendToBrowser({ type: "history_cleared", agentId: msg.agentId });
      break;
    }

    case "pin_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.pinned = msg.pinned;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "icebox_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.iceboxed = msg.iceboxed;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "move_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.workspaceId = msg.workspaceId;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "request_history": {
      console.log(`[browser] request_history for ${msg.agentId}`);
      _sendHistoryToSocket(senderWs, msg.agentId);
      break;
    }

    case "create_task": {
      const taskId = randomBytes(4).toString("hex");
      const task: Task = {
        id: taskId,
        title: msg.title,
        description: msg.description,
        status: "todo",
        priority: msg.priority,
        agentId: null,
        workspaceId: browserWorkspaceScope.get(senderWs) ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      _tasks.set(taskId, task);
      _persistTasks();
      broadcastTaskList(_tasks);
      break;
    }

    case "update_task": {
      const task = _tasks.get(msg.taskId);
      if (!task) break;
      Object.assign(task, msg.updates, { updatedAt: Date.now() });
      _persistTasks();
      broadcastTaskList(_tasks);

      if (task.status === "done" && task.agentId) {
        const linkedAgent = agents.get(task.agentId);
        if (linkedAgent && linkedAgent.status !== "done") {
          stopAgent(task.agentId);
        }
      }
      break;
    }

    case "delete_task": {
      _tasks.delete(msg.taskId);
      _persistTasks();
      broadcastTaskList(_tasks);
      break;
    }

    case "delegate_task": {
      const task = _tasks.get(msg.taskId);
      if (!task) break;
      const prompt = `Task: ${task.title}\n\n${task.description}`;
      const agentId = spawnClaude(prompt, task.workspaceId, undefined, undefined, _workspaces);
      task.agentId = agentId;
      task.status = "in-progress";
      task.updatedAt = Date.now();
      _persistTasks();
      broadcastTaskList(_tasks);
      break;
    }

    // ── Workspace messages ──────────────────────────────────────────────

    case "set_workspace": {
      browserWorkspaceScope.set(senderWs, msg.workspaceId);
      const scope = msg.workspaceId;
      senderWs.send(JSON.stringify({ type: "agent_list", agents: buildAgentList(scope) }));
      senderWs.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(_tasks, scope) }));
      break;
    }

    case "create_workspace": {
      const id = randomBytes(4).toString("hex");
      const workspace: Workspace = {
        id,
        name: msg.name,
        cwd: msg.cwd,
        createdAt: Date.now(),
      };
      _workspaces.set(id, workspace);
      _persistWorkspaces();
      broadcastWorkspaceList(_workspaces);
      break;
    }

    case "rename_workspace": {
      const workspace = _workspaces.get(msg.workspaceId);
      if (!workspace) break;
      workspace.name = msg.name;
      _persistWorkspaces();
      broadcastWorkspaceList(_workspaces);
      break;
    }

    case "delete_workspace": {
      _workspaces.delete(msg.workspaceId);
      for (const agent of agents.values()) {
        if (agent.workspaceId === msg.workspaceId) {
          agent.workspaceId = null;
          persistAgentSync(agent);
        }
      }
      for (const task of _tasks.values()) {
        if (task.workspaceId === msg.workspaceId) {
          task.workspaceId = null;
        }
      }
      _persistTasks();
      _persistWorkspaces();
      broadcastWorkspaceList(_workspaces);
      broadcastAgentList();
      broadcastTaskList(_tasks);
      break;
    }

    case "browse_directory": {
      const dirPath = msg.path;
      try {
        if (!existsSync(dirPath)) {
          senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries: [] }));
          break;
        }
        const entries: DirectoryEntry[] = [];
        const parent = dirname(dirPath);
        if (parent !== dirPath) {
          entries.push({ name: "..", path: parent });
        }
        const items = readdirSync(dirPath);
        for (const item of items) {
          if (item.startsWith(".")) continue;
          const fullPath = join(dirPath, item);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              entries.push({ name: item, path: fullPath });
            }
          } catch {
            // skip inaccessible entries
          }
        }
        entries.sort((a, b) => {
          if (a.name === "..") return -1;
          if (b.name === "..") return 1;
          return a.name.localeCompare(b.name);
        });
        senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries }));
      } catch (err) {
        console.error(`[browse_directory] error reading ${dirPath}:`, err);
        senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries: [] }));
      }
      break;
    }
  }
}
