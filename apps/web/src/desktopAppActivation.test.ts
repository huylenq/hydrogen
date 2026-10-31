import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  handleDesktopAppActivationRequest,
  type DesktopAppActivationDependencies,
} from "./desktopAppActivation";

const environmentId = EnvironmentId.make("primary");
const existingProjectId = ProjectId.make("project-existing");
const createdProjectId = ProjectId.make("project-created");
const threadId = ThreadId.make("thread-1");
const request = {
  version: 1,
  requestId: "request-1",
  type: "open-workspace",
  workspaceRoot: "/workspace/project",
  platform: "linux",
} as const;

function dependencies(
  overrides: Partial<DesktopAppActivationDependencies> = {},
): DesktopAppActivationDependencies {
  return {
    openExistingThread: vi.fn(async () => existingProjectId),
    getTarget: () => ({ environmentId, platform: "linux" }),
    findProject: () => ({
      id: existingProjectId,
      environmentId,
      workspaceRoot: request.workspaceRoot,
    }),
    createProject: vi.fn(async () => createdProjectId),
    waitForProject: vi.fn(async () => undefined),
    openThread: vi.fn(async () => ({ threadId })),
    ...overrides,
  };
}

describe("desktop app activation", () => {
  it("waits for a created project before it opens the thread", async () => {
    const order: string[] = [];
    const deps = dependencies({
      findProject: () => null,
      createProject: vi.fn(async () => {
        order.push("create");
        return createdProjectId;
      }),
      waitForProject: vi.fn(async () => {
        order.push("project-event");
      }),
      openThread: vi.fn(async () => {
        order.push("open-thread");
        return { threadId };
      }),
    });

    const response = await handleDesktopAppActivationRequest(request, deps);

    expect(order).toEqual(["create", "project-event", "open-thread"]);
    expect(response).toMatchObject({ ok: true, projectId: createdProjectId });
  });

  it("rejects a Windows path when the primary environment is WSL", async () => {
    const response = await handleDesktopAppActivationRequest(
      { ...request, platform: "win32" },
      dependencies({ getTarget: () => ({ environmentId, platform: "linux" }) }),
    );

    expect(response).toMatchObject({ ok: false, code: "platform-mismatch" });
  });
});

it("opens the exact existing thread without creating a project or draft", async () => {
  const deps = dependencies();
  const target = {
    version: 1,
    requestId: "existing",
    type: "open-thread",
    environmentId,
    threadId,
  } as const;
  expect(await handleDesktopAppActivationRequest(target, deps)).toMatchObject({
    ok: true,
    threadId,
    projectId: existingProjectId,
  });
  expect(deps.openExistingThread).toHaveBeenCalledWith(environmentId, threadId);
  expect(deps.createProject).not.toHaveBeenCalled();
  expect(deps.openThread).not.toHaveBeenCalled();
});
it("does not fall back to a new draft when the requested thread is missing", async () => {
  const deps = dependencies({ openExistingThread: vi.fn(async () => null) });
  expect(
    await handleDesktopAppActivationRequest(
      { version: 1, requestId: "missing", type: "open-thread", environmentId, threadId },
      deps,
    ),
  ).toMatchObject({ ok: false, code: "thread-open-failed" });
  expect(deps.createProject).not.toHaveBeenCalled();
  expect(deps.openThread).not.toHaveBeenCalled();
});
