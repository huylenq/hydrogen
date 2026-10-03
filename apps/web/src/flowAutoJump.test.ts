import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  NodeId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2RuntimeRequest,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  prepareFlowJump,
  flowResponseReadiness,
  type FlowJumpContext,
  type FlowJumpReadiness,
} from "./flowAutoJump";

const target = scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("next"));

function harness() {
  let context: FlowJumpContext = {
    enabled: true,
    revision: 0,
    locationKey: "page-1",
    currentThreadKey: "source",
  };
  let destination: typeof target | null = target;
  const listeners = new Set<() => void>();
  const navigate = vi.fn();
  const onEmpty = vi.fn();
  return {
    navigate,
    onEmpty,
    listeners,
    update(change: Partial<FlowJumpContext>) {
      context = { ...context, ...change };
      for (const listener of listeners) listener();
    },
    destination(value: typeof destination) {
      destination = value;
    },
    emit() {
      for (const listener of listeners) listener();
    },
    prepare() {
      return prepareFlowJump({
        sourceThreadKey: "source",
        readContext: () => context,
        nextTarget: () => destination,
        navigate,
        onEmpty,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      });
    },
  };
}

describe("flow auto-jump", () => {
  it("does nothing until a successful action completes, then jumps once", () => {
    const h = harness();
    const finish = h.prepare();
    h.emit();
    expect(h.navigate).not.toHaveBeenCalled();
    finish?.();
    finish?.();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith(target);
    expect(h.listeners.size).toBe(0);
  });

  it.each([{ enabled: false }, { currentThreadKey: "elsewhere" }])(
    "does not arm outside active flow work: %j",
    (change) => {
      const h = harness();
      h.update(change);
      expect(h.prepare()).toBeNull();
      h.update({ enabled: true, currentThreadKey: "source" });
      h.emit();
      expect(h.navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { enabled: false },
    { revision: 1 },
    { locationKey: "other-page" },
    { currentThreadKey: "elsewhere" },
  ])("cancels an in-flight action after user activity: %j", (change) => {
    const h = harness();
    const finish = h.prepare();
    h.update(change);
    finish?.();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("does not re-arm when Flow mode is toggled off and back on", () => {
    const h = harness();
    const finish = h.prepare();
    h.update({ enabled: false, revision: 1 });
    h.update({ enabled: true, revision: 2 });
    finish?.();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("uses the current target at completion", () => {
    const h = harness();
    const finish = h.prepare();
    const next = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("older"));
    h.destination(next);
    finish?.();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith(next);
  });

  it("an empty flow never arms navigation for later arrivals", () => {
    const h = harness();
    const finish = h.prepare();
    h.destination(null);
    finish?.();
    h.destination(target);
    h.emit();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.onEmpty).toHaveBeenCalledOnce();
    expect(h.listeners.size).toBe(0);
  });

  it("waits for the provider response, then releases its subscription", () => {
    const h = harness();
    let readiness: FlowJumpReadiness = "waiting";
    h.prepare()?.(() => readiness);
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(1);
    readiness = "ready";
    h.emit();
    h.emit();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith(target);
    expect(h.listeners.size).toBe(0);
  });

  it("jumps to a thread that becomes ready while the message is being delivered", () => {
    const h = harness();
    let readiness: FlowJumpReadiness = "waiting";
    h.destination(null);
    h.prepare()?.(() => readiness);
    h.destination(target);
    h.emit();
    expect(h.navigate).not.toHaveBeenCalled();
    readiness = "ready";
    h.emit();
    expect(h.navigate).toHaveBeenCalledExactlyOnceWith(target);
    expect(h.listeners.size).toBe(0);
  });

  it("stops waiting when delivery succeeds with an empty flow", () => {
    const h = harness();
    let readiness: FlowJumpReadiness = "waiting";
    h.destination(null);
    h.prepare()?.(() => readiness);
    readiness = "ready";
    h.emit();
    h.destination(target);
    h.emit();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.onEmpty).toHaveBeenCalledOnce();
    expect(h.listeners.size).toBe(0);
  });

  it("cancels and unsubscribes if the user types while awaiting a provider", () => {
    const h = harness();
    let readiness: FlowJumpReadiness = "waiting";
    h.prepare()?.(() => readiness);
    h.update({ revision: 1 });
    readiness = "ready";
    h.emit();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });

  it("does not navigate after provider failure or a disappearing destination", () => {
    for (const blocked of [true, false]) {
      const h = harness();
      let readiness: FlowJumpReadiness = "waiting";
      h.prepare()?.(() => readiness);
      readiness = blocked ? "blocked" : "ready";
      if (!blocked) h.destination(null);
      h.emit();
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.onEmpty).toHaveBeenCalledTimes(blocked ? 0 : 1);
      expect(h.listeners.size).toBe(0);
    }
  });
});

const requestId = RuntimeRequestId.make("request-1");
function request(
  status: OrchestrationV2RuntimeRequest["status"],
  id = requestId,
): OrchestrationV2RuntimeRequest {
  return {
    id,
    nodeId: NodeId.make("node-1"),
    providerTurnId: null,
    nativeRequestRef: null,
    kind: "command",
    status,
    responseCapability: { type: "message" },
    createdAt: DateTime.makeUnsafe("2026-09-09T00:00:00.000Z"),
    resolvedAt: null,
  };
}
const projection = (...runtimeRequests: OrchestrationV2RuntimeRequest[]) => ({
  runtimeRequests,
  turnItems: [],
});

describe("flow response completion", () => {
  it("waits until the projection shows the request resolved, not command acknowledgement", () => {
    expect(flowResponseReadiness(null, requestId)).toBe("waiting");
    expect(flowResponseReadiness(projection(), requestId)).toBe("waiting");
    expect(flowResponseReadiness(projection(request("pending")), requestId)).toBe("waiting");
    expect(flowResponseReadiness(projection(request("resolved")), requestId)).toBe("ready");
  });

  it("stays when another request still needs an answer", () => {
    expect(
      flowResponseReadiness(
        projection(request("resolved"), request("pending", RuntimeRequestId.make("request-2"))),
        requestId,
      ),
    ).toBe("blocked");
  });
});
