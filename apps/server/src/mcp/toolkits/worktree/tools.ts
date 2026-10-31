import {
  WorktreeMcpFailure,
  OrchestratorMcpEnvironmentTarget,
  OrchestratorMcpFailure,
  VcsListRefsInput,
  VcsListRefsResult,
  WorktreeMcpAttachInput,
  WorktreeMcpAttachResult,
  WorktreeMcpHandoffInput,
  WorktreeMcpHandoffResult,
  WorktreeMcpStatusResult,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as WorktreeMcpService from "../../WorktreeMcpService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  WorktreeMcpService.WorktreeMcpService,
];

const WorktreeToolFailure = Schema.Union([WorktreeMcpFailure, OrchestratorMcpFailure]);

const WorktreeHandoffTool = Tool.make("t3_worktree_handoff", {
  description:
    "Move THIS thread into a new git worktree on a new branch. Runs the setup script by default. A separate agent in a worktree: `t3_thread_launch` with `workspaceStrategy`. Call last in your turn. The move ends the live session. `continuationPrompt` resumes work there next turn. Without it, the thread waits. The worktree stays after the thread is deleted. Fails if this thread has a worktree.",
  parameters: WorktreeMcpHandoffInput,
  success: WorktreeMcpHandoffResult,
  failure: WorktreeToolFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Hand off thread to a git worktree")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

// Huy's fork (HYDROGEN-SPECS.md, "Thread worktree attach"). If upstream main ever
// ships an equivalent tool, favor upstream's implementation when merging and
// remove this one.
const WorktreeAttachTool = Tool.make("t3_worktree_attach", {
  description:
    "Needs an agent running inside a T3 thread. Re-point this agent thread at an existing checkout of its project: a linked worktree, or the project's main workspace root. Use it when the thread is bound to the wrong checkout, or after creating a worktree with shell git, so T3 Code shows diffs and runs the next turn in the right place. Runs no git command in the checkout and never changes its branch; the checkout must already have a branch checked out. Use t3_worktree_list to find checkout paths. Changing the workspace detaches the live provider session, so the current turn ends shortly after the call; call this as the last action of the turn and pass continuationPrompt to resume automatically in the new checkout.",
  parameters: WorktreeMcpAttachInput,
  success: WorktreeMcpAttachResult,
  failure: WorktreeToolFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Attach thread to an existing checkout")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const WorktreeStatusTool = Tool.make("t3_worktree_status", {
  description:
    "Report this thread's worktree: attached or not, path, branch, project root, and the `startFromOrigin` default. Check before `t3_worktree_handoff`.",
  // No `parameters`: Tool.make defaults to Tool.EmptyParams, which serializes
  // to a top-level `type: "object"` JSON Schema. An explicit empty
  // Schema.Struct({}) serializes to `anyOf: [object, array]`, which is not a
  // valid MCP tool input schema and makes clients reject the whole server.
  success: WorktreeMcpStatusResult,
  failure: WorktreeToolFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Get thread worktree status")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const WorktreeListTool = Tool.make("t3_worktree_list", {
  description:
    "List branch refs and checkout paths for a thread's workspace. Omit `threadId` for this thread. Detached worktrees with no branch are left out.",
  parameters: Schema.Struct({
    environmentId: OrchestratorMcpEnvironmentTarget,
    threadId: Schema.optional(ThreadId),
    query: VcsListRefsInput.fields.query,
    cursor: VcsListRefsInput.fields.cursor,
    limit: VcsListRefsInput.fields.limit,
    refKind: VcsListRefsInput.fields.refKind,
    includeMatchingRemoteRefs: VcsListRefsInput.fields.includeMatchingRemoteRefs,
  }),
  success: VcsListRefsResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ProjectService.ProjectService,
    GitWorkflowService.GitWorkflowService,
  ],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
export const WorktreeToolkit = Toolkit.make(
  WorktreeHandoffTool,
  WorktreeAttachTool,
  WorktreeStatusTool,
  WorktreeListTool,
);
