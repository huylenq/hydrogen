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
- `hjkl` mean something within each area; bare `h`/`l` never move focus between areas. `w h`/`w l` step between the sidebar, the main area, and the right panel (opening it when hidden), stopping at the outer edges. Right-panel tabs stop at both ends.
- `Space` does what `j` does and `Shift+Space` what `k` does, so tapping Space reads on. Space does not focus the right panel; `w l` does.
- Conversation reading motions move the reading cursor: `j`/`k` by block (each top-level paragraph, heading, table, code block, and list item of an answer, then the header and each visible folder and file row of the answer's changed-files card; every other timeline row is one block), `[[`/`]]` by section (message starts, headings, blocks opening in bold, and changed-files card headers; like Vim's section motions), `J`/`K` by user message. Moving back from partway through a unit returns to its start first, and holding any of these keeps stepping.
- The cursor lives in a band clear of the outer fifth at each end of the readable area, like Vim's `scrolloff`, and the page stays still while it moves within the band (half a line of slack), so most steps do not scroll. A step that would leave the band on the side it is heading scrolls before the cursor reaches the edge: continuing down lands the target's top on the band's top line, continuing up lands its bottom on the band's bottom line. A step that reverses direction only brings its target into the band, keeping the block just left in view. Section and message jumps land on the band's top line. Scrolling by hand during a landing stops it where the user leaves the view and starts a fresh read. `j` pages half a screen through a block that runs past the bottom edge. Block steps and pages glide calmly, around half a second, so the eye can follow; section and message jumps stay quick. Reduced motion makes both instant. The readable area is measured against the composer as it is drawn, so a collapsed composer does not cause early scrolls.
- The reading cursor shows as a bar in the gutter left of the text (at the text column's edge for answer blocks, list items included; beside the row otherwise) plus a faint tint over its block. On a user message it highlights the bubble's border instead (no bar, no tint). As a landing starts the tint brightens briefly, or a user message's border flashes twice, so the eye can follow the block to its new spot. Every `[[`/`]]` stop, scrolled to or not, shows why it is a section: its heading or bold lead highlights briefly like a cited quote (a user message flashes its border; a plain message start pulses). The first `j`/`k` shows the cursor on the first block starting on screen without moving it. Scrolling the cursor fully off screen hides it.
- `Ctrl+j`/`Ctrl+k` scroll the conversation smoothly, and holding them glides continuously. Any other scroll interrupts the glide. Reduced motion jumps instead, and `gg`/`G` stay instant. Any keybinding on these chords wins, whatever its `when` clause; off macOS that includes the default `mod+j`/`mod+k`.
- `zt`/`zz`/`zb` scroll like Vim's: the cursor's block top lands just inside the top of the readable area (a twentieth of it clear, outside the band), its middle at the middle, or its bottom just inside the bottom. They glide quickly with the landing cue, keep the cursor, and without one place the block where reading starts on screen.
- `z i` toggles the reading lamp (like Vim's `zi` view toggle), which shows the cursor by dimming the rest of the conversation instead of tinting it. The lamp always lights a block, following the screen when the cursor scrolls away. It is static (no animation), persists per client, and applies only while Vim navigation is on.
- In a changed-files card `h`/`l` work like a file tree: `l` opens a file's diff (or the header's full diff), expands a collapsed folder, or steps into an expanded one; `h` collapses an expanded folder or steps out to the enclosing folder, then the header. Steps scroll only as far as needed. A turn fold ("Worked for …") and a tool group ("Ran 3 commands") work the same way: `l` expands one or, once open, steps into the first row it reveals; `h` collapses it. An expanded tool group's calls are stops of their own (`j`/`k` walk them, tracked by list index through the group's virtualized, recycling list, which scrolls to keep the cursor's call clear of its edge fades and renders a neighbor call it has not drawn yet instead of letting `j`/`k` skip past it; scrolling the group by hand until the call is out of its view drops the cursor); `l`/`h` open and close a call's output, and `h` on a closed call steps out to its group header (the calls row names its header; it is not assumed to be the row above). A lone tool call opens and closes its output in place. `h` from any row an open turn fold reveals (including that row's changed-files header) steps back out to the fold. Fold membership is computed when timeline rows are built (`turnFoldRunId`), not guessed from the DOM. Changed files and folders are known to the cursor by path, so opening or closing a folder above it keeps it on the same file. Elsewhere `h`/`l` in the conversation show a hint instead. `Enter` clicks what the cursor is on in a card (file, folder toggle, header's full diff) or toggles a turn fold, tool group, or tool call; anywhere else in a conversation `Enter` still focuses the composer. A stuck (sticky) card header is measured at its unstuck spot, so landings don't chase it.
- `c` cites the cursor's block through the regular citation flow (same capture as a mouse selection, comment editor beside the block, Escape removes the citation). Only answer text is citable.

## Shortcuts

Flow has no default modified shortcut; Vim Normal mode toggles it. `ctrl+alt+h`/`ctrl+alt+l` (`rightPanel.widen`/`rightPanel.narrow`, not in a terminal) move the divider between the chat and the inline right panel by 80px per press, held keys repeating, on the chat and Pull Requests pages; each page's key handler passes them straight to the panel's shell (`runAppCommandFromKey`), which answers only while its width is user-set (open, inline, not maximized), and the key is consumed only then. Grok Bot's Mac default uses Control rather than Command+Option and doesn't fire while a terminal is focused. Custom defaults must not take over upstream defaults; when upstream adds defaults, check for conflicts across platforms (`mod` is Control off Mac).

## Flow

Web and desktop focus mode for working through threads that need attention.

- A Flow bar of waiting threads (oldest first) and the Flow overview, a grid of running-session previews shown when nothing waits. Subagent threads are excluded, as in the sidebar; their parent session carries their activity. Opening a session from the overview keeps Flow on and does not reveal the sidebar; Escape from an inspected session returns to the overview.
- `flow.overview.toggle` (Vim `w g`, no default modified shortcut) holds the overview open even while threads wait, enabling Flow if needed. Waiting threads lead the grid with their status, and Flow doesn't enter them on its own. Opening any session releases the hold (no "Back to previews", Escape doesn't return to the grid); with threads waiting, only `w g` brings the overview back. Escape returns an opened session to the overview only when nothing waits, so it never jumps into the queue. Disabling Flow releases the hold too.
- The overview uses the available width with balanced, equal-width rows and supports spatial Vim navigation; grid edges are hard stops (`h` at the left edge does not enter the sidebar). Working-session positions stay stable as activity updates arrive; new sessions sort by creation time, newest first.
- Overview tiles (`FlowSessionPreview`) show the title, then one line with project, provider icon, model, and effort. The body shows the latest messages as markdown, with user messages in the main chat's right-aligned bubble and no role labels, followed by recent tool activity at message size using the main chat's settled labels (a shell call shows its command).
- Enabling Flow hides the sidebar; after that the sidebar can be toggled freely and disabling Flow leaves it as is.
- In Vim Normal mode `gt`/`gT` open the next/previous waiting session, like Vim's tab motions (`[`/`]` belong to `[[`/`]]` section motions).
- Successful user actions (send, answering approvals/input, settle, snooze, archive, implement plan) advance to the next waiting thread, or back to the overview when none remain.
- Never pull the user anywhere on background activity alone. Typing, navigating, or leaving Flow cancels a pending jump; automatic queued sends never navigate.
- Vim `g k` opens the commit dialog wherever git actions are mounted (upstream shows them in the thread-details panel).

## Custom snooze

Web, desktop, and mobile snooze menus offer an arbitrary positive custom duration alongside the upstream presets and scheduling. In Vim mode, `s` opens a quick duration input (unit suffixes accepted) and on an already snoozed thread wakes it instead. See [snooze guidance](docs/user/thread-sidebar.md#snooze-until-later).

## Grok Bot / Crew (quarantined)

Huy no longer uses Grok Bot but wants to keep it so he can come back to it. Crew is the implementation name.

- Requirement: it must not crash or break the app, server startup, or other features, and must stay out of the way when not configured.
- Its tests may be skipped or disabled when they create friction for other work. Don't spend merge effort keeping Grok Bot fully working; keep it compiling and inert.
- Don't delete it without asking Huy.
- Its top-right toolbar toggle is hidden; the `crew.toggle` keybinding and command palette still open it.
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
