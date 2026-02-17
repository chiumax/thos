"use client";

import type { LucideIcon } from "lucide-react";
import {
  GitCommit,
  GitPullRequest,
  Trash2,
  Minimize2,
  DollarSign,
  Stethoscope,
  FileText,
  Settings,
  Brain,
  Activity,
  Cpu,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommand {
  name: string;
  description: string;
  icon: LucideIcon;
  clientSide?: boolean;
}

export const COMMANDS: SlashCommand[] = [
  { name: "commit", description: "Create a git commit", icon: GitCommit },
  { name: "review-pr", description: "Review a pull request", icon: GitPullRequest },
  { name: "clear", description: "Clear conversation history", icon: Trash2, clientSide: true },
  { name: "compact", description: "Compact conversation context", icon: Minimize2 },
  { name: "cost", description: "Show token usage and costs", icon: DollarSign },
  { name: "doctor", description: "Check environment health", icon: Stethoscope },
  { name: "init", description: "Initialize CLAUDE.md", icon: FileText },
  { name: "config", description: "Open configuration", icon: Settings },
  { name: "memory", description: "Edit memory files", icon: Brain },
  { name: "status", description: "Show agent status", icon: Activity },
  { name: "model", description: "Change model", icon: Cpu },
  { name: "help", description: "Show available commands", icon: HelpCircle },
];

export function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS;
  const q = query.toLowerCase();
  return COMMANDS.filter((cmd) => cmd.name.toLowerCase().includes(q));
}

export function SlashCommandMenu({
  query,
  highlightedIndex,
  onSelect,
  onHighlight,
}: {
  query: string;
  highlightedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHighlight: (index: number) => void;
}) {
  const filtered = filterCommands(query);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border bg-popover p-3 shadow-lg">
        <span className="text-sm text-muted-foreground">No matching commands</span>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.name}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors",
              i === highlightedIndex
                ? "bg-accent text-accent-foreground"
                : "text-popover-foreground hover:bg-muted/50"
            )}
            onMouseEnter={() => onHighlight(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // prevent input blur
              onSelect(cmd);
            }}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-medium">/{cmd.name}</span>
              <span className="ml-2 text-muted-foreground">{cmd.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
