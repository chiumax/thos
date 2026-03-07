"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Curated list of common models for the dropdown. */
const MODEL_PRESETS = [
  { value: "", label: "Default (CLI)", description: "Use CLI default model" },
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4", description: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4", description: "Claude Opus 4" },
  { value: "qwen3-coder", label: "Qwen3 Coder", description: "Ollama — Qwen3 Coder" },
  { value: "devstral", label: "Devstral", description: "Ollama — Devstral" },
];

/** Shorten a model name for display (e.g. "claude-sonnet-4-20250514" → "sonnet-4"). */
function shortModel(model: string): string {
  const preset = MODEL_PRESETS.find((p) => p.value === model);
  if (preset && preset.value) return preset.label;
  const m = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  return m || model;
}

export function ModelSelector({
  activeModel,
  selectedModel,
  onModelChange,
  isActive,
}: {
  activeModel?: string | null;
  selectedModel?: string;
  onModelChange: (model: string) => void;
  isActive: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowCustom(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    if (showCustom) customInputRef.current?.focus();
  }, [showCustom]);

  const displayModel = activeModel ?? (selectedModel || null);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono transition-colors",
          "hover:bg-muted/80 text-muted-foreground",
          dropdownOpen && "bg-muted"
        )}
        title={displayModel ? `Model: ${displayModel}` : "Select model for next spawn"}
      >
        <span className="max-w-[120px] truncate text-[10px] md:text-xs md:max-w-[180px]">
          {displayModel ? shortModel(displayModel) : "model"}
        </span>
        <ChevronDown className="size-3 shrink-0" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-md border bg-popover p-1 shadow-md">
          {isActive && activeModel && (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b mb-1">
              Active: <span className="font-mono">{activeModel}</span>
            </div>
          )}
          <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
            Next spawn
          </div>
          {MODEL_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                onModelChange(preset.value);
                setDropdownOpen(false);
                setShowCustom(false);
              }}
              className={cn(
                "flex w-full flex-col rounded px-2 py-1.5 text-left transition-colors hover:bg-accent",
                selectedModel === preset.value && "bg-accent"
              )}
            >
              <span className="text-xs font-medium">{preset.label}</span>
              <span className="text-[10px] text-muted-foreground">{preset.description}</span>
            </button>
          ))}
          <div className="my-1 border-t" />
          {showCustom ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = customInput.trim();
                if (val) {
                  onModelChange(val);
                  setCustomInput("");
                  setShowCustom(false);
                  setDropdownOpen(false);
                }
              }}
              className="px-2 py-1"
            >
              <input
                ref={customInputRef}
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="e.g. llama3.3:70b"
                className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </form>
          ) : (
            <button
              onClick={() => setShowCustom(true)}
              className="flex w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Custom model...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
