"use client";

/**
 * React hook that manages the WebSocket connection to the thos relay server.
 *
 * Supports multiple concurrent agents. Each agent has its own status,
 * message history, label, and tmux session name tracked in a Map keyed
 * by agent ID. The `activeAgentId` determines which agent's chat is shown.
 *
 * Resilience features:
 * - Handles `message_history` replay from server on connect/reconnect.
 * - Handles `cli_disconnected` / `cli_connected` events.
 * - Deduplicates messages using a per-agent Set of seen message IDs.
 * - Robust reconnection guard (clears previous timer before scheduling).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  AgentStatus,
  ChatMessage,
  ClaudeAssistant,
  ClaudeControlRequest,
  ClaudeResult,
  ClaudeSystemInit,
  ServerMessage,
  ServerMessageHistory,
  UserQuestion,
} from "@/lib/types";

const WS_URL = "ws://localhost:9900/browser";

/** Per-agent client state. */
export interface AgentClientState {
  status: AgentStatus;
  messages: ChatMessage[];
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
      if (b.type === "tool_result") return `[tool_result: ${b.content}]`;
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

    if (msg.type === "assistant") {
      const text = extractText(msg as ClaudeAssistant);
      if (text) {
        return {
          id: nextId(),
          role: "assistant",
          content: text,
          timestamp: Date.now(),
        };
      }
      return null;
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

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);

  // Multi-agent state
  const [agents, setAgents] = useState<Map<string, AgentClientState>>(new Map());
  const [agentOrder, setAgentOrder] = useState<string[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // Per-agent deduplication: track count of processed messages per agent
  // to avoid duplicating messages already in local state during history replay.
  const processedCountRef = useRef<Map<string, number>>(new Map());

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

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnection guard: clear any existing timer before scheduling
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => connect(), 2000);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which triggers reconnect
    };

    ws.onmessage = (event) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // ── message_history: replay full history from server ──
      if (data.type === "message_history") {
        const historyMsg = data as ServerMessageHistory;
        const agentId = historyMsg.agentId;
        const serverMessages = historyMsg.messages;

        // Convert all server messages to ChatMessages
        const chatMessages: ChatMessage[] = [];
        for (const sm of serverMessages) {
          const cm = relayChatMessage(agentId, sm);
          if (cm) chatMessages.push(cm);
        }

        // Skip messages already processed locally (dedup)
        const alreadyProcessed = processedCountRef.current.get(agentId) ?? 0;
        const newMessages = chatMessages.slice(alreadyProcessed);

        if (newMessages.length > 0) {
          setAgents((prev) => {
            const existing = prev.get(agentId);
            if (!existing) {
              // Agent not yet in local state — create it
              const next = new Map(prev);
              next.set(agentId, {
                status: "idle",
                messages: chatMessages, // use full history for new agent
                label: "",
                tmuxSession: null,
                createdAt: 0,
              });
              return next;
            }
            // Replace messages with full server history (source of truth)
            const next = new Map(prev);
            next.set(agentId, { ...existing, messages: chatMessages });
            return next;
          });
        }

        processedCountRef.current.set(agentId, chatMessages.length);
        return;
      }

      // ── cli_disconnected: show system message ──
      if (data.type === "cli_disconnected") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          status: "disconnected",
          messages: [
            ...prev.messages,
            {
              id: nextId(),
              role: "system",
              content: "CLI disconnected — attempting reconnect...",
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
        const chatMsg = relayChatMessage(agentId, data);

        if (chatMsg) {
          updateAgent(agentId, (prev) => ({
            ...prev,
            messages: [...prev.messages, chatMsg],
          }));
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
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

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

  return {
    connected,
    agents,
    agentOrder,
    activeAgentId,
    setActiveAgentId,
    activeStatus,
    activeMessages,
    spawnAgent,
    sendMessage,
    respondToControl,
    respondToUserQuestion,
  };
}
