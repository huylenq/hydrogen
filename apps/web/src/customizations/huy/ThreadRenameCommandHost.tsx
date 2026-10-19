import { useParams } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useThreadShells } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { resolveThreadRouteRef } from "../../threadRoutes";
import { toastManager } from "../../components/ui/toast";
import { ThreadRenameCommand } from "./ThreadRenameCommand";

/** Mount outside either sidebar so rename also works with the legacy sidebar or Flow. */
export function ThreadRenameCommandHost() {
  const threads = useThreadShells();
  const routeRef = resolveThreadRouteRef(useParams({ strict: false }));
  const byKey = (() =>
    new Map(
      threads.map((thread) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        thread,
      ]),
    ))();
  const updateMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  return (
    <ThreadRenameCommand
      threads={byKey}
      routeThreadKey={routeRef ? scopedThreadKey(routeRef) : null}
      rename={(ref, title) => {
        void updateMetadata({
          environmentId: ref.environmentId,
          input: { threadId: ref.threadId, title },
        }).then((result) => {
          if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add({
              type: "error",
              title: "Failed to rename thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            });
          }
        });
      }}
    />
  );
}
