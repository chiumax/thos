"use client";

/**
 * Hook for task CRUD actions.
 * Extracted from use-websocket.ts for single-responsibility.
 */

import { useCallback } from "react";
import type { Task, TaskPriority } from "@/lib/types";

export function useTaskActions(send: (data: object) => void) {
  const createTask = useCallback(
    (title: string, description: string, priority: TaskPriority) => {
      send({ type: "create_task", title, description, priority });
    },
    [send]
  );

  const updateTask = useCallback(
    (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "status" | "priority">>) => {
      send({ type: "update_task", taskId, updates });
    },
    [send]
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      send({ type: "delete_task", taskId });
    },
    [send]
  );

  const delegateTask = useCallback(
    (taskId: string) => {
      send({ type: "delegate_task", taskId });
    },
    [send]
  );

  return { createTask, updateTask, deleteTask, delegateTask };
}
