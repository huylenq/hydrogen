import type { SVGProps } from "react";

/** Hydrogen's brand mark: a heavy "H₂" drawn to match upstream's T3 wordmark weight. */
export function HydrogenMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 77 56" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0H13V22.7H31V0H44V56H31V33.3H13V56H0Z" fill="currentColor" />
      <path
        d="M55.9 34.8A8.55 7.95 0 0 1 73 34.8C73 39.75 68.8 42.65 55.75 52.95H76.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="6.1"
      />
    </svg>
  );
}
