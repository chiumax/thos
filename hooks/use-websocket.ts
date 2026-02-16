"use client";

/**
 * React hook that manages the WebSocket connection to the thos relay server.
 *
 * Supports multiple concurrent agents. Each agent has its own status,
 * message history, label, and tmux session name tracked in a Map keyed
 * by agent ID. The `activeAgentId` determines which agent's chat is shown.
 *
 * ## Connection lifecycle
 *
 * 1. Connect to `ws://<host>:9900/browser`.
 * 2. Server sends `agent_list` (sidebar metadata) + `task_list`. No
 *    message histories are sent eagerly — this keeps the initial
 *    payload small for fast loading on mobile networks.
 * 3. `initialLoadDone` becomes true after `agent_list` arrives.
 * 4. The first agent is auto-selected if nothing was selected.
 *
 * ## Lazy history loading
 *
 * Message histories are loaded on demand. When `activeAgentId` changes
 * and the agent hasn't been loaded yet, the hook sends
 * `{ type: "request_history", agentId }` and sets `historyLoading = true`.
 * When the server responds with `message_history`, the agent's messages
 * are populated and `historyLoading` becomes false.
 *
 * The `loadedAgents` Set tracks which agents have been fetched so that
 * switching back to a previously viewed agent is instant.
 *
 * ## Resilience features
 *
 * - Handles `message_history` replay from server on demand.
 * - Handles `cli_disconnected` / `cli_connected` events.
 * - Deduplicates messages using a per-agent processed count.
 * - Robust reconnection guard (clears previous timer before scheduling).
 * - Strict mode safe (closingRef prevents spurious reconnects on unmount).
 *
 * ## Logging
 *
 * All WS events are logged with the `[thos-ws]` prefix. Filter by this
 * in the browser console to debug connection and message delivery issues.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  AgentStatus,
  ChatMessage,
  ClaudeAssistant,
  ClaudeControlRequest,
  ClaudeMessage,
  ClaudeResult,
  ClaudeSystemInit,
  ServerMessage,
  ServerMessageHistory,
  ServerTaskList,
  ServerTaskUpdated,
  ServerTaskDeleted,
  Task,
  TaskPriority,
  ToolCallInfo,
  UserQuestion,
} from "@/lib/types";

/** Connect to the WS server on the same host the page was loaded from. */
const WS_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.hostname}:9900/browser`
    : "ws://localhost:9900/browser";

/** Per-agent client state. */
export interface AgentClientState {
  status: AgentStatus;
  messages: ChatMessage[];
  /** Raw Claude NDJSON messages for debug view. */
  rawMessages: ClaudeMessage[];
  label: string;
  tmuxSession: string | null;
  createdAt: number;
}

/**
 * Extract displayable text from a Claude assistant message.
 * Content blocks may be text, tool_use, or tool_result — each is
 * handled defensively since the array structure can vary.
 */
function extractText(msg: ClaudeAssistant): string {
  const blocks = msg.message?.content;
  if (!blocks || !Array.isArray(blocks)) return "";
  return blocks
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_use") return `[tool_use: ${b.name}]`;
      if (b.type === "tool_result") {
        const c = (b as { content?: unknown }).content;
        return `[tool_result: ${typeof c === "string" ? c : JSON.stringify(c)}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Module-level counter for generating unique message IDs. */
let msgCounter = 0;
function nextId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

/**
 * Convert a server relay message into a ChatMessage, or null if it shouldn't be displayed.
 * Used both for live messages and for replaying message_history.
 */
function relayChatMessage(agentId: string, relayMsg: ServerMessage): ChatMessage | null {
  if (relayMsg.type === "relay") {
    const msg = relayMsg.message;

    if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
      const init = msg as ClaudeSystemInit;
      return {
        id: nextId(),
        role: "system",
        content: `Session started — model: ${init.model}, cwd: ${init.cwd}`,
        timestamp: Date.now(),
      };
    }

    if (msg.type === "user") {
      const rawContent = (msg as { message?: { content?: unknown } }).message?.content ?? "";
      // Only render human-typed user messages (string content).
      // CLI tool_result messages have array content — these are internal
      // protocol messages and are only visible in the raw message viewer.
      if (typeof rawContent !== "string") return null;
      if (!rawContent.trim()) return null;
      return {
        id: nextId(),
        role: "user",
        content: rawContent,
        timestamp: Date.now(),
      };
    }

    if (msg.type === "assistant") {
      const assistant = msg as ClaudeAssistant;
      const text = extractText(assistant);
      if (!text) return null;

      const blocks = assistant.message?.content ?? [];
      const hasText = blocks.some((b) => b.type === "text" && b.text.trim());
      const toolCalls: ToolCallInfo[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          name: (b as { name: string }).name,
          toolUseId: (b as { id: string }).id,
        }));
      const isToolOnly = !hasText && toolCalls.length > 0;

      return {
        id: nextId(),
        role: "assistant",
        content: text,
        timestamp: Date.now(),
        toolCalls,
        isToolOnly,
      };
    }

    if (msg.type === "result") {
      const result = msg as ClaudeResult;
      const summary = result.is_error
        ? `Error: ${result.error}`
        : `Done — ${result.num_turns ?? "?"} turns, $${(result.cost_usd ?? 0).toFixed(4)}, ${((result.duration_ms ?? 0) / 1000).toFixed(1)}s`;
      return {
        id: nextId(),
        role: "system",
        content: summary,
        timestamp: Date.now(),
      };
    }

    if (msg.type === "control_request") {
      const cr = msg as ClaudeControlRequest;

      // AskUserQuestion gets its own UI instead of generic Allow/Deny
      if (cr.request.tool_name === "AskUserQuestion") {
        const input = cr.request.input as { questions?: UserQuestion[] };
        const questions = Array.isArray(input.questions) ? input.questions : [];
        return {
          id: nextId(),
          role: "system",
          content: "Question from Claude",
          timestamp: Date.now(),
          userQuestion: {
            requestId: cr.request_id,
            questions,
          },
        };
      }

      return {
        id: nextId(),
        role: "system",
        content: `Tool approval requested: ${cr.request.tool_name}`,
        timestamp: Date.now(),
        controlRequest: {
          id: cr.request_id,
          tool_name: cr.request.tool_name,
          input: cr.request.input,
        },
      };
    }
  }

  if (relayMsg.type === "error" && relayMsg.agentId === agentId) {
    return {
      id: nextId(),
      role: "system",
      content: `Error: ${relayMsg.error}`,
      timestamp: Date.now(),
    };
  }

  return null;
}

/** Console logger with [thos] prefix for easy filtering. */
function log(...args: unknown[]) {
  console.log("[thos-ws]", ...args);
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set to true during cleanup to prevent onclose from scheduling reconnects. */
  const closingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  /** True once we've received the initial agent_list from the server. */
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Multi-agent state
  const [agents, setAgents] = useState<Map<string, AgentClientState>>(new Map());
  const [agentOrder, setAgentOrder] = useState<string[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);

  // Per-agent deduplication: track count of processed messages per agent
  // to avoid duplicating messages already in local state during history replay.
  const processedCountRef = useRef<Map<string, number>>(new Map());

  // Track which agents have had their history loaded (lazy loading).
  const [loadedAgents, setLoadedAgents] = useState<Set<string>>(new Set());

  /** Immutably update a single agent's state in the Map. */
  const updateAgent = useCallback(
    (agentId: string, updater: (prev: AgentClientState) => AgentClientState) => {
      setAgents((prev) => {
        const existing = prev.get(agentId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(agentId, updater(existing));
        return next;
      });
    },
    []
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset dedup counts on new connection — server will send fresh history
    processedCountRef.current.clear();
    setInitialLoadDone(false);
    setLoadedAgents(new Set());

    log("connecting to", WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      log("connected");
      setConnected(true);
    };

    ws.onclose = () => {
      log("disconnected, closingRef =", closingRef.current);
      setConnected(false);
      wsRef.current = null;
      // Don't reconnect if the close was triggered by cleanup (e.g. strict mode unmount)
      if (closingRef.current) return;
      // Reconnection guard: clear any existing timer before scheduling
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      log("scheduling reconnect in 2s");
      reconnectTimer.current = setTimeout(() => connect(), 2000);
    };

    ws.onerror = (e) => {
      log("error", e);
      // onclose will fire after onerror, which triggers reconnect
    };

    ws.onmessage = (event) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      log("←", data.type, "agentId" in data ? (data as { agentId: string }).agentId : "");

      // ── task_list: full task list from server ──
      if (data.type === "task_list") {
        log("task_list:", (data as ServerTaskList).tasks.length, "tasks");
        setTasks((data as ServerTaskList).tasks);
        return;
      }

      // ── task_updated: single task changed ──
      if (data.type === "task_updated") {
        const updated = (data as ServerTaskUpdated).task;
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }

      // ── task_deleted: remove task ──
      if (data.type === "task_deleted") {
        const deletedId = (data as ServerTaskDeleted).taskId;
        setTasks((prev) => prev.filter((t) => t.id !== deletedId));
        return;
      }

      // ── message_history: replay full history from server ──
      if (data.type === "message_history") {
        const historyMsg = data as ServerMessageHistory;
        const agentId = historyMsg.agentId;
        const serverMessages = historyMsg.messages;
        log("message_history:", agentId, serverMessages.length, "raw msgs");

        // Convert all server messages to ChatMessages + extract raw Claude messages
        const chatMessages: ChatMessage[] = [];
        const rawMessages: ClaudeMessage[] = [];
        for (const sm of serverMessages) {
          if (sm.type === "relay") {
            rawMessages.push(sm.message);
          }
          const cm = relayChatMessage(agentId, sm);
          if (cm) chatMessages.push(cm);
        }
        log("message_history:", agentId, "→", chatMessages.length, "chat msgs,", rawMessages.length, "raw");

        // Always replace local messages with server history (source of truth).
        setAgents((prev) => {
          const existing = prev.get(agentId);
          if (!existing) {
            log("message_history:", agentId, "agent not in map yet, creating");
            const next = new Map(prev);
            next.set(agentId, {
              status: "idle",
              messages: chatMessages,
              rawMessages,
              label: "",
              tmuxSession: null,
              createdAt: 0,
            });
            return next;
          }
          const next = new Map(prev);
          next.set(agentId, { ...existing, messages: chatMessages, rawMessages });
          return next;
        });

        processedCountRef.current.set(agentId, chatMessages.length);
        setLoadedAgents((prev) => {
          if (prev.has(agentId)) return prev;
          const next = new Set(prev);
          next.add(agentId);
          return next;
        });
        return;
      }

      // ── history_cleared: wipe local messages for this agent ──
      if (data.type === "history_cleared") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [],
          rawMessages: [],
        }));
        processedCountRef.current.set(data.agentId, 0);
        return;
      }

      // ── cli_disconnected: show system message ──
      if (data.type === "cli_disconnected") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: nextId(),
              role: "system",
              content: "CLI session ended",
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }

      // ── cli_connected: show system message ──
      if (data.type === "cli_connected") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: nextId(),
              role: "system",
              content: "CLI reconnected",
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }

      // ── agent_list: reconcile sidebar state from server ──
      if (data.type === "agent_list") {
        const serverAgents = data.agents as AgentInfo[];
        log("agent_list:", serverAgents.length, "agents:", serverAgents.map((a) => `${a.agentId}(${a.status})`).join(", "));
        setAgents((prev) => {
          const next = new Map(prev);
          const serverIds = new Set(serverAgents.map((a) => a.agentId));

          // Update or add agents from server
          for (const info of serverAgents) {
            const existing = next.get(info.agentId);
            if (existing) {
              next.set(info.agentId, {
                ...existing,
                status: info.status,
                tmuxSession: info.tmuxSession,
                label: info.label,
              });
            } else {
              next.set(info.agentId, {
                status: info.status,
                messages: [],
                rawMessages: [],
                label: info.label,
                tmuxSession: info.tmuxSession,
                createdAt: info.createdAt,
              });
            }
          }

          // Remove agents no longer on the server
          for (const id of next.keys()) {
            if (!serverIds.has(id)) {
              next.delete(id);
            }
          }

          return next;
        });
        setAgentOrder(serverAgents.map((a) => a.agentId));
        setInitialLoadDone(true);

        // Auto-select the first agent on initial load when nothing is selected
        setActiveAgentId((prev) => {
          if (prev !== null) return prev;
          if (serverAgents.length === 0) return null;
          return serverAgents[0].agentId;
        });
        return;
      }

      // ── spawned: auto-select the newly created agent ──
      if (data.type === "spawned") {
        setActiveAgentId(data.agentId);
        return;
      }

      // ── status: update a specific agent's status ──
      if (data.type === "status") {
        updateAgent(data.agentId, (prev) => ({ ...prev, status: data.status }));
        return;
      }

      // ── error: append to agent's message list ──
      if (data.type === "error") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: nextId(),
              role: "system",
              content: `Error: ${data.error}`,
              timestamp: Date.now(),
            },
          ],
        }));
        // Track processed count for dedup
        processedCountRef.current.set(
          data.agentId,
          (processedCountRef.current.get(data.agentId) ?? 0) + 1
        );
        return;
      }

      // ── relay: append claude message to agent's history ──
      if (data.type === "relay") {
        const agentId = data.agentId;
        const rawMsg = data.message;
        const chatMsg = relayChatMessage(agentId, data);

        updateAgent(agentId, (prev) => ({
          ...prev,
          rawMessages: [...prev.rawMessages, rawMsg],
          messages: chatMsg ? [...prev.messages, chatMsg] : prev.messages,
        }));
        if (chatMsg) {
          // Track processed count for dedup
          processedCountRef.current.set(
            agentId,
            (processedCountRef.current.get(agentId) ?? 0) + 1
          );
        }
        return;
      }
    };
  }, [updateAgent]);

  useEffect(() => {
    closingRef.current = false;
    connect();
    return () => {
      closingRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Request history for the active agent if not already loaded.
  useEffect(() => {
    if (!activeAgentId || loadedAgents.has(activeAgentId)) return;
    log("requesting history for", activeAgentId);
    send({ type: "request_history", agentId: activeAgentId });
  }, [activeAgentId, loadedAgents, send]);

  const spawnAgent = useCallback(
    (prompt: string) => {
      send({ type: "spawn", prompt });
    },
    [send]
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (!activeAgentId) return;
      // Optimistically add user message to local state
      updateAgent(activeAgentId, (prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: nextId(),
            role: "user",
            content,
            timestamp: Date.now(),
          },
        ],
      }));
      send({ type: "send_message", agentId: activeAgentId, content });
    },
    [send, activeAgentId, updateAgent]
  );

  const respondToControl = useCallback(
    (requestId: string, allow: boolean) => {
      if (!activeAgentId) return;
      send({ type: "control_response", agentId: activeAgentId, request_id: requestId, allow });
      updateAgent(activeAgentId, (prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.controlRequest?.id === requestId
            ? { ...m, controlRequest: { ...m.controlRequest, resolved: true } }
            : m
        ),
      }));
    },
    [send, activeAgentId, updateAgent]
  );

  /** Respond to an AskUserQuestion control request with the user's selections. */
  const respondToUserQuestion = useCallback(
    (requestId: string, answers: Record<string, string>) => {
      if (!activeAgentId) return;
      send({
        type: "control_response",
        agentId: activeAgentId,
        request_id: requestId,
        allow: true,
        answers,
      });
      updateAgent(activeAgentId, (prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.userQuestion?.requestId === requestId
            ? { ...m, userQuestion: { ...m.userQuestion, resolved: true } }
            : m
        ),
      }));
    },
    [send, activeAgentId, updateAgent]
  );

  // ── Agent management actions ──────────────────────────────────────────────

  const killAgent = useCallback(
    (agentId: string) => {
      send({ type: "kill_agent", agentId });
    },
    [send]
  );

  const deleteAgent = useCallback(
    (agentId: string) => {
      send({ type: "delete_agent", agentId });
      // Deselect if we just deleted the active agent
      setActiveAgentId((prev) => (prev === agentId ? null : prev));
    },
    [send]
  );

  const renameAgent = useCallback(
    (agentId: string, label: string) => {
      send({ type: "rename_agent", agentId, label });
    },
    [send]
  );

  const clearHistory = useCallback(
    (agentId: string) => {
      send({ type: "clear_history", agentId });
    },
    [send]
  );

  // ── Task actions ──────────────────────────────────────────────────────────

  const createTask = useCallback(
    (title: string, description: string, priority: TaskPriority) => {
      send({ type: "create_task", title, description, priority });
    },
    [send]
  );

  const updateTask = useCallback(
    (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => {
      send({ type: "update_task", taskId, updates });
    },
    [send]
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      send({ type: "delete_task", taskId });
    },
    [send]
  );

  const delegateTask = useCallback(
    (taskId: string) => {
      send({ type: "delegate_task", taskId });
    },
    [send]
  );

  // Derived values for the active agent
  const activeAgent = activeAgentId ? agents.get(activeAgentId) : undefined;
  const activeStatus = useMemo<AgentStatus>(
    () => activeAgent?.status ?? "idle",
    [activeAgent?.status]
  );
  const activeMessages = useMemo<ChatMessage[]>(
    () => activeAgent?.messages ?? [],
    [activeAgent?.messages]
  );
  const activeRawMessages = useMemo<ClaudeMessage[]>(
    () => activeAgent?.rawMessages ?? [],
    [activeAgent?.rawMessages]
  );
  const historyLoading = activeAgentId !== null && !loadedAgents.has(activeAgentId);

  return {
    connected,
    initialLoadDone,
    historyLoading,
    agents,
    agentOrder,
    activeAgentId,
    setActiveAgentId,
    activeStatus,
    activeMessages,
    activeRawMessages,
    spawnAgent,
    sendMessage,
    respondToControl,
    respondToUserQuestion,
    killAgent,
    deleteAgent,
    renameAgent,
    clearHistory,
    tasks,
    createTask,
    updateTask,
    deleteTask,
    delegateTask,
  };
}
