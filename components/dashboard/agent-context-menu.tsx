"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A single item in the context menu. */
export function ContextMenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full px-3 py-1.5 text-xs transition-colors",
        destructive
          ? "text-red-500 hover:bg-red-500/10"
          : "hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}

/** A context menu item with a hover-triggered submenu. */
export function ContextMenuSub({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const leave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-accent">
        {label}
        <ChevronRight className="ml-2 h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-[10000] min-w-[140px] rounded-md border bg-popover py-1 text-popover-foreground shadow-md">
          {children}
        </div>
      )}
    </div>
  );
}

/** Inline input for renaming an agent. */
export function RenameInput({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed) onConfirm(trimmed);
      else onCancel();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialValue) onConfirm(trimmed);
        else onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 rounded border bg-background px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
