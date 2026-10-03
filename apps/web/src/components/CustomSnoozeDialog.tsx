import { SnoozeFormFields, useSnoozeForm } from "../customizations/huy/SnoozeForm";
import { useEffect } from "react";
import { create } from "zustand";

import { Button } from "./ui/button";

import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";

type SnoozeChoice = { readonly snoozedUntil: string };
type Request = {
  readonly quickDuration: boolean;
  readonly resolve: (choice: SnoozeChoice | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

export function requestCustomSnooze(quickDuration = false): Promise<SnoozeChoice | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { resolve, quickDuration } }));
}

function finish(choice: SnoozeChoice | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(choice);
}

export function CustomSnoozeDialogHost() {
  const request = useRequest((state) => state.request);
  useEffect(() => () => finish(null), []);
  return request ? <CustomSnoozeDialog quickDuration={request.quickDuration} /> : null;
}

function CustomSnoozeDialog({ quickDuration }: { readonly quickDuration: boolean }) {
  const form = useSnoozeForm(quickDuration);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup
        className="sm:max-w-sm"
        initialFocus={quickDuration ? form.durationRef : undefined}
      >
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const snoozedUntil = form.resolve();
            if (snoozedUntil === null) return;
            finish({ snoozedUntil });
          }}
        >
          <DialogHeader>
            <DialogTitle>{form.title}</DialogTitle>
            <DialogDescription>{form.description}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <SnoozeFormFields form={form} />
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit">Snooze</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
