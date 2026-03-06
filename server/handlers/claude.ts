/**
 * Handler for incoming Claude CLI NDJSON messages.
 *
 * Processes each message type, updates agent status, and relays to browsers.
 */

import { WebSocket } from "ws";
import type { ClaudeMessage } from "../../lib/types";
import {
  agents,
  setAgentStatus,
  recordAndSend,
} from "../agent-state";

/**
 * Process an incoming NDJSON message from a specific Claude CLI.
 *
 * Status flow:
 * - hook_response → send pending prompt → "thinking"
 * - system/init   → "connected" + capture session_id
 * - assistant      → "thinking"
 * - result         → "connected" (CLI stays alive for multi-turn)
 * - CLI disconnect → "done" (handled in connection close handler)
 */
export function handleClaudeMessage(agentId: string, raw: string) {
  const agent = agents.get(agentId);
  if (!agent) return;

  let msg: ClaudeMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error(`[claude:${agentId}] invalid JSON:`, raw);
    return;
  }

  // Silently ignore keep_alive messages
  if (msg.type === "keep_alive") return;

  console.log(`[claude:${agentId} →]`, msg.type, (msg as { subtype?: string }).subtype ?? "");

  // After hook_response, send the pending prompt
  if (
    msg.type === "system" &&
    (msg as { subtype?: string }).subtype === "hook_response" &&
    agent.pendingPrompt &&
    agent.claudeSocket?.readyState === WebSocket.OPEN
  ) {
    const promptContent = agent.pendingPrompt;
    const userMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content: promptContent },
      parent_tool_use_id: null,
      session_id: agent.sessionId ?? "",
    });
    console.log(`[server → claude:${agentId}]`, userMsg);
    agent.claudeSocket.send(userMsg + "\n");
    agent.pendingPrompt = null;
    setAgentStatus(agentId, "thinking");

    recordAndSend(agentId, {
      type: "relay",
      agentId,
      message: { type: "user", message: { role: "user", content: promptContent } } as ClaudeMessage,
    });
  }

  // Track status based on message type
  if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
    agent.sessionId = (msg as { session_id?: string }).session_id ?? null;
    agent.model = (msg as { model?: string }).model ?? agent.model;
    setAgentStatus(agentId, "connected");
  } else if (msg.type === "assistant") {
    setAgentStatus(agentId, "thinking");
  } else if (msg.type === "result") {
    setAgentStatus(agentId, "connected");
  }

  // Store control_request inputs for building proper responses later
  if (msg.type === "control_request") {
    const cr = msg as { request_id?: string; request?: { input?: Record<string, unknown> } };
    if (cr.request_id && cr.request?.input) {
      agent.pendingControlRequests.set(cr.request_id, cr.request.input);
    }
  }

  // Record in history and relay to browsers
  recordAndSend(agentId, { type: "relay", agentId, message: msg });
}
