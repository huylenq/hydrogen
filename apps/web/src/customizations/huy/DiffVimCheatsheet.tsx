import { KeyboardIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Kbd } from "~/components/ui/kbd";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import {
  DIFF_VIM_BINDINGS,
  DIFF_VIM_CHEATSHEET,
  diffVimKeyLabels,
  type DiffVimCommand,
} from "./diffVim";

const labelOf = (command: DiffVimCommand) =>
  DIFF_VIM_BINDINGS.find((binding) => binding.command === command)?.label ?? command;

/** The diff's Vim keys by task, opened from the diff toolbar or with `?`. */
export function DiffVimCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Diff keys" />
              }
            />
          }
        >
          <KeyboardIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">Diff keys (?)</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        side="bottom"
        align="end"
        padding="compact"
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        <PopoverTitle>Diff keys</PopoverTitle>
        <p className="mt-2 mb-3 text-xs text-muted-foreground">
          Normal mode, with focus anywhere in the diff panel. App keys the diff doesn't use, such as{" "}
          <Kbd>w h</Kbd>, <Kbd>H</Kbd>/<Kbd>L</Kbd>, and <Kbd>q</Kbd>, still work.
        </p>
        <div className="columns-2 gap-6 text-xs">
          {DIFF_VIM_CHEATSHEET.map((section) => (
            <section key={section.title} className="mb-3 break-inside-avoid">
              <h3 className="mb-1 font-medium text-muted-foreground">{section.title}</h3>
              <dl>
                {section.commands.map((command) => (
                  <div key={command} className="flex items-baseline justify-between gap-3 py-0.5">
                    <dt>{labelOf(command)}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {diffVimKeyLabels(command).map((keys) => (
                        <Kbd key={keys}>{keys}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
