import { useState } from "react";

import { Input } from "~/components/ui/input";

/** Vim's `/` prompt over the bottom of a diff: Enter searches, Escape or leaving cancels. */
export function DiffVimSearchBar({
  onClose,
}: {
  onClose: (query: string | null, refocus: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-md border bg-popover px-2 py-1 shadow-sm">
      <span aria-hidden className="font-mono text-xs text-muted-foreground">
        /
      </span>
      <Input
        size="compact"
        autoFocus
        aria-label="Search diff"
        placeholder="Search lines and file paths"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => onClose(null, false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onClose(query.length > 0 ? query : null, true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose(null, true);
          }
        }}
      />
    </div>
  );
}
