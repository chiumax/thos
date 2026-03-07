"use client";

/**
 * React hook that manages the WebSocket connection to the thos relay server.
 *
 * Supports multiple concurrent agents. Each agent has its own status,
 * message history, label, and tmux session name tracked in a Map keyed
 * by agent ID. The `activeAgentId` determines which agent's chat is shown.
 *
 * Connection management, message parsing, and domain actions are split
 * into focused modules:
 * - `message-parser.ts` — pure functions for converting relay messages
 * - `use-agent-actions.ts` — agent lifecycle callbacks
 * - `use-task-actions.ts` — task CRUD callbacks
 * - `use-workspace-actions.ts` — workspace CRUD callbacks
 * - `use-notifications.ts` — notification inbox state
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  AgentStatus,
  ChatMessage,
  ClaudeControlRequest,
  ClaudeMessage,
  ClaudeResult,
  ClaudeSystemInit,
  DirectoryEntry,
  ServerMessage,
  ServerMessageHistory,
  ServerTaskList,
  ServerTaskUpdated,
  ServerTaskDeleted,
  Task,
  Workspace,
} from "@/lib/types";
import { sfxTool, sfxDone, sfxError, sfxQuestion, sfxBegin } from "@/lib/sfx";
import {
  notifyDone,
  notifyError,
  notifyControlRequest,
  notifyQuestion,
} from "@/lib/notifications";
import { relayChatMessage, nextId } from "./message-parser";
import { useAgentActions } from "./use-agent-actions";
import { useTaskActions } from "./use-task-actions";
import { useWorkspaceActions } from "./use-workspace-actions";
import { useNotifications } from "./use-notifications";

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
  /** Model name from system/init or agent_list. */
  model?: string;
  /** Whether this agent is pinned to the top of the sidebar. */
  pinned?: boolean;
  /** Whether this agent is in the icebox. */
  iceboxed?: boolean;
  /** Workspace this agent belongs to. */
  workspaceId?: string | null;
}

/** Console logger with [thos] prefix for easy filtering. */
function log(...args: unknown[]) {
  console.log("[thos-ws]", ...args);
}

interface UseWebSocketOptions {
  /** Agent ID from URL. Controls which agent is active. */
  activeAgentId: string | null;
  /** Called when the hook wants to change the active agent (spawn, delete, auto-select). */
  onNavigateToAgent: (agentId: string | null) => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { activeAgentId, onNavigateToAgent } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Multi-agent state
  const [agents, setAgents] = useState<Map<string, AgentClientState>>(new Map());
  const [agentOrder, setAgentOrder] = useState<string[]>([]);

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Refs for accessing current state inside the onmessage closure.
  const activeAgentIdRef = useRef(activeAgentId);
  activeAgentIdRef.current = activeAgentId;
  const onNavigateRef = useRef(onNavigateToAgent);
  onNavigateRef.current = onNavigateToAgent;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Per-agent deduplication
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

  // ── Compose action hooks ──────────────────────────────────────────────

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const agentActions = useAgentActions(send, activeAgentIdRef, onNavigateRef, updateAgent);
  const taskActions = useTaskActions(send);
  const workspaceActions = useWorkspaceActions(send);
  const notifActions = useNotifications(agentsRef);

  /** Build notification options for an agent event. */
  const notifyOpts = (agentId: string) => {
    const agent = agentsRef.current.get(agentId);
    return {
      agentId,
      agentLabel: agent?.label || agentId.slice(0, 8),
      isActiveAgent: agentId === activeAgentIdRef.current,
    };
  };

  // ── WebSocket connection ──────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

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
      if (closingRef.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      log("scheduling reconnect in 2s");
      reconnectTimer.current = setTimeout(() => connect(), 2000);
    };

    ws.onerror = (e) => {
      log("error", e);
    };

    ws.onmessage = (event) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      log("←", data.type, "agentId" in data ? (data as { agentId: string }).agentId : "");

      // ── workspace_list ──
      if (data.type === "workspace_list") {
        const wsList = (data as { workspaces: Workspace[] }).workspaces;
        log("workspace_list:", wsList.length, "workspaces");
        setWorkspaces(wsList);
        return;
      }

      // ── directory_listing ──
      if (data.type === "directory_listing") {
        const listing = data as { path: string; entries: DirectoryEntry[] };
        log("directory_listing:", listing.path, listing.entries.length, "entries");
        workspaceActions.setDirectoryListing({ path: listing.path, entries: listing.entries });
        return;
      }

      // ── task_list ──
      if (data.type === "task_list") {
        log("task_list:", (data as ServerTaskList).tasks.length, "tasks");
        setTasks((data as ServerTaskList).tasks);
        return;
      }

      // ── task_updated ──
      if (data.type === "task_updated") {
        const updated = (data as ServerTaskUpdated).task;
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        return;
      }

      // ── task_deleted ──
      if (data.type === "task_deleted") {
        const deletedId = (data as ServerTaskDeleted).taskId;
        setTasks((prev) => prev.filter((t) => t.id !== deletedId));
        return;
      }

      // ── message_history ──
      if (data.type === "message_history") {
        const historyMsg = data as ServerMessageHistory;
        const agentId = historyMsg.agentId;
        const serverMessages = historyMsg.messages;
        log("message_history:", agentId, serverMessages.length, "raw msgs");

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

      // ── history_cleared ──
      if (data.type === "history_cleared") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [],
          rawMessages: [],
        }));
        processedCountRef.current.set(data.agentId, 0);
        return;
      }

      // ── cli_disconnected ──
      if (data.type === "cli_disconnected") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { id: nextId(), role: "system", content: "CLI session ended", timestamp: Date.now() },
          ],
        }));
        return;
      }

      // ── cli_connected ──
      if (data.type === "cli_connected") {
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { id: nextId(), role: "system", content: "CLI reconnected", timestamp: Date.now() },
          ],
        }));
        return;
      }

      // ── agent_list ──
      if (data.type === "agent_list") {
        const serverAgents = data.agents as AgentInfo[];
        log("agent_list:", serverAgents.length, "agents:", serverAgents.map((a) => `${a.agentId}(${a.status})`).join(", "));
        setAgents((prev) => {
          const next = new Map(prev);
          const serverIds = new Set(serverAgents.map((a) => a.agentId));

          for (const info of serverAgents) {
            const existing = next.get(info.agentId);
            if (existing) {
              next.set(info.agentId, {
                ...existing,
                status: info.status,
                tmuxSession: info.tmuxSession,
                label: info.label,
                model: info.model ?? existing.model,
                pinned: info.pinned ?? false,
                iceboxed: info.iceboxed ?? false,
                workspaceId: info.workspaceId,
              });
            } else {
              next.set(info.agentId, {
                status: info.status,
                messages: [],
                rawMessages: [],
                label: info.label,
                tmuxSession: info.tmuxSession,
                createdAt: info.createdAt,
                model: info.model ?? undefined,
                pinned: info.pinned ?? false,
                iceboxed: info.iceboxed ?? false,
                workspaceId: info.workspaceId,
              });
            }
          }

          for (const id of next.keys()) {
            if (!serverIds.has(id)) {
              next.delete(id);
            }
          }

          return next;
        });
        setAgentOrder(serverAgents.map((a) => a.agentId));
        setInitialLoadDone(true);

        const currentId = activeAgentIdRef.current;
        const serverIds = new Set(serverAgents.map((a) => a.agentId));
        if (currentId === null && serverAgents.length > 0) {
          onNavigateRef.current(serverAgents[0].agentId);
        } else if (currentId !== null && !serverIds.has(currentId) && serverAgents.length > 0) {
          onNavigateRef.current(serverAgents[0].agentId);
        }
        return;
      }

      // ── spawned ──
      if (data.type === "spawned") {
        onNavigateRef.current(data.agentId);
        return;
      }

      // ── status ──
      if (data.type === "status") {
        updateAgent(data.agentId, (prev) => ({ ...prev, status: data.status }));
        return;
      }

      // ── error ──
      if (data.type === "error") {
        sfxError();
        updateAgent(data.agentId, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { id: nextId(), role: "system", content: `Error: ${data.error}`, timestamp: Date.now() },
          ],
        }));
        processedCountRef.current.set(
          data.agentId,
          (processedCountRef.current.get(data.agentId) ?? 0) + 1
        );
        return;
      }

      // ── relay ──
      if (data.type === "relay") {
        const agentId = data.agentId;
        const rawMsg = data.message;
        const chatMsg = relayChatMessage(agentId, data);

        // SFX: tool calls
        if (chatMsg?.toolCalls?.length) {
          const first = chatMsg.toolCalls.find((tc) => tc.name);
          if (first) sfxTool(first.name);
        }

        // SFX + notifications: result
        if (rawMsg.type === "result") {
          const result = rawMsg as ClaudeResult;
          if (result.is_error) {
            sfxError();
            notifyError(notifyOpts(agentId));
            notifActions.pushNotification("error", agentId, "Agent error");
          } else {
            sfxDone();
            notifyDone(notifyOpts(agentId));
            notifActions.pushNotification("done", agentId, "Agent finished");
          }
        }

        // SFX + notifications: control request
        if (rawMsg.type === "control_request") {
          sfxQuestion();
          const cr = rawMsg as ClaudeControlRequest;
          if (cr.request.tool_name === "AskUserQuestion") {
            notifyQuestion(notifyOpts(agentId));
            notifActions.pushNotification("question", agentId, "Question from agent");
          } else {
            notifyControlRequest({
              ...notifyOpts(agentId),
              toolName: cr.request.tool_name,
            });
            notifActions.pushNotification("control_request", agentId, `Approval needed: ${cr.request.tool_name}`);
          }
        }

        // SFX: session start
        if (rawMsg.type === "system" && (rawMsg as { subtype?: string }).subtype === "init") {
          sfxBegin();
        }

        // Capture model from system/init
        const initModel =
          rawMsg.type === "system" && (rawMsg as { subtype?: string }).subtype === "init"
            ? (rawMsg as ClaudeSystemInit).model
            : undefined;

        updateAgent(agentId, (prev) => ({
          ...prev,
          rawMessages: [...prev.rawMessages, rawMsg],
          messages: chatMsg ? [...prev.messages, chatMsg] : prev.messages,
          ...(initModel ? { model: initModel } : {}),
        }));
        if (chatMsg) {
          processedCountRef.current.set(
            agentId,
            (processedCountRef.current.get(agentId) ?? 0) + 1
          );
        }
        return;
      }
    };
  }, [updateAgent, workspaceActions, notifActions]);

  useEffect(() => {
    closingRef.current = false;
    connect();
    return () => {
      closingRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Request history for the active agent if not already loaded.
  useEffect(() => {
    if (!activeAgentId || loadedAgents.has(activeAgentId)) return;
    log("requesting history for", activeAgentId);
    send({ type: "request_history", agentId: activeAgentId });
  }, [activeAgentId, loadedAgents, send]);

  // ── Derived values ──────────────────────────────────────────────────

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
  const activeModel = activeAgent?.model ?? null;
  const historyLoading = activeAgentId !== null && !loadedAgents.has(activeAgentId);

  return {
    connected,
    initialLoadDone,
    historyLoading,
    agents,
    agentOrder,
    activeAgentId,
    activeStatus,
    activeMessages,
    activeRawMessages,
    activeModel,
    // Agent actions
    ...agentActions,
    // Task state + actions
    tasks,
    ...taskActions,
    // Workspace state + actions
    workspaces,
    activeWorkspaceId: workspaceActions.activeWorkspaceId,
    setActiveWorkspaceId: workspaceActions.setActiveWorkspaceId,
    createWorkspace: workspaceActions.createWorkspace,
    renameWorkspace: workspaceActions.renameWorkspace,
    deleteWorkspace: workspaceActions.deleteWorkspace,
    browseDirectory: workspaceActions.browseDirectory,
    directoryListing: workspaceActions.directoryListing,
    // Notification state + actions
    notifications: notifActions.notifications,
    clearNotifications: notifActions.clearNotifications,
    dismissNotification: notifActions.dismissNotification,
    markNotificationRead: notifActions.markNotificationRead,
    testNotification: notifActions.testNotification,
  };
}
