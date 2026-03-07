"use client";

/**
 * Hook for agent management actions (kill, delete, rename, etc.).
 * Extracted from use-websocket.ts for single-responsibility.
 */

import { useCallback } from "react";
import type { AgentClientState } from "./use-websocket";
import { nextId } from "./message-parser";
import { sfxSend } from "@/lib/sfx";

export function useAgentActions(
  send: (data: object) => void,
  activeAgentIdRef: React.RefObject<string | null>,
  onNavigateRef: React.RefObject<(agentId: string | null) => void>,
  updateAgent: (agentId: string, updater: (prev: AgentClientState) => AgentClientState) => void,
) {
  const spawnAgent = useCallback(
    (prompt: string, model?: string, systemPrompt?: string) => {
      send({
        type: "spawn",
        prompt,
        ...(model ? { model } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
      });
    },
    [send]
  );

  const sendMessage = useCallback(
    (content: string) => {
      const activeAgentId = activeAgentIdRef.current;
      if (!activeAgentId) return;
      // Optimistically add user message to local state
      updateAgent(activeAgentId, (prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: nextId(),
            role: "user" as const,
            content,
            timestamp: Date.now(),
          },
        ],
      }));
      send({ type: "send_message", agentId: activeAgentId, content });
      sfxSend();
    },
    [send, activeAgentIdRef, updateAgent]
  );

  const respondToControl = useCallback(
    (requestId: string, allow: boolean) => {
      const activeAgentId = activeAgentIdRef.current;
      if (!activeAgentId) return;
      send({ type: "control_response", agentId: activeAgentId, request_id: requestId, allow });
      updateAgent(activeAgentId, (prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.controlRequest?.id === requestId
            ? { ...m, controlRequest: { ...m.controlRequest, resolved: true, allowed: allow } }
            : m
        ),
      }));
    },
    [send, activeAgentIdRef, updateAgent]
  );

  const respondToUserQuestion = useCallback(
    (requestId: string, answers: Record<string, string>) => {
      const activeAgentId = activeAgentIdRef.current;
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
    [send, activeAgentIdRef, updateAgent]
  );

  const killAgent = useCallback(
    (agentId: string) => {
      send({ type: "kill_agent", agentId });
    },
    [send]
  );

  const deleteAgent = useCallback(
    (agentId: string) => {
      send({ type: "delete_agent", agentId });
      if (activeAgentIdRef.current === agentId) {
        onNavigateRef.current(null);
      }
    },
    [send, activeAgentIdRef, onNavigateRef]
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

  const pinAgent = useCallback(
    (agentId: string, pinned: boolean) => {
      send({ type: "pin_agent", agentId, pinned });
    },
    [send]
  );

  const iceboxAgent = useCallback(
    (agentId: string, iceboxed: boolean) => {
      send({ type: "icebox_agent", agentId, iceboxed });
    },
    [send]
  );

  const moveAgent = useCallback(
    (agentId: string, workspaceId: string | null) => {
      send({ type: "move_agent", agentId, workspaceId });
    },
    [send]
  );

  return {
    spawnAgent,
    sendMessage,
    respondToControl,
    respondToUserQuestion,
    killAgent,
    deleteAgent,
    renameAgent,
    clearHistory,
    pinAgent,
    iceboxAgent,
    moveAgent,
  };
}
