"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskPriority } from "@/lib/types";

interface TaskCreateFormProps {
  onCreate: (title: string, description: string, priority: TaskPriority) => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export function TaskCreateForm({ onCreate }: TaskCreateFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim(), description.trim(), priority);
    setTitle("");
    setDescription("");
    setPriority("medium");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b p-3">
      <input
        className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary"
        placeholder="Task title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none resize-none focus:border-primary"
        placeholder="Description (optional)..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="flex items-center justify-between">
        <select
          className="rounded border bg-transparent px-2 py-1 text-xs outline-none"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button type="submit" size="xs" disabled={!title.trim()}>
          <Plus className="size-3 mr-1" />
          Create
        </Button>
      </div>
    </form>
  );
}
