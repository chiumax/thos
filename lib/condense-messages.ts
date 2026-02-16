import type { ChatMessage } from "@/lib/types";

export interface SingleItem {
  kind: "single";
  message: ChatMessage;
}

export interface CondensedGroup {
  kind: "condensed";
  id: string;
  messages: ChatMessage[];
  summary: string;
  toolCounts: Record<string, number>;
  count: number;
  timestamp: number;
}

export type DisplayItem = SingleItem | CondensedGroup;

/**
 * Groups consecutive tool-only assistant messages into collapsible summaries.
 * Messages with text content, control requests, user questions, and non-assistant
 * messages all break the grouping sequence.
 *
 * Only condenses when 2+ consecutive tool-only messages are found.
 */
export function condenseMessages(messages: ChatMessage[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.isToolOnly) {
      const group: ChatMessage[] = [];
      while (i < messages.length && messages[i].isToolOnly) {
        group.push(messages[i]);
        i++;
      }

      if (group.length >= 2) {
        const toolCounts: Record<string, number> = {};
        for (const m of group) {
          for (const tc of m.toolCalls ?? []) {
            toolCounts[tc.name] = (toolCounts[tc.name] ?? 0) + 1;
          }
        }

        const breakdown = Object.entries(toolCounts)
          .map(([name, count]) => `${name} x${count}`)
          .join(", ");
        const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);

        result.push({
          kind: "condensed",
          id: `group-${group[0].id}`,
          messages: group,
          summary: `${total} tool calls (${breakdown})`,
          toolCounts,
          count: group.length,
          timestamp: group[0].timestamp,
        });
      } else {
        result.push({ kind: "single", message: group[0] });
      }
    } else {
      result.push({ kind: "single", message: msg });
      i++;
    }
  }

  return result;
}
