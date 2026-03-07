/**
 * Pure functions for converting Claude NDJSON relay messages into
 * ChatMessages for display in the UI.
 *
 * Extracted from use-websocket.ts to keep the hook focused on
 * connection/state management.
 */

import type {
  ChatMessage,
  ClaudeAssistant,
  ClaudeControlRequest,
  ClaudeResult,
  ClaudeSystemInit,
  ServerMessage,
  ToolCallInfo,
  UserQuestion,
} from "@/lib/types";

/** Module-level counter for generating unique message IDs. */
let msgCounter = 0;
export function nextId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

/**
 * Extract displayable text from a Claude assistant message.
 * Content blocks may be text, tool_use, or tool_result — each is
 * handled defensively since the array structure can vary.
 */
export function extractText(msg: ClaudeAssistant): string {
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

/**
 * Convert a server relay message into a ChatMessage, or null if it shouldn't be displayed.
 * Used both for live messages and for replaying message_history.
 */
export function relayChatMessage(agentId: string, relayMsg: ServerMessage): ChatMessage | null {
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

      // Build a map of tool_result blocks keyed by tool_use_id for preview extraction
      const resultMap = new Map<string, string>();
      for (const b of blocks) {
        if (b.type === "tool_result") {
          const tr = b as { tool_use_id?: string; content?: unknown };
          if (tr.tool_use_id) {
            const raw = typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content ?? "");
            const firstLine = raw.split("\n")[0];
            resultMap.set(tr.tool_use_id, firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine);
          }
        }
      }

      // Build ToolCallInfo for each tool_use block. For file-modifying tools
      // (Edit, Write, MultiEdit), the raw `input` object is preserved so that
      // DiffViewer can render syntax-highlighted before/after diffs.
      const DIFF_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
      const toolCalls: ToolCallInfo[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const tu = b as { name: string; id: string; input: Record<string, unknown> };
          const info: ToolCallInfo = {
            name: tu.name,
            toolUseId: tu.id,
            resultPreview: resultMap.get(tu.id),
          };
          if (DIFF_TOOLS.has(tu.name)) {
            info.input = tu.input;
          }
          return info;
        });
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
          description: cr.request.description,
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
