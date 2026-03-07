"use client";

/**
 * Hook for managing the notification inbox state.
 * Extracted from use-websocket.ts for single-responsibility.
 */

import { useCallback, useRef, useState } from "react";
import type { NotificationItem, NotificationType } from "@/lib/types";
import type { AgentClientState } from "./use-websocket";

export function useNotifications(agentsRef: React.RefObject<Map<string, AgentClientState>>) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifCounter = useRef(0);

  const pushNotification = useCallback(
    (type: NotificationType, agentId: string, message: string) => {
      const agent = agentsRef.current.get(agentId);
      const item: NotificationItem = {
        id: `notif-${Date.now()}-${++notifCounter.current}`,
        type,
        agentId,
        agentLabel: agent?.label || agentId.slice(0, 8),
        message,
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => [item, ...prev]);
    },
    [agentsRef]
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const testNotification = useCallback(() => {
    pushNotification("done", "test", "Test notification");
  }, [pushNotification]);

  return {
    notifications,
    pushNotification,
    clearNotifications,
    dismissNotification,
    markNotificationRead,
    testNotification,
  };
}
