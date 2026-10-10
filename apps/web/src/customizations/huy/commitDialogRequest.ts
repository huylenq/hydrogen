import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";

import type { ThreadPanelPresentation } from "~/rightPanelLayout";
import { selectThreadPanelOpen, useRightPanelStore } from "~/rightPanelStore";

// Git actions mount only inside the open thread details card, so `g k` opens the card and leaves
// this request for its git actions to answer once they know the repository's status.
let pending: { readonly threadKey: string; claim: symbol | null } | null = null;

/**
 * Vim `g k` with the thread details card closed opens the card and asks its git actions for the
 * commit dialog. Returns false while the card is open, so its git actions answer the command.
 */
export function requestCommitDialog(
  ref: ScopedThreadRef,
  presentation: ThreadPanelPresentation,
): boolean {
  const store = useRightPanelStore.getState();
  if (selectThreadPanelOpen(store.threadPanelVisibilityByThreadKey, ref, presentation)) {
    return false;
  }
  pending = { threadKey: scopedThreadKey(ref), claim: null };
  store.setThreadPanelOpen(ref, presentation, true);
  return true;
}

/**
 * Lets the card's git actions answer a pending `g k` once `ready` (status loaded or failed). The
 * request lives only while git actions for its thread stay mounted to answer it.
 */
export function useCommitDialogRequest(
  ref: ScopedThreadRef | null,
  ready: boolean,
  openCommitDialog: () => void,
) {
  const open = useEffectEvent(openCommitDialog);
  const threadKey = ref ? scopedThreadKey(ref) : null;
  useEffect(() => {
    const request = pending;
    if (!request || request.threadKey !== threadKey) return;
    if (ready) {
      pending = null;
      open();
      return;
    }
    const claim = Symbol("commit dialog request");
    request.claim = claim;
    // Closing the card or leaving the thread ends the request. Deferred so StrictMode's effect
    // replay, or the card moving between popover and inline, claims it again first.
    return () => {
      setTimeout(() => {
        if (pending === request && request.claim === claim) pending = null;
      }, 0);
    };
  }, [ready, threadKey]);
}
