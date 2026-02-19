"use client";

import { useMemo, useState, useCallback } from "react";
import { ChevronDown, Columns3, List, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { TaskCreateForm } from "./task-create-form";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

export type TaskViewMode = "list" | "board";

interface TaskPanelProps {
  tasks: Task[];
  mode: TaskViewMode;
  onModeChange: (mode: TaskViewMode) => void;
  onCreateTask: (title: string, description: string, priority: TaskPriority) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onClose: () => void;
}

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "icebox", label: "Icebox", color: "text-purple-400" },
  { status: "todo", label: "Todo", color: "text-muted-foreground" },
  { status: "in-progress", label: "In Progress", color: "text-blue-400" },
  { status: "done", label: "Done", color: "text-green-400" },
];

export function TaskPanel({
  tasks,
  mode,
  onModeChange,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
  onClose,
}: TaskPanelProps) {
  const [showCreate, setShowCreate] = useState(false);

  const grouped = useMemo(() => {
    const icebox = tasks.filter((t) => t.status === "icebox");
    const todo = tasks.filter((t) => t.status === "todo");
    const inProgress = tasks.filter((t) => t.status === "in-progress");
    const done = tasks.filter((t) => t.status === "done");
    return { icebox, todo, "in-progress": inProgress, done };
  }, [tasks]);

  const handleDrop = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      onUpdateTask(taskId, { status: newStatus });
    },
    [tasks, onUpdateTask]
  );

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Tasks</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onModeChange(mode === "list" ? "board" : "list")}
            title={mode === "list" ? "Board view" : "List view"}
          >
            {mode === "list" ? <Columns3 className="size-3.5" /> : <List className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowCreate((v) => !v)}
            title="New task"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
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

      {/* Content */}
      {mode === "board" ? (
        <div className="flex flex-1 gap-3 overflow-x-auto p-3">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              color={col.color}
              tasks={grouped[col.status]}
              onDrop={handleDrop}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
              onDelegateTask={onDelegateTask}
              onSelectAgent={onSelectAgent}
            />
          ))}
        </div>
      ) : (
        <TaskListView
          grouped={grouped}
          onDrop={handleDrop}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDelegateTask={onDelegateTask}
          onSelectAgent={onSelectAgent}
        />
      )}
    </div>
  );
}

// ── List view (right sidebar) ───────────────────────────────────────────

function TaskListView({
  grouped,
  onDrop,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
}: {
  grouped: Record<TaskStatus, Task[]>;
  onDrop: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const [showIcebox, setShowIcebox] = useState(false);

  const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      {total === 0 && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          No tasks yet
        </div>
      )}

      {/* In Progress */}
      {grouped["in-progress"].length > 0 && (
        <TaskGroup
          status="in-progress"
          label="In Progress"
          count={grouped["in-progress"].length}
          tasks={grouped["in-progress"]}
          onDrop={onDrop}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDelegateTask={onDelegateTask}
          onSelectAgent={onSelectAgent}
        />
      )}

      {/* Todo */}
      {grouped.todo.length > 0 && (
        <TaskGroup
          status="todo"
          label="Todo"
          count={grouped.todo.length}
          tasks={grouped.todo}
          onDrop={onDrop}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDelegateTask={onDelegateTask}
          onSelectAgent={onSelectAgent}
        />
      )}

      {/* Icebox (collapsible) */}
      {grouped.icebox.length > 0 && (
        <CollapsibleGroup
          label="Icebox"
          count={grouped.icebox.length}
          open={showIcebox}
          onToggle={() => setShowIcebox((v) => !v)}
          status="icebox"
          tasks={grouped.icebox}
          onDrop={onDrop}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDelegateTask={onDelegateTask}
          onSelectAgent={onSelectAgent}
        />
      )}

      {/* Done (collapsible) */}
      {grouped.done.length > 0 && (
        <CollapsibleGroup
          label="Done"
          count={grouped.done.length}
          open={showDone}
          onToggle={() => setShowDone((v) => !v)}
          status="done"
          tasks={grouped.done}
          onDrop={onDrop}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDelegateTask={onDelegateTask}
          onSelectAgent={onSelectAgent}
        />
      )}
    </div>
  );
}

function TaskGroup({
  status,
  label,
  count,
  tasks,
  onDrop,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  tasks: Task[];
  onDrop: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn("border-t transition-colors", dragOver && "bg-primary/5")}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, status); }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
        {label} ({count})
      </div>
      <div className="space-y-2 px-3 pb-3">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            onUpdate={onUpdateTask}
            onDelete={onDeleteTask}
            onDelegate={onDelegateTask}
            onSelectAgent={onSelectAgent}
          />
        ))}
      </div>
    </div>
  );
}

function CollapsibleGroup({
  label,
  count,
  open,
  onToggle,
  status,
  tasks,
  onDrop,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  status: TaskStatus;
  tasks: Task[];
  onDrop: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn("border-t transition-colors", dragOver && "bg-primary/5")}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, status); }}
    >
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={onToggle}
      >
        <span className="font-semibold">{label} ({count})</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {tasks.map((task) => (
            <DraggableTaskCard
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
  );
}

// ── Kanban column (board view) ──────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  color,
  tasks,
  onDrop,
  onUpdateTask,
  onDeleteTask,
  onDelegateTask,
  onSelectAgent,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  onDrop: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDeleteTask: (taskId: string) => void;
  onDelegateTask: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        "flex min-w-[240px] flex-1 flex-col rounded-lg border bg-muted/20 transition-colors",
        dragOver && "border-primary/50 bg-primary/5"
      )}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, status); }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className={cn("text-xs font-semibold", color)}>
          {label} ({tasks.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            onUpdate={onUpdateTask}
            onDelete={onDeleteTask}
            onDelegate={onDelegateTask}
            onSelectAgent={onSelectAgent}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center text-xs text-muted-foreground/50 py-8">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ── Draggable card wrapper ──────────────────────────────────────────────

function DraggableTaskCard({
  task,
  onUpdate,
  onDelete,
  onDelegate,
  onSelectAgent,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => void;
  onDelete: (taskId: string) => void;
  onDelegate: (taskId: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; setDragging(true); }}
      onDragEnd={() => setDragging(false)}
      className={cn("transition-opacity", dragging && "opacity-40")}
    >
      <TaskCard
        task={task}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDelegate={onDelegate}
        onSelectAgent={onSelectAgent}
      />
    </div>
  );
}
