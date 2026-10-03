import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { LexiconPrompt } from "./lexiconPrompt";

export function LexiconContext({ prompt }: { prompt: LexiconPrompt }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1.5" data-lexicon-context>
      <Button
        type="button"
        size="xs"
        variant="ghost-muted"
        aria-expanded={expanded}
        data-scroll-anchor-ignore
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRightIcon className={expanded ? "rotate-90" : undefined} />
        Lexicon context
      </Button>
      {expanded ? (
        <div className="mt-2 text-xs text-muted-foreground">
          <pre className="whitespace-pre-wrap break-words font-mono select-text">
            {prompt.context}
          </pre>
          {prompt.attachments !== undefined ? (
            <div className="mt-3">
              <p className="mb-1">Runtime attachments</p>
              <pre className="whitespace-pre-wrap break-words font-mono select-text">
                {prompt.attachments}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
