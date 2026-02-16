"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { TaskCreateForm } from "./task-create-form";
import type { Task, TaskPriority } from "@/lib/types";

interface TaskPanelProps {
  tasks: Task[];
  onCreateTask: (title: string, description: string, priority: TaskPriority) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onClose: () => void;
}

export function TaskPanel({
  tasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
  onClose,
}: TaskPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const grouped = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === "in-progress");
    const todo = tasks.filter((t) => t.status === "todo");
    const done = tasks.filter((t) => t.status === "done");
    return { inProgress, todo, done };
  }, [tasks]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Tasks</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowCreate((v) => !v)}
            title="New task"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close panel">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <TaskCreateForm
          onCreate={(title, description, priority) => {
            onCreateTask(title, description, priority);
            setShowCreate(false);
          }}
        />
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !showCreate && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No tasks yet
          </div>
        )}

        {/* In Progress */}
        {grouped.inProgress.length > 0 && (
          <TaskGroup label="In Progress" count={grouped.inProgress.length}>
            {grouped.inProgress.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onDelegate={onDelegateTask}
                onSelectAgent={onSelectAgent}
              />
            ))}
          </TaskGroup>
        )}

        {/* Todo */}
        {grouped.todo.length > 0 && (
          <TaskGroup label="Todo" count={grouped.todo.length}>
            {grouped.todo.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onDelegate={onDelegateTask}
                onSelectAgent={onSelectAgent}
              />
            ))}
          </TaskGroup>
        )}

        {/* Done (collapsible) */}
        {grouped.done.length > 0 && (
          <div className="border-t">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDone((v) => !v)}
            >
              <span className="font-semibold">Done ({grouped.done.length})</span>
              <ChevronDown
                className={cn("size-3 transition-transform", showDone && "rotate-180")}
              />
            </button>
            {showDone && (
              <div className="space-y-2 px-3 pb-3">
                {grouped.done.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdate={onUpdateTask}
                    onDelete={onDeleteTask}
                    onDelegate={onDelegateTask}
                    onSelectAgent={onSelectAgent}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
        {label} ({count})
      </div>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </div>
  );
}
