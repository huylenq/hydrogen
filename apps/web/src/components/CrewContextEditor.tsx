/* Evidence rows are controlled and positional; keep their keys stable while labels and text are edited. */
/* oxlint-disable react/no-array-index-key */
import type { CrewDraftContext, CrewContextSource } from "@t3tools/client-runtime/crew-draft";
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function CrewContextEditor({
  context,
  sources,
  disabled,
  onChange,
}: {
  context: CrewDraftContext;
  sources: ReadonlyArray<CrewContextSource>;
  disabled: boolean;
  onChange: (context: CrewDraftContext) => void;
}) {
  const evidence = context.evidence ?? [];
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-2.5">
      {(
        [
          ["goal", "Task goal", "What are we trying to achieve?"],
          ["currentState", "Current state", "What is implemented, failing, or undecided?"],
          ["expectedResult", "Expected result", "For example: the three most important findings"],
        ] as const
      ).map(([field, label, placeholder]) => (
        <label key={field} className="block space-y-1 text-xs text-muted-foreground">
          <span>{label}</span>
          <Textarea
            size="sm"
            className="**:data-[slot=textarea]:max-h-32 **:data-[slot=textarea]:text-xs"
            value={context[field] ?? ""}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={16000}
            onChange={(event) => onChange({ ...context, [field]: event.target.value })}
          />
        </label>
      ))}
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>Constraints (one per line)</span>
        <Textarea
          size="sm"
          className="**:data-[slot=textarea]:max-h-32 **:data-[slot=textarea]:text-xs"
          value={context.constraints?.join("\n") ?? ""}
          disabled={disabled}
          maxLength={16000}
          onChange={(event) =>
            onChange({ ...context, constraints: event.target.value.split("\n") })
          }
        />
      </label>
      {sources.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                size="xs"
                variant="ghost-muted"
                className="group w-full justify-start"
              />
            }
          >
            <PlusIcon /> Choose task excerpts
            <ChevronDownIcon className="ml-auto size-3 group-data-panel-open:rotate-180" />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <p className="py-2 text-[11px] text-muted-foreground">
              Recent loaded messages, plans, and change statistics. Nothing is included until you
              add it.
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {sources.map((source) => (
                <div key={source.id} className="space-y-1 rounded-md border border-border/60 p-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {source.label}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={
                        disabled ||
                        evidence.length >= 20 ||
                        evidence.some(
                          (item) => item.label === source.label && item.text === source.text,
                        )
                      }
                      onClick={() =>
                        onChange({
                          ...context,
                          evidence: [...evidence, { label: source.label, text: source.text }],
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs">
                    {source.text}
                  </p>
                </div>
              ))}
            </div>
          </CollapsiblePanel>
        </Collapsible>
      ) : null}
      {evidence.map((item, index) => (
        <div key={index} className="space-y-1.5 rounded-md border border-border/60 p-2">
          <div className="flex items-center gap-2">
            <Input
              size="sm"
              aria-label={`Evidence ${index + 1} label`}
              value={item.label}
              maxLength={256}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...context,
                  evidence: evidence.map((entry, position) =>
                    position === index ? { ...entry, label: event.target.value } : entry,
                  ),
                })
              }
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost-muted"
              aria-label={`Remove evidence ${index + 1}`}
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...context,
                  evidence: evidence.filter((_, position) => position !== index),
                })
              }
            >
              <XIcon />
            </Button>
          </div>
          <Textarea
            size="sm"
            aria-label={`Evidence ${index + 1} text`}
            className="**:data-[slot=textarea]:max-h-40 **:data-[slot=textarea]:text-xs"
            value={item.text}
            maxLength={16000}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...context,
                evidence: evidence.map((entry, position) =>
                  position === index ? { ...entry, text: event.target.value } : entry,
                ),
              })
            }
          />
        </div>
      ))}
      <Button
        type="button"
        size="xs"
        variant="ghost-muted"
        disabled={disabled || evidence.length >= 20}
        onClick={() =>
          onChange({
            ...context,
            evidence: [...evidence, { label: "Selected evidence", text: "" }],
          })
        }
      >
        <PlusIcon /> Paste code, a diff, or logs
      </Button>
    </div>
  );
}
