# Huy's functional customizations

This file records intentional behavior in Huy's T3 Code fork that must survive upstream merges and refactors. It states what each feature must keep doing, not how it is built: exact keys, sizes, file names, and copy live in the code, tests, and linked user docs. Carry these requirements into whatever implementation upstream changes force.

## Upstream runtime compatibility

The unmodified upstream mobile client must be able to use this server. Do not add fork-only values to, or change the meaning of, shared runtime contracts or persisted thread/session state (runtime modes, approval policies, sandbox mappings and their defaults). Lexicon and Hermes must not add thread runtime modes or alter upstream approval behavior. Keep local data repairs out of the shipped migration history.

## Vim navigation

Opt-in modal keyboard profile for web and desktop (not native mobile). Full command set: [Vim navigation](docs/user/modal-keyboard.md).

- Normal mode shows which surface has focus; no persistent mode/status strip.
- Escape leaves the composer for Normal mode (open pickers/overlays handle Escape first). Submitting from the keyboard returns to navigation without stealing focus the user already moved.
- Picking a model or effort from Normal mode stays in Normal mode and restores the prior focus.
- Text inputs, embedded editors, and terminals keep their own editing keys; terminals have an escape hatch back to navigation.
- Focus and mode survive pickers, thread switches, and leaving/returning to the app window. Returning to the window never focuses the composer by itself.
- Each command runs exactly once; help, settings copy, and behavior agree.
- `j`/`k` scroll the conversation smoothly, and holding them glides continuously. Any other scroll interrupts the glide. Reduced motion jumps instead, and `gg`/`G` stay instant.
- `J`/`K` jump the conversation to the next/previous user message, aligned at the top. `K` partway through a user message returns to its start first. Holding either key keeps stepping. The landed bubble's outline flashes briefly to orient the eye.

## Shortcuts

Flow has no default modified shortcut; Vim Normal mode toggles it. Grok Bot's Mac default uses Control rather than Command+Option and doesn't fire while a terminal is focused. Custom defaults must not take over upstream defaults; when upstream adds defaults, check for conflicts across platforms (`mod` is Control off Mac).

## Flow

Web and desktop focus mode for working through threads that need attention.

- An overview of waiting threads (oldest first) and a grid of running sessions. Subagent threads are excluded, as in the sidebar; their parent session carries their activity. Opening a session from the grid keeps Flow on and does not reveal the sidebar; Escape from an inspected session returns to the grid.
- The grid uses the available width with balanced, equal-width rows and supports spatial Vim navigation; grid edges are hard stops (`h` at the left edge does not enter the sidebar). Working-session positions stay stable as activity updates arrive; new sessions sort by creation time, newest first.
- Enabling Flow hides the sidebar; after that the sidebar can be toggled freely and disabling Flow leaves it as is.
- Successful user actions (send, answering approvals/input, settle, snooze, archive, implement plan) advance to the next waiting thread, or back to the grid when none remain.
- Never pull the user anywhere on background activity alone. Typing, navigating, or leaving Flow cancels a pending jump; automatic queued sends never navigate.
- Vim `g k` opens the commit dialog wherever git actions are mounted (upstream shows them in the thread-details panel).

## Custom snooze

Web, desktop, and mobile snooze menus offer an arbitrary positive custom duration alongside the upstream presets and scheduling. In Vim mode, `s` opens a quick duration input (unit suffixes accepted) and on an already snoozed thread wakes it instead. See [snooze guidance](docs/user/thread-sidebar.md#snooze-until-later).

## Grok Bot / Crew (quarantined)

Huy no longer uses Grok Bot but wants to keep it so he can come back to it. Crew is the implementation name.

- Requirement: it must not crash or break the app, server startup, or other features, and must stay out of the way when not configured.
- Its tests may be skipped or disabled when they create friction for other work. Don't spend merge effort keeping Grok Bot fully working; keep it compiling and inert.
- Don't delete it without asking Huy.
- What still works is the manual panel: connect, chat with bots, attach task context, and use a reply in the composer.
- Agent delegation over MCP and automatic reply delivery into coding threads were built on the pre-V2 orchestrator. They were removed when rebasing onto upstream's new orchestrator; the old implementation is in commit `5335523848` if it is ever revived.

## Hermes provider

Hermes is a selectable ACP provider with settings, icon, model discovery/switching, session resume, and recovery after cancellation. See [Hermes setup and limitations](docs/user/install.md#hermes).

- A configured instance is usable without a warning while credentials are unverified, including after restart. Missing credentials and failed turns still warn; routine refreshes don't clear a failed-turn warning. Status checks never send model requests.
- Model labels keep an inference-route suffix so identical model names from different routes stay distinguishable.
- Agent profile is chosen per conversation (always explicit, defaulting to `default`; no "automatic"), preserved through drafts, sends, and resume on all clients. Switching profiles starts a fresh session (seeded with upstream's thread-summary handoff); never load another profile's session.
- Reasoning effort is session-scoped, applied before the next prompt, survives resume, never writes profile config, and errors clearly on Hermes versions that can't honor it.
- Each instance's Hermes home isolates its config, credentials, memory, and skills. Report capabilities honestly.

## Lexicon prompt display

Web and desktop show a Lexicon prompt's user text as a normal message, with the injected context behind a collapsed disclosure. Unrecognized prompts render in full. Storage, provider input, and copy keep the full prompt. Mobile shows the full prompt unchanged.

## Diff repository identity

The diff panel shows the selected thread's own repository/worktree. If that workspace is unavailable, show the error; never fall back to the server's working directory and show another repo's diff. Review requests are accepted for registered projects outside the server's startup directory.

## Integrating upstream

Web customizations live in [`apps/web/src/customizations/huy`](apps/web/src/customizations/huy); keep fork policy there and hand upstream components narrow typed state/actions. Add new customizations there before adding effects or layout policy directly to large upstream components like `ChatView` or `AppSidebarLayout`. Schema, provider, and safety edits may need direct upstream changes; keep them small.

1. A clean Git merge doesn't prove custom behavior survived. Compare both sides and check mounts, command registration, focus attributes, CSS, and server wiring, not just that feature files still exist.
2. Run focused tests for the affected behavior. When live verification is authorized, exercise entry and exit paths (Escape, focus, Flow). Report unverified surfaces.
3. Update this file when Huy changes a customization. Rewrite or remove obsolete requirements instead of appending.
