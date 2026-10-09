import { create } from 'zustand';

interface PendingMessage {
  sessionId: string;
  content: string;
}

interface ChatState {
  selectedAgentBySession: Record<string, string>;
  drafts: Record<string, string>;
  pending: PendingMessage | null;
  publishOpen: boolean;
  selectAgent: (sessionId: string, agentId: string) => void;
  setDraft: (sessionId: string, text: string) => void;
  setPending: (p: PendingMessage | null) => void;
  setPublishOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  selectedAgentBySession: {},
  drafts: {},
  pending: null,
  publishOpen: false,
  selectAgent: (sessionId, agentId) =>
    set((s) => ({ selectedAgentBySession: { ...s.selectedAgentBySession, [sessionId]: agentId } })),
  setDraft: (sessionId, text) => set((s) => ({ drafts: { ...s.drafts, [sessionId]: text } })),
  setPending: (pending) => set({ pending }),
  setPublishOpen: (publishOpen) => set({ publishOpen }),
}));
