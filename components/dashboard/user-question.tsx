"use client";

/**
 * Renders an AskUserQuestion control request as an interactive question card.
 *
 * Each question shows its options as clickable chips plus an "Other" chip that
 * reveals a freeform text input. A single "Submit" button at the bottom sends
 * all answers back to Claude via the control_response flow.
 */

import { memo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Per-question selection state. */
interface QuestionState {
  selected: Set<number>;
  otherActive: boolean;
  otherText: string;
}

export const UserQuestion = memo(function UserQuestion({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond: (requestId: string, answers: Record<string, string>) => void;
}) {
  const uq = message.userQuestion;
  if (!uq) return null;

  const questions = uq.questions;

  const [states, setStates] = useState<QuestionState[]>(() =>
    questions.map(() => ({ selected: new Set<number>(), otherActive: false, otherText: "" }))
  );

  function updateQuestion(qIdx: number, updater: (prev: QuestionState) => QuestionState) {
    if (uq?.resolved) return;
    setStates((prev) => prev.map((s, i) => (i === qIdx ? updater(s) : s)));
  }

  function toggleOption(qIdx: number, optIdx: number, multiSelect: boolean) {
    updateQuestion(qIdx, (prev) => {
      const sel = new Set(prev.selected);
      if (multiSelect) {
        if (sel.has(optIdx)) sel.delete(optIdx);
        else sel.add(optIdx);
      } else {
        if (sel.has(optIdx)) sel.clear();
        else {
          sel.clear();
          sel.add(optIdx);
        }
        // Single-select: picking a predefined option deactivates "Other"
        return { ...prev, selected: sel, otherActive: false, otherText: "" };
      }
      return { ...prev, selected: sel };
    });
  }

  function toggleOther(qIdx: number, multiSelect: boolean) {
    updateQuestion(qIdx, (prev) => {
      if (prev.otherActive) {
        // Deactivate
        return { ...prev, otherActive: false, otherText: "" };
      }
      // Activate — for single-select, clear predefined selections
      return {
        selected: multiSelect ? prev.selected : new Set<number>(),
        otherActive: true,
        otherText: prev.otherText,
      };
    });
  }

  function setOtherText(qIdx: number, text: string) {
    updateQuestion(qIdx, (prev) => ({ ...prev, otherText: text }));
  }

  function handleSubmit() {
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      const st = states[i];
      const labels = q.options
        .filter((_, j) => st.selected.has(j))
        .map((o) => o.label);
      if (st.otherActive && st.otherText.trim()) {
        labels.push(st.otherText.trim());
      }
      answers[`q${i}`] = labels.join(", ");
    });
    onRespond(uq!.requestId, answers);
  }

  // Every question must have at least one selection or non-empty "Other" text
  const allAnswered = questions.every((_, i) => {
    const st = states[i];
    if (st.selected.size > 0) return true;
    if (st.otherActive && st.otherText.trim()) return true;
    return false;
  });

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 rounded-lg border-2 border-dashed border-muted-foreground/30 p-3 md:p-4">
      {questions.map((q, i) => (
        <QuestionBlock
          key={i}
          question={q.question}
          header={q.header}
          options={q.options}
          multiSelect={q.multiSelect}
          resolved={uq.resolved}
          state={states[i]}
          onToggleOption={(optIdx) => toggleOption(i, optIdx, q.multiSelect)}
          onToggleOther={() => toggleOther(i, q.multiSelect)}
          onOtherTextChange={(text) => setOtherText(i, text)}
        />
      ))}
      {!uq.resolved ? (
        <Button size="sm" disabled={!allAnswered} onClick={handleSubmit}>
          Submit
        </Button>
      ) : (
        <div className="text-xs italic text-muted-foreground">Answered</div>
      )}
    </div>
  );
});

function QuestionBlock({
  question,
  header,
  options,
  resolved,
  state,
  onToggleOption,
  onToggleOther,
  onOtherTextChange,
}: {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
  resolved?: boolean;
  state: QuestionState;
  onToggleOption: (optIdx: number) => void;
  onToggleOther: () => void;
  onOtherTextChange: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {header && (
        <div className="mb-1 text-xs font-semibold text-muted-foreground">
          {header}
        </div>
      )}
      <div className="mb-3 text-sm">{question}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={!!resolved}
            onClick={() => onToggleOption(i)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs transition-colors",
              state.selected.has(i)
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
        <button
          type="button"
          disabled={!!resolved}
          onClick={() => {
            onToggleOther();
            // Focus the input after React re-renders
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs transition-colors",
            state.otherActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 bg-secondary hover:border-primary/50",
            resolved && "opacity-60 cursor-default"
          )}
        >
          Other
          <span className="ml-1 text-[10px] opacity-70">
            — Provide your own response
          </span>
        </button>
      </div>
      {state.otherActive && !resolved && (
        <input
          ref={inputRef}
          type="text"
          value={state.otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          placeholder="Tell Claude what to do instead..."
          className="mt-2 w-full rounded-md border border-muted-foreground/30 bg-secondary px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
      )}
    </div>
  );
}
