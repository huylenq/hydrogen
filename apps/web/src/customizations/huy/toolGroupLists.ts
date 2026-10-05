import type { LegendListRef } from "@legendapp/list/react";

// An expanded tool group's calls live in a virtualized list of their own. Reading reaches a call
// that list has not rendered yet through the list itself, found by its scroll element.
const lists = new WeakMap<Element, LegendListRef>();

export function registerToolGroupList(element: Element, list: LegendListRef): () => void {
  lists.set(element, list);
  return () => {
    if (lists.get(element) === list) lists.delete(element);
  };
}

export function toolGroupList(element: Element): LegendListRef | null {
  return lists.get(element) ?? null;
}
