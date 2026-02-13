"use client";

/**
 * Dashboard route (`/dashboard`).
 *
 * Orchestrates the multi-agent WebSocket hook, sidebar, and chat panel.
 * Clicking "+" or selecting "New Agent" sets `activeAgentId` to `null`,
 * which shows the spawn input. On spawn, the server responds with
 * `spawned` and the hook auto-selects the new agent.
 */

import { useWebSocket } from "@/hooks/use-websocket";
import { AgentSidebar } from "@/components/dashboard/agent-sidebar";
import { Chat } from "@/components/dashboard/chat";

export default function DashboardPage() {
  const {
    connected,
    agents,
    agentOrder,
    activeAgentId,
    setActiveAgentId,
    activeStatus,
    activeMessages,
    spawnAgent,
    sendMessage,
    respondToControl,
  } = useWebSocket();

  return (
    <div className="flex h-dvh">
      <AgentSidebar
        agents={agents}
        agentOrder={agentOrder}
        activeAgentId={activeAgentId}
        onSelect={setActiveAgentId}
        onNewAgent={() => setActiveAgentId(null)}
      />
      <div className="flex flex-1 flex-col">
        <Chat
          connected={connected}
          status={activeStatus}
          messages={activeMessages}
          onSendMessage={sendMessage}
          onSpawnAgent={spawnAgent}
          onRespondToControl={respondToControl}
        />
      </div>
    </div>
  );
}
