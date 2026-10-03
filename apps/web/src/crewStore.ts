import { randomUUID } from "./lib/utils";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  crewDraftKey,
  editCrewDraft,
  recoverRejectedCrewDraft,
  setCrewDraftOrigin,
  updateCrewDraftOptions,
  type CrewDraft,
  type CrewDraftOrigin,
  type CrewDraftScope,
} from "@t3tools/client-runtime/crew-draft";

interface CrewState {
  readonly open: boolean;
  readonly chatOpen: boolean;
  readonly askOrigin: CrewDraftOrigin | null;
  readonly selectedBotByAccount: Record<string, string>;
  readonly drafts: Record<string, CrewDraft>;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
  readonly askFrom: (origin: CrewDraftOrigin) => void;
  readonly selectBot: (environmentId: EnvironmentId, accountScope: string, botId: string) => void;
  readonly collapseChat: () => void;
  readonly editDraft: (scope: CrewDraftScope, text: string) => void;
  readonly linkDraft: (scope: CrewDraftScope, origin: CrewDraftOrigin) => void;
  readonly updateDraftOptions: (
    scope: CrewDraftScope,
    options: Parameters<typeof updateCrewDraftOptions>[1],
  ) => void;
  readonly unlinkDraft: (scope: CrewDraftScope) => void;
  readonly markAttempted: (scope: CrewDraftScope) => void;
  readonly recoverRejectedDraft: (scope: CrewDraftScope, nonce: string, error: unknown) => void;
  readonly clearDraft: (scope: CrewDraftScope) => void;
}

export function crewBotSelectionKey(environmentId: EnvironmentId, accountScope: string): string {
  return JSON.stringify([environmentId, accountScope]);
}

export const useCrewStore = create<CrewState>()(
  persist(
    (set) => ({
      open: false,
      chatOpen: false,
      askOrigin: null,
      selectedBotByAccount: {},
      drafts: {},
      setOpen: (open) => set((state) => (state.open === open ? {} : { open, chatOpen: false })),
      toggle: () => set((state) => ({ open: !state.open, chatOpen: false })),
      askFrom: (origin) => set({ open: true, chatOpen: false, askOrigin: origin }),
      selectBot: (environmentId, accountScope, botId) =>
        set((state) => ({
          open: true,
          chatOpen: true,
          selectedBotByAccount: {
            ...state.selectedBotByAccount,
            [crewBotSelectionKey(environmentId, accountScope)]: botId,
          },
        })),
      collapseChat: () => set({ chatOpen: false }),
      editDraft: (scope, text) =>
        set((state) => {
          const key = crewDraftKey(scope);
          return {
            drafts: {
              ...state.drafts,
              [key]: editCrewDraft(
                state.drafts[key],
                text,
                state.askOrigin?.environmentId === scope.environmentId ? state.askOrigin : null,
                randomUUID,
              ),
            },
          };
        }),
      linkDraft: (scope, origin) =>
        set((state) => {
          const key = crewDraftKey(scope);
          const draft = state.drafts[key];
          if (draft?.attempted || scope.environmentId !== origin.environmentId) return {};
          return {
            drafts: {
              ...state.drafts,
              [key]: setCrewDraftOrigin(draft, origin, randomUUID),
            },
          };
        }),
      updateDraftOptions: (scope, options) =>
        set((state) => {
          const key = crewDraftKey(scope);
          return {
            drafts: {
              ...state.drafts,
              [key]: updateCrewDraftOptions(
                state.drafts[key],
                options,
                state.askOrigin?.environmentId === scope.environmentId ? state.askOrigin : null,
                randomUUID,
              ),
            },
          };
        }),
      unlinkDraft: (scope) =>
        set((state) => {
          const key = crewDraftKey(scope);
          const draft = state.drafts[key];
          if (draft?.attempted) return {};
          return {
            askOrigin:
              state.askOrigin?.environmentId === scope.environmentId ? null : state.askOrigin,
            drafts: {
              ...state.drafts,
              [key]: setCrewDraftOrigin(draft, null, randomUUID),
            },
          };
        }),
      markAttempted: (scope) =>
        set((state) => {
          const key = crewDraftKey(scope);
          const draft = state.drafts[key];
          return draft ? { drafts: { ...state.drafts, [key]: { ...draft, attempted: true } } } : {};
        }),
      recoverRejectedDraft: (scope, nonce, error) =>
        set((state) => {
          const key = crewDraftKey(scope);
          const draft = state.drafts[key];
          const recovered = recoverRejectedCrewDraft(draft, nonce, error);
          return recovered && recovered !== draft
            ? { drafts: { ...state.drafts, [key]: recovered } }
            : {};
        }),
      clearDraft: (scope) =>
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[crewDraftKey(scope)];
          return { drafts, askOrigin: null };
        }),
    }),
    {
      name: "t3code:crew-drafts:v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        drafts: state.drafts,
        selectedBotByAccount: state.selectedBotByAccount,
      }),
    },
  ),
);
