import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import type { ComposerThreadDraftState } from "./composerDraftStore";
import type {
  OrchestrationV2ThreadProjection,
  RuntimeRequestId,
  ScopedThreadRef,
} from "@t3tools/contracts";

export type FlowJumpReadiness = "ready" | "waiting" | "blocked";

/** Ignore send clearing and upload bookkeeping, but catch content inserted by
 * stash restoration, citations, attachment pickers, and type-to-focus. */
export function flowDraftChanged(
  before: ComposerThreadDraftState | null,
  after: ComposerThreadDraftState | null,
): boolean {
  if (before === after || after === null) return false;
  if (after.prompt.length > 0 && after.prompt !== before?.prompt) return true;
  const attachmentKeys = ["images", "files", "persistedAttachments"] as const;
  if (
    attachmentKeys.some((key) =>
      after[key].some((item) => !before?.[key].some((previous) => previous.id === item.id)),
    )
  )
    return true;
  return (["terminalContexts", "previewAnnotations", "reviewComments"] as const).some((key) =>
    after[key].some((item, index) => item !== before?.[key][index]),
  );
}

/** Once a response is accepted, jump only after the projection shows it resolved,
 * and only if nothing else on the thread still needs the user. */
export function flowResponseReadiness(
  projection: Pick<OrchestrationV2ThreadProjection, "runtimeRequests" | "turnItems"> | null,
  requestId: RuntimeRequestId,
): FlowJumpReadiness {
  const request = projection?.runtimeRequests.find((candidate) => candidate.id === requestId);
  if (!projection || !request || request.status === "pending") return "waiting";
  const pending = derivePendingThreadRequests(projection);
  return pending.approvals.length === 0 && pending.userInputs.length === 0 ? "ready" : "blocked";
}

export interface FlowJumpContext {
  readonly enabled: boolean;
  readonly revision: number;
  readonly locationKey: string;
  readonly currentThreadKey: string | null;
}

/** Capture the user's place before an async action. Choose the destination once
 * the action is ready; an empty flow at that point never arms a later jump. */
export function prepareFlowJump(options: {
  sourceThreadKey: string;
  readContext: () => FlowJumpContext;
  nextTarget: () => ScopedThreadRef | null;
  navigate: (target: ScopedThreadRef) => void;
  onEmpty: () => void;
  subscribe: (onChange: () => void) => () => void;
}) {
  const initial = options.readContext();
  if (!initial.enabled || initial.currentThreadKey !== options.sourceThreadKey) return null;
  let consumed = false;
  const isCurrent = () => {
    const current = options.readContext();
    return (
      current.enabled &&
      current.revision === initial.revision &&
      current.locationKey === initial.locationKey &&
      current.currentThreadKey === initial.currentThreadKey
    );
  };

  return (readiness: () => FlowJumpReadiness = () => "ready") => {
    if (consumed) return;
    consumed = true;
    if (!isCurrent()) return;

    let unsubscribe: (() => void) | undefined;
    let finished = false;
    const check = () => {
      if (finished) return;
      const state = isCurrent() ? readiness() : "blocked";
      if (state === "waiting") return;
      finished = true;
      unsubscribe?.();
      if (state === "ready") {
        const target = options.nextTarget();
        if (target) options.navigate(target);
        else options.onEmpty();
      }
    };
    check();
    if (!finished) {
      unsubscribe = options.subscribe(check);
      // A subscription may deliver synchronously, or state may have changed
      // between the initial read and subscribing.
      if (finished) unsubscribe();
      else check();
    }
  };
}
