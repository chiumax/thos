"use client";

/**
 * Hook for workspace CRUD actions.
 * Extracted from use-websocket.ts for single-responsibility.
 */

import { useCallback, useState } from "react";
import type { DirectoryEntry } from "@/lib/types";

export function useWorkspaceActions(send: (data: object) => void) {
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [directoryListing, setDirectoryListing] = useState<{ path: string; entries: DirectoryEntry[] } | null>(null);

  const setActiveWorkspaceId = useCallback(
    (workspaceId: string | null) => {
      setActiveWorkspaceIdState(workspaceId);
      send({ type: "set_workspace", workspaceId });
    },
    [send]
  );

  const createWorkspace = useCallback(
    (name: string, cwd: string) => {
      send({ type: "create_workspace", name, cwd });
    },
    [send]
  );

  const renameWorkspace = useCallback(
    (workspaceId: string, name: string) => {
      send({ type: "rename_workspace", workspaceId, name });
    },
    [send]
  );

  const deleteWorkspace = useCallback(
    (workspaceId: string) => {
      send({ type: "delete_workspace", workspaceId });
      setActiveWorkspaceIdState((prev) => (prev === workspaceId ? null : prev));
    },
    [send]
  );

  const browseDirectory = useCallback(
    (path: string) => {
      send({ type: "browse_directory", path });
    },
    [send]
  );

  return {
    activeWorkspaceId,
    setActiveWorkspaceId,
    directoryListing,
    setDirectoryListing,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    browseDirectory,
  };
}
