"use client";

import { useState } from "react";
import { Play, Pencil, Trash2, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "@/lib/types";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  icebox: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  todo: "border-border text-muted-foreground",
  "in-progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  done: "bg-green-500/20 text-green-400 border-green-500/30",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  icebox: "icebox",
  todo: "todo",
  "in-progress": "in progress",
  done: "done",
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  icebox: "todo",
  todo: "in-progress",
  "in-progress": "done",
  done: "todo",
};

interface TaskCardProps {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDelete: (taskId: string) => void;
  onDelegate: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export function TaskCard({ task, onUpdate, onDelete, onDelegate, onSelectAgent }: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);
  const [editPriority, setEditPriority] = useState(task.priority);

  const startEditing = () => {
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditPriority(task.priority);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) return;
    onUpdate(task.id, { title: editTitle.trim(), description: editDesc.trim(), priority: editPriority });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditPriority(task.priority);
    setEditing(false);
  };

  return (
    <div className="group rounded-md border bg-card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border", PRIORITY_COLORS[task.priority])}
          >
            {task.priority}
          </span>
          {editing ? (
            <input
              className="min-w-0 flex-1 bg-transparent font-medium outline-none border-b border-primary"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
                if (e.key === "Escape") handleCancelEdit();
              }}
              autoFocus
            />
          ) : (
            <Tip text={task.title}>
              <span
                className={cn(
                  "truncate font-medium cursor-pointer",
                  task.status === "done" && "line-through text-muted-foreground"
                )}
                onDoubleClick={startEditing}
              >
                {task.title}
              </span>
            </Tip>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!task.agentId && task.status !== "done" && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelegate(task.id)}
              title="Delegate to agent"
            >
              <Play className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={startEditing}
            title="Edit task"
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(task.id)}
            title="Delete task"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded border bg-transparent p-1.5 text-xs outline-none resize-none"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            placeholder="Description..."
          />
          <div className="flex items-center gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors",
                  editPriority === p
                    ? PRIORITY_COLORS[p]
                    : "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
                )}
                onClick={() => setEditPriority(p)}
                type="button"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="xs" onClick={handleSaveEdit}>
              <Check className="size-3 mr-1" />
              Save
            </Button>
            <Button size="xs" variant="ghost" onClick={handleCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        task.description && (
          <Tip text={task.description}><p className="mt-1 text-muted-foreground line-clamp-2">{task.description}</p></Tip>
        )
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:brightness-125",
            STATUS_COLORS[task.status]
          )}
          onClick={() => onUpdate(task.id, { status: NEXT_STATUS[task.status] })}
          title={`Click to change to "${STATUS_LABELS[NEXT_STATUS[task.status]]}"`}
        >
          {STATUS_LABELS[task.status]}
        </button>

        {task.agentId && (
          <button
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            onClick={() => onSelectAgent(task.agentId!)}
          >
            <ExternalLink className="size-2.5" />
            view agent
          </button>
        )}
      </div>
    </div>
  );
}
