import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { MessageId, RuntimeRequestId, ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { deriveFlow, nextFlowThread } from "../components/Flow.logic";
import { getComposerDraftState, useComposerDraftStore } from "../composerDraftStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readThreadShells } from "../state/entities";
import { environmentPresentations } from "../state/presentation";
import { environmentThreadDetails } from "../state/threads";
import {
  buildThreadRouteParams,
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { prepareFlowJump, flowDraftChanged, flowResponseReadiness } from "../flowAutoJump";
import { useFlowStore } from "../flowStore";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { returnToFlowOverview } from "../customizations/huy/flowSessionInspection";
import { useSessionImportanceStore } from "../customizations/huy/sessionImportance";

declare module "@tanstack/react-router" {
  interface HistoryState {
    flowAutoJump?: boolean;
    flowPromotionSource?: string;
  }
}

/** Track user edits and navigation once for the client, without subscribing the
 * layout to keystrokes. Draft promotion is the send's own route replacement. */
export function useFlowJumpCancellation() {
  const router = useRouter();
  useEffect(() => {
    const cancel = () => useFlowStore.getState().cancelPendingJump();
    let locationKey = router.state.location.state.__TSR_key ?? router.state.location.href;
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      const nextKey = toLocation.state.__TSR_key ?? toLocation.href;
      if (nextKey === locationKey) return;
      const promotingDraft = toLocation.state.flowPromotionSource === locationKey;
      locationKey = nextKey;
      if (!promotingDraft) cancel();
      if (!useFlowStore.getState().open || promotingDraft) return;
      if (toLocation.state.flowAutoJump) {
        useFlowStore.getState().inspectSession(null);
        return;
      }
      const match = router.matchRoutes(toLocation.pathname, toLocation.search).at(-1);
      if (!match || !String(match.routeId).includes("$environmentId/$threadId")) return;
      const destination = resolveThreadRouteRef(
        match.params as Partial<Record<"environmentId" | "threadId", string | undefined>>,
      );
      if (!destination) return;
      useFlowStore.getState().inspectSession(scopedThreadKey(destination));
    });
    const unsubscribeDraft = useComposerDraftStore.subscribe((next, previous) => {
      if (!useFlowStore.getState().open || next.draftsByThreadKey === previous.draftsByThreadKey)
        return;
      const route = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
      if (!route) return;
      const target = route.kind === "draft" ? route.draftId : route.threadRef;
      if (
        flowDraftChanged(
          getComposerDraftState(previous, target),
          getComposerDraftState(next, target),
        )
      )
        cancel();
    });
    document.addEventListener("beforeinput", cancel, true);
    document.addEventListener("input", cancel, true);
    document.addEventListener("paste", cancel, true);
    document.addEventListener("drop", cancel, true);
    return () => {
      unsubscribe();
      unsubscribeDraft();
      document.removeEventListener("beforeinput", cancel, true);
      document.removeEventListener("input", cancel, true);
      document.removeEventListener("paste", cancel, true);
      document.removeEventListener("drop", cancel, true);
      cancel();
    };
  }, [router]);
}

export function useFlowAutoJump() {
  const router = useRouter();
  return useCallback(
    (
      source: ScopedThreadRef,
      excludedThreadKeys?: ReadonlySet<string>,
      deliveryThread: ScopedThreadRef = source,
    ) => {
      if (!useFlowStore.getState().open) return null;
      const sourceThreadKey = scopedThreadKey(source);
      const detailAtom = environmentThreadDetails.threadAtom(deliveryThread);
      const readContext = () => {
        const { open, interactionRevision } = useFlowStore.getState();
        const params = router.state.matches.at(-1)?.params ?? {};
        const route = resolveThreadRouteTarget(params);
        const draft =
          route?.kind === "draft"
            ? useComposerDraftStore.getState().getDraftSession(route.draftId)
            : null;
        const ref =
          route?.kind === "server"
            ? route.threadRef
            : draft
              ? (draft.promotedTo ?? scopeThreadRef(draft.environmentId, draft.threadId))
              : null;
        return {
          enabled: open,
          revision: interactionRevision,
          locationKey:
            router.state.location.state.flowPromotionSource ??
            router.state.location.state.__TSR_key ??
            router.state.location.href,
          currentThreadKey: ref ? scopedThreadKey(ref) : null,
        };
      };
      const complete = prepareFlowJump({
        sourceThreadKey,
        readContext,
        nextTarget: () => {
          const presentations = appAtomRegistry.get(environmentPresentations.presentationsAtom);
          const connected = new Set(
            [...presentations].flatMap(([id, presentation]) =>
              presentation.connection.phase === "connected" ? [id] : [],
            ),
          );
          const next = nextFlowThread(
            deriveFlow(readThreadShells(), {
              now: new Date().toISOString(),
              importantThreadKeys: useSessionImportanceStore.getState().keys,
            }),
            sourceThreadKey,
            connected,
            excludedThreadKeys,
          );
          return next ? scopeThreadRef(next.environmentId, next.id) : null;
        },
        navigate: (target) => {
          // Concurrent replies may resolve together. Claim this navigation before
          // the router starts loading so another completion cannot also jump.
          useFlowStore.getState().cancelPendingJump();
          void router
            .navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(target),
              state: { flowAutoJump: true },
            })
            .catch((error: unknown) => {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Could not open the next Flow thread",
                  description:
                    error instanceof Error ? error.message : "Try opening it from the Flow bar.",
                }),
              );
            });
        },
        onEmpty: returnToFlowOverview,
        subscribe: (onChange) => {
          const unsubscribeDetail = appAtomRegistry.subscribe(detailAtom, onChange);
          const unsubscribeFlow = useFlowStore.subscribe(onChange);
          const unsubscribeEnvironment = appAtomRegistry.subscribe(
            environmentPresentations.presentationsAtom,
            onChange,
          );
          return () => {
            unsubscribeDetail();
            unsubscribeFlow();
            unsubscribeEnvironment();
          };
        },
      });
      if (!complete) return null;
      return (
        response?:
          | { requestId: RuntimeRequestId; kind: "approval" | "user-input" }
          | { kind: "turn"; messageId: MessageId },
      ) => {
        complete(
          response
            ? () => {
                const presentation = appAtomRegistry
                  .get(environmentPresentations.presentationsAtom)
                  .get(deliveryThread.environmentId);
                if (presentation?.connection.phase !== "connected") return "blocked";
                // Callers complete only after the orchestrator durably accepted the turn.
                if (response.kind === "turn") return "ready";
                return flowResponseReadiness(
                  appAtomRegistry.get(detailAtom)?.projection ?? null,
                  response.requestId,
                );
              }
            : undefined,
        );
      };
    },
    [router],
  );
}
