import { useEffect, useRef, useState } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { registerAppCommands } from "../../appCommands";
import { readEnvironmentScope } from "../../state/session";
import { showModalFeedback } from "../../modalKeyboardStore";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "../../components/ui/dialog";
import { threadRenameTarget } from "./threadRenameTarget";

type RenameThread = Pick<EnvironmentThreadShell, "environmentId" | "id" | "title">;

/** Capture the target before the dialog takes focus or the thread list changes. */
export function ThreadRenameCommand({
  threads,
  routeThreadKey,
  rename,
}: {
  threads: ReadonlyMap<string, RenameThread>;
  routeThreadKey: string | null;
  rename: (ref: ScopedThreadRef, title: string) => void;
}) {
  const [request, setRequest] = useState<{ thread: RenameThread; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      registerAppCommands((command) => {
        if (command !== "thread.rename") return false;
        const routed = routeThreadKey ? threads.get(routeThreadKey) : null;
        const target = threadRenameTarget(
          routed && routeThreadKey ? { key: routeThreadKey, title: routed.title } : null,
        );
        const thread = target ? threads.get(target.key) : null;
        if (!thread) {
          showModalFeedback("Focus a thread or open an existing thread first");
        } else if (!readEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope)) {
          showModalFeedback("Renaming is unavailable in this environment");
        } else {
          setRequest({ thread, title: thread.title });
        }
        return true;
      }),
    [threads, routeThreadKey],
  );
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) setRequest(null);
      }}
    >
      {request && (
        <DialogPopup className="sm:max-w-sm" initialFocus={inputRef}>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              const title = request.title.trim();
              if (!title) return;
              setRequest(null);
              if (
                title === request.thread.title ||
                !readEnvironmentScope(request.thread.environmentId, AuthOrchestrationOperateScope)
              )
                return;
              rename(scopeThreadRef(request.thread.environmentId, request.thread.id), title);
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename thread</DialogTitle>
            </DialogHeader>
            <DialogPanel>
              <Input
                ref={inputRef}
                aria-label="Thread title"
                value={request.title}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setRequest({ ...request, title: event.target.value })}
              />
            </DialogPanel>
            <DialogFooter variant="bare">
              <Button type="button" variant="outline" onClick={() => setRequest(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!request.title.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      )}
    </Dialog>
  );
}
