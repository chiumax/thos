"use client";

/**
 * Dashboard route (`/dashboard`).
 *
 * Orchestrates the multi-agent WebSocket hook, sidebar, chat panel, and
 * task panel. Clicking "+" or selecting "New Agent" sets `activeAgentId`
 * to `null`, which shows the spawn input. On spawn, the server responds
 * with `spawned` and the hook auto-selects the new agent.
 *
 * ## Loading states
 *
 * Two loading flags from the hook control the UI:
 * - `initialLoadDone` — false until the first `agent_list` arrives from
 *   the server. While false, the sidebar shows skeleton rows.
 * - `historyLoading` — true when the active agent's message history has
 *   not been fetched yet (lazy loading). The chat shows a "Loading
 *   messages..." indicator until the server responds.
 *
 * Sidebar uses `!initialLoadDone`, chat uses `!initialLoadDone || historyLoading`.
 */

import { useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { AgentSidebar } from "@/components/dashboard/agent-sidebar";
import { Chat } from "@/components/dashboard/chat";
import { TaskPanel, type TaskViewMode } from "@/components/dashboard/kanban-board";
import { FolderBrowser } from "@/components/dashboard/folder-browser";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const {
    connected,
    initialLoadDone,
    historyLoading,
    agents,
    agentOrder,
    activeAgentId,
    setActiveAgentId,
    activeStatus,
    activeMessages,
    activeRawMessages,
    spawnAgent,
    sendMessage,
    respondToControl,
    respondToUserQuestion,
    killAgent,
    deleteAgent,
    renameAgent,
    clearHistory,
    tasks,
    createTask,
    updateTask,
    deleteTask,
    delegateTask,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    browseDirectory,
    directoryListing,
  } = useWebSocket();

  const [taskView, setTaskView] = useState<"hidden" | TaskViewMode>("hidden");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);

  // Derive initial path from first workspace or fallback to "/"
  const initialBrowsePath = workspaces.length > 0 ? workspaces[0].cwd : "/";

  useEffect(() => {
    document.title = "thos — dashboard";
  }, []);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      {/* Sidebar backdrop (mobile only) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-200 ease-in-out md:relative md:z-auto md:translate-x-0 md:transition-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <AgentSidebar
          agents={agents}
          agentOrder={agentOrder}
          activeAgentId={activeAgentId}
          loading={!initialLoadDone}
          onSelect={(id) => {
            setActiveAgentId(id);
            setSidebarOpen(false);
          }}
          onNewAgent={() => {
            setActiveAgentId(null);
            setSidebarOpen(false);
          }}
          onKill={killAgent}
          onDelete={deleteAgent}
          onRename={renameAgent}
          onClearHistory={clearHistory}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={setActiveWorkspaceId}
          onRenameWorkspace={renameWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onOpenFolder={() => setFolderBrowserOpen(true)}
        />
      </div>

      {/* Main chat area (hidden in board mode) */}
      <div className={cn("flex min-w-0 flex-1 flex-col", taskView === "board" && "hidden")}>
        <Chat
          connected={connected}
          loading={!initialLoadDone || historyLoading}
          status={activeStatus}
          messages={activeMessages}
          rawMessages={activeRawMessages}
          onSendMessage={sendMessage}
          onSpawnAgent={spawnAgent}
          onRespondToControl={respondToControl}
          onRespondToUserQuestion={respondToUserQuestion}
          showTasks={taskView !== "hidden"}
          onToggleTasks={() => setTaskView((v) => (v === "hidden" ? "list" : "hidden"))}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
      </div>

      {/* Task panel backdrop (mobile only) */}
      {taskView !== "hidden" && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setTaskView("hidden")}
        />
      )}

      {/* Task panel drawer */}
      {taskView !== "hidden" && (
        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 border-l bg-background flex flex-col min-w-0 md:relative md:z-auto",
            taskView === "board"
              ? "w-full max-w-none"
              : "w-80 max-w-[calc(100vw-3rem)] md:max-w-none"
          )}
        >
          <TaskPanel
            tasks={tasks}
            mode={taskView}
            onModeChange={(mode) => setTaskView(mode)}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onDelegateTask={delegateTask}
            onSelectAgent={(agentId) => {
              setActiveAgentId(agentId);
            }}
            onClose={() => setTaskView("hidden")}
          />
        </div>
      )}

      {/* Folder browser modal */}
      <FolderBrowser
        open={folderBrowserOpen}
        onClose={() => setFolderBrowserOpen(false)}
        directoryListing={directoryListing}
        onBrowse={browseDirectory}
        onCreate={(name, cwd) => {
          createWorkspace(name, cwd);
          setFolderBrowserOpen(false);
        }}
        initialPath={initialBrowsePath}
      />
    </div>
  );
}
