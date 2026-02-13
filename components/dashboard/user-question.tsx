"use client";

/**
 * Renders an AskUserQuestion control request as an interactive question card.
 *
 * Each question shows its options as clickable chips. For single-select
 * questions, clicking an option selects it (deselects others). For
 * multi-select, clicking toggles the option. A "Submit" button sends the
 * answers back to Claude via the control_response flow.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function UserQuestion({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond: (requestId: string, answers: Record<string, string>) => void;
}) {
  const uq = message.userQuestion;
  if (!uq) return null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-4">
      {uq.questions.map((q, i) => (
        <QuestionBlock
          key={i}
          question={q.question}
          header={q.header}
          options={q.options}
          multiSelect={q.multiSelect}
          resolved={uq.resolved}
          onSubmit={(answer) => {
            // Build the answers object keyed by question index
            // For now each question submits independently — could batch if needed
            const answers: Record<string, string> = { [`q${i}`]: answer };
            onRespond(uq.requestId, answers);
          }}
        />
      ))}
    </div>
  );
}

function QuestionBlock({
  question,
  header,
  options,
  multiSelect,
  resolved,
  onSubmit,
}: {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
  resolved?: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(idx: number) {
    if (resolved) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (multiSelect) {
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
      } else {
        if (next.has(idx)) next.clear();
        else {
          next.clear();
          next.add(idx);
        }
      }
      return next;
    });
  }

  function handleSubmit() {
    const labels = options
      .filter((_, i) => selected.has(i))
      .map((o) => o.label);
    onSubmit(labels.join(", "));
  }

  return (
    <div>
      {header && (
        <div className="mb-1 text-xs font-semibold text-muted-foreground">
          {header}
        </div>
      )}
      <div className="mb-3 text-sm">{question}</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={!!resolved}
            onClick={() => toggle(i)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs transition-colors",
              selected.has(i)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 bg-secondary hover:border-primary/50",
              resolved && "opacity-60 cursor-default"
            )}
            title={opt.description}
          >
            {opt.label}
            {opt.description && (
              <span className="ml-1 text-[10px] opacity-70">
                — {opt.description}
              </span>
            )}
          </button>
        ))}
      </div>
      {!resolved ? (
        <Button
          size="sm"
          disabled={selected.size === 0}
          onClick={handleSubmit}
        >
          Submit
        </Button>
      ) : (
        <div className="text-xs italic text-muted-foreground">Answered</div>
      )}
    </div>
  );
}
