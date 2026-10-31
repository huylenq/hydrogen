import { useId, useRef, useState, type KeyboardEvent } from "react";

import { useClientSettings } from "~/hooks/useSettings";

interface CommitFileListKeysInput {
  readonly files: ReadonlyArray<{ readonly path: string }>;
  readonly onToggle: (path: string) => void;
  readonly onOpen: (path: string) => void;
  readonly onCommit: () => void;
}

interface DialogChangeDetails {
  readonly reason: string;
  readonly event: Event;
  readonly cancel: () => void;
}

/** The cursor follows file paths across status refreshes, while selection means inclusion in the commit. Vim mode restores list focus before dismissing the dialog. */
export function useCommitFileListKeys(input: CommitFileListKeysInput) {
  const vim = useClientSettings((settings) => settings.modalKeyboardEnabled);
  const listRef = useRef<HTMLDivElement>(null);
  const optionIdPrefix = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  // Tracked by path so the cursor stays on its file when a status refresh reorders the list.
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const cursor = Math.max(
    input.files.findIndex((file) => file.path === cursorPath),
    0,
  );

  const move = (delta: number) => {
    const index = Math.min(Math.max(cursor + delta, 0), input.files.length - 1);
    const file = input.files[index];
    if (!file) return;
    setCursorPath(file.path);
    const row = listRef.current?.querySelectorAll("[data-commit-file]")[index];
    row?.scrollIntoView({ block: "nearest" });
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    // Rows and checkboxes keep their own Enter and Space.
    const onList = event.target === event.currentTarget;
    const path = input.files[cursor]?.path;
    switch (event.key) {
      case "j":
      case "ArrowDown":
        move(1);
        break;
      case "k":
      case "ArrowUp":
        move(-1);
        break;
      case "i":
        messageRef.current?.focus();
        break;
      case " ":
        if (!onList || !path) return;
        // Pin the cursor to the file acted on, so a refresh that reorders the list keeps it there.
        setCursorPath(path);
        if (!event.repeat) input.onToggle(path);
        break;
      case "Enter":
        if (!onList || !path) return;
        setCursorPath(path);
        if (!event.repeat) input.onOpen(path);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onPopupKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.key !== "Enter" ||
      !(event.metaKey || event.ctrlKey) ||
      event.shiftKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!event.repeat) input.onCommit();
  };

  /** Returns whether the dialog stays open because Escape left the message for the list. */
  const keepOpen = (details: DialogChangeDetails) => {
    if (
      !vim ||
      details.reason !== "escape-key" ||
      details.event.target !== messageRef.current ||
      !listRef.current
    )
      return false;
    details.cancel();
    listRef.current.focus();
    return true;
  };

  const optionId = (index: number) => `${optionIdPrefix}-${index}`;

  return {
    cursor,
    optionId,
    activeOptionId: input.files.length > 0 ? optionId(cursor) : undefined,
    listRef,
    messageRef,
    initialFocus: vim ? () => listRef.current ?? messageRef.current ?? true : true,
    onListKeyDown,
    onPopupKeyDown,
    keepOpen,
  };
}
