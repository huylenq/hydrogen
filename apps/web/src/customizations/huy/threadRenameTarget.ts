import { flowSessionActionTarget } from "../../modalKeyboardDom";

/** Rename follows the focused sidebar row or Flow session, otherwise the open thread. */
export function threadRenameTarget(openThread: { key: string; title: string } | null) {
  const focused = document.activeElement;
  if (focused?.closest('[data-modal-surface="sidebar"]')) {
    const row = focused.closest<HTMLElement>("[data-thread-item]");
    const key = row?.dataset.threadItem;
    return key ? { key, title: row.dataset.threadTitle ?? "Thread" } : null;
  }
  return flowSessionActionTarget(openThread);
}
