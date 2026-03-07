/**
 * Claude NDJSON protocol types — messages the Claude CLI sends over its
 * `--sdk-url` WebSocket connection (CLI → WS server).
 */

/**
 * Sent once after the first user prompt is received. Contains session
 * metadata like the model name, working directory, and available tools.
 */
export interface ClaudeSystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: unknown[];
  mcp_servers: unknown[];
  model: string;
  cwd: string;
}

/**
 * An assistant turn. `message.content` is an array of content blocks
 * (text, tool_use, tool_result) that may arrive incrementally — each
 * NDJSON line is a complete snapshot of the message so far.
 */
export interface ClaudeAssistant {
  type: "assistant";
  message: {
    id: string;
    role: "assistant";
    content: AssistantContentBlock[];
    model: string;
    stop_reason: string | null;
  };
  session_id: string;
}

/** A single content block inside an assistant message. */
export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Terminal message for a session. Includes cost/duration metrics.
 * `is_error` is true when `subtype` is `"error"`.
 */
export interface ClaudeResult {
  type: "result";
  subtype: "success" | "error";
  result?: string;
  error?: string;
  session_id: string;
  cost_usd: number;
  total_cost_usd?: number;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
}

/**
 * Claude is requesting permission to execute a tool. The dashboard must
 * reply with a `control_response` (allow / deny) before the CLI proceeds.
 *
 * Wire format uses a nested `request` object with `request_id` at the
 * top level for correlation (matches Companion protocol docs).
 */
export interface ClaudeControlRequest {
  type: "control_request";
  request_id: string;
  request: {
    subtype: "can_use_tool";
    tool_name: string;
    input: Record<string, unknown>;
    tool_use_id?: string;
    description?: string;
  };
  session_id?: string;
}

/**
 * Hook lifecycle events emitted during CLI startup. `hook_response` is
 * the signal that the CLI is ready to receive the first user prompt.
 */
export interface ClaudeSystemHook {
  type: "system";
  subtype: "hook_started" | "hook_response";
  session_id?: string;
}

/** Discriminated union of all known Claude NDJSON message shapes. */
export type ClaudeMessage =
  | ClaudeSystemInit
  | ClaudeAssistant
  | ClaudeResult
  | ClaudeControlRequest
  | ClaudeSystemHook
  | { type: string; subtype?: string; [key: string]: unknown };
