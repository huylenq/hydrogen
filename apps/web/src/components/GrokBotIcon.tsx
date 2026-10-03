import grokBotIconUrl from "../../../../assets/integrations/grokbot.png";
import { cn } from "../lib/utils";

export function GrokBotIcon({ className }: { className?: string }) {
  return (
    <img
      src={grokBotIconUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
