import { Link } from "@tanstack/react-router";

import { APP_BASE_NAME } from "../../branding";
import { cn } from "../../lib/utils";
import { HydrogenMark } from "./HydrogenMark";

/**
 * Hydrogen fork (HYDROGEN-SPECS.md, "Rebrand"): the sidebar brand in place of
 * upstream's T3 wordmark. Without the environment pill it is centered on the
 * sidebar; beside the pill it keeps upstream's left alignment.
 */
export function HydrogenSidebarBrand({
  onBackdrop,
  centered,
}: {
  onBackdrop: boolean;
  centered: boolean;
}) {
  const link = (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        // The mark's padding sits in the gap after the titlebar controls, so the mark
        // itself starts at the titlebar inset like upstream's wordmark.
        centered ? "col-start-2" : "ml-[calc(var(--workspace-titlebar-content-left)-0.625rem)]",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <HydrogenSidebarBrandMark />
    </Link>
  );
  if (!centered) return link;
  return (
    // Equal outer columns center the link on the sidebar. The left column never
    // shrinks below the titlebar inset, so a narrow sidebar shifts the mark right
    // instead of under the window controls; the negative margin spans the header's
    // right padding. Nothing here adds to the measured brand width.
    <div className="-mr-3 hidden min-w-0 flex-1 grid-cols-[minmax(var(--workspace-titlebar-content-left),1fr)_auto_minmax(0,1fr)] items-center md:grid">
      {link}
    </div>
  );
}

export function HydrogenSidebarBrandMark() {
  return (
    // Sized to the capitals of base text, a step above the sidebar's text. The
    // padding widens the link's hit and focus area beyond the mark.
    <span className="inline-flex min-w-0 px-2.5 text-base">
      <HydrogenMark aria-label={APP_BASE_NAME} className="h-[1cap] w-auto shrink-0" />
    </span>
  );
}
