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

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  initNotifications,
  isNotificationsEnabled,
  setNotificationsEnabled,
  requestPermission,
} from "@/lib/notifications";
import { AgentSidebar } from "@/components/dashboard/agent-sidebar";
import { AgentWorld } from "@/components/dashboard/agent-world";
import { Chat } from "@/components/dashboard/chat";
import { TaskPanel, type TaskViewMode } from "@/components/dashboard/kanban-board";
import { DiffsPanel } from "@/components/dashboard/diffs-panel";
import { FolderBrowser } from "@/components/dashboard/folder-browser";
import { SettingsMenu, getDefaultPrompt, setDefaultPrompt } from "@/components/dashboard/settings-menu";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const agentIdFromUrl = searchParams.get("agent") || null;

  const navigateToAgent = useCallback(
    (agentId: string | null) => {
      if (agentId) {
        router.replace(`/dashboard?agent=${agentId}`, { scroll: false });
      } else {
        router.replace("/dashboard", { scroll: false });
      }
    },
    [router]
  );

  const {
    connected,
    initialLoadDone,
    historyLoading,
    agents,
    agentOrder,
    activeAgentId,
    activeStatus,
    activeMessages,
    activeRawMessages,
    activeModel,
    spawnAgent,
    sendMessage,
    respondToControl,
    respondToUserQuestion,
    killAgent,
    deleteAgent,
    renameAgent,
    clearHistory,
    pinAgent,
    iceboxAgent,
    moveAgent,
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
    notifications,
    clearNotifications,
    dismissNotification,
    markNotificationRead,
    testNotification,
  } = useWebSocket({ activeAgentId: agentIdFromUrl, onNavigateToAgent: navigateToAgent });

  const [taskView, setTaskView] = useState<"hidden" | TaskViewMode>("hidden");
  const [showWorld, setShowWorld] = useState(false);
  const [showDiffs, setShowDiffs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState("");

  // Initialize notifications on mount
  useEffect(() => {
    initNotifications();
    setNotificationsEnabledState(isNotificationsEnabled());
    setDefaultSystemPrompt(getDefaultPrompt());
  }, []);

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      // Enabling: request permission first if needed
      const granted = await requestPermission();
      if (!granted && typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied") {
        toast.error("Notifications blocked — enable in browser settings");
        return;
      }
    }
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    setNotificationsEnabledState(next);
  };

  // Derive initial path from first workspace or fallback to "/"
  const initialBrowsePath = workspaces.length > 0 ? workspaces[0].cwd : "/";

  // Connection status toasts (skip initial connection)
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (connected) {
      if (hasConnectedRef.current) {
        toast.success("Reconnected");
      }
      hasConnectedRef.current = true;
    } else if (hasConnectedRef.current) {
      toast.error("Connection lost");
    }
  }, [connected]);

  useEffect(() => {
    const agent = activeAgentId ? agents.get(activeAgentId) : undefined;
    const label = agent?.label;
    document.title = label ? `${label} — thos` : "thos — dashboard";
  }, [activeAgentId, agents]);

  return (
    <TooltipProvider delayDuration={300}>
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
            navigateToAgent(id);
            setSidebarOpen(false);
          }}
          onNewAgent={() => {
            navigateToAgent(null);
            setSidebarOpen(false);
          }}
          onKill={killAgent}
          onDelete={deleteAgent}
          onRename={renameAgent}
          onClearHistory={clearHistory}
          onPin={pinAgent}
          onIcebox={iceboxAgent}
          onMoveAgent={moveAgent}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={setActiveWorkspaceId}
          onRenameWorkspace={renameWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onOpenFolder={() => setFolderBrowserOpen(true)}
        />
      </div>

      {/* Main area: world view or chat (hidden in board mode) */}
      <div className={cn("flex min-w-0 flex-1 flex-col", taskView === "board" && "hidden")}>
        {showWorld ? (
          <AgentWorld
            agents={agents}
            agentOrder={agentOrder}
            activeAgentId={activeAgentId}
            onSelect={(id) => {
              navigateToAgent(id);
              setShowWorld(false);
            }}
            onBack={() => setShowWorld(false)}
          />
        ) : (
          <Chat
            connected={connected}
            loading={!initialLoadDone || historyLoading}
            status={activeStatus}
            agentLabel={activeAgentId ? agents.get(activeAgentId)?.label : null}
            messages={activeMessages}
            rawMessages={activeRawMessages}
            activeModel={activeModel}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onSendMessage={sendMessage}
            onSpawnAgent={(prompt, systemPrompt) => spawnAgent(prompt, selectedModel || undefined, systemPrompt)}
            onRespondToControl={respondToControl}
            onRespondToUserQuestion={respondToUserQuestion}
            onClearHistory={() => { if (activeAgentId) clearHistory(activeAgentId); }}
            showTasks={taskView !== "hidden"}
            onToggleTasks={() => setTaskView((v) => (v === "hidden" ? "list" : "hidden"))}
            showDiffs={showDiffs}
            onToggleDiffs={() => setShowDiffs((v) => !v)}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            showWorld={showWorld}
            onToggleWorld={() => setShowWorld((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
            defaultSystemPrompt={defaultSystemPrompt}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
            notifications={notifications}
            onSelectNotification={(agentId, notifId) => {
              navigateToAgent(agentId);
              markNotificationRead(notifId);
            }}
            onDismissNotification={dismissNotification}
            onClearNotifications={clearNotifications}
            onTestNotification={testNotification}
          />
        )}
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
              navigateToAgent(agentId);
            }}
            onClose={() => setTaskView("hidden")}
          />
        </div>
      )}

      {/* Diffs panel backdrop (mobile only) */}
      {showDiffs && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setShowDiffs(false)}
        />
      )}

      {/* Diffs panel drawer */}
      {showDiffs && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 max-w-[calc(100vw-3rem)] md:max-w-none border-l bg-background flex flex-col min-w-0 md:relative md:z-auto">
          <DiffsPanel
            messages={activeMessages}
            onSendMessage={sendMessage}
            onClose={() => setShowDiffs(false)}
          />
        </div>
      )}

      {/* Settings menu */}
      <SettingsMenu
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        onTestNotification={testNotification}
        defaultPrompt={defaultSystemPrompt}
        onDefaultPromptChange={(value) => {
          setDefaultSystemPrompt(value);
          setDefaultPrompt(value);
        }}
      />

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

      <Toaster />
    </div>
    </TooltipProvider>
  );
}
