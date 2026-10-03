# Huy's functional customizations

This file records intentional behavior in Huy's T3 Code fork that must survive upstream merges and refactors. Update it when Huy changes that behavior. Implementation details and file locations may change; carry these requirements into the new implementation. The sections below cover the customizations identified in the current merge audit and should grow as other intentional differences are identified.

## Upstream runtime compatibility

The unmodified upstream T3 Code mobile client must be able to use this server. UI/UX customizations must preserve upstream runtime modes, approval policies, sandbox mappings, and their defaults. Do not introduce fork-only values or change the meaning of existing values in shared runtime contracts or persisted thread/session state. `read-only` is an upstream provider sandbox value, not a separate thread runtime mode.

Keep Hermes and Grok Bot integrations as currently implemented. Lexicon integration must not add thread runtime modes or alter upstream approval behavior.

Compare shared contracts and existing provider behavior against upstream when integrating changes. Keep local data repairs separate from the shipped migration history; verify affected persisted values decode under upstream contracts.

## Vim navigation

Applies to web and desktop. The profile is opt-in in Settings → Keybindings; native mobile does not offer it.

- Normal mode has a visible, steady frame identifying the focused navigation surface. Do not show a persistent mode/status strip; retain `?` help, command-prefix hints, and transient command feedback. Keep the mode controller, focus targets, styles, and command registrations connected across chat, drafts, and other applicable views.
- Escape from the main composer returns to Normal mode and focuses the conversation. An open picker or overlay handles Escape first. `i` returns to composing; an accepted keyboard submission returns to conversation navigation without stealing focus if the user has already moved elsewhere.
- Confirming a model (`m`) or reasoning effort (`e`) with Enter closes that picker and restores the control you left. From Normal mode, that stays in Normal mode and does not move focus into the composer.
- Ordinary text editing and embedded editors retain their editing behavior. Terminals retain plain Escape; `Ctrl+Shift+Space` returns control to T3 navigation.
- `H` and `L` toggle the sidebar and right panel. Lowercase `h` and `l` navigate within the current hierarchy or between panes. `q` opens and focuses Flow. `F` toggles Flow, as does `w q`. `/` opens the thread switcher.
- Navigation must preserve focus across pickers and thread changes. Commands execute once, including when capture-phase handlers and fallback handlers coexist.
- Switching away from and back to the app preserves the focused navigation surface and Vim mode. Returning to the window must not focus the composer or enter Insert mode by itself.
- Preserve the other modal commands and their visible hints documented in [Vim navigation](docs/user/modal-keyboard.md) and [keybindings](docs/user/keybindings.md). Behavior, help, settings copy, and tests must agree.

## Shortcut choices

Huy's Mac shortcuts use Control rather than Command+Option:

| Action                          | Default                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| Grok Bot / Crew (`crew.toggle`) | `Ctrl+Shift+G`                                             |
| Flow (`flow.toggle`)            | `Ctrl+Shift+F`; Vim Normal `F` and `w q`                   |
| Thread switcher                 | `/` in Vim Normal mode; no extra default modified shortcut |

Crew and Flow shortcuts do not run while the terminal has focus. Preserve upstream Mac `Cmd+Shift+G`, `Cmd+Shift+L`, and `Cmd+Shift+K` for branch, previous worktree, and copying the pull request number. Check shortcut contexts when upstream adds defaults; defaults, user overrides, and command registrations can conflict independently. Check other platforms separately because `mod` means Control there.

## Flow

Applies to web and desktop.

- Preserve the Flow overview and bar, with waiting threads ordered oldest first and running threads on the bench. Opening or previewing a session keeps Flow enabled. In the working-session grid, Vim Normal `h`/`l` move across a rendered row and `j`/`k` move between rows; `h` at the left edge enters the sidebar, while other grid edges keep focus in the grid. Escape from Flow session inspection returns to the grid without disabling Flow. Enabling Flow hides the left sidebar if it is showing. After that, the sidebar can still be shown or hidden while Flow is open; disabling Flow leaves sidebar visibility as it is.
- Lowercase hierarchy navigation and session jumps give focus to the destination content. Browsing outside the queue is allowed; later updates must not pull the user back unexpectedly.
- Hide the Flow Queue bar in the working-session grid. Keep it visible when inspecting a session or handling a waiting thread. Preserve vertically centered cards and extend the grid's Vim focus outline to the top without an empty header strip. Retain a desktop window-drag area without reserving layout space above the grid.
- Use the available content width for working-session previews on web and desktop, without a fixed grid width cap. Keep equal cards 360–512 CSS pixels wide and 384 pixels tall, with 16-pixel gaps. Treat 512 pixels as a maximum, allowing cards to shrink to fit more columns before wrapping. Use the fewest rows that fit at the 360-pixel minimum, distributing sessions evenly so row counts differ by at most one. Keep card widths equal across all rows. Rebalance as windows or adjacent panes change width and center every row. Narrow windows keep cards within the available width. See `apps/web/src/customizations/huy/BalancedWorkingSessions.tsx` and `workingSessionGrid.test.ts`, plus `FlowOverview.tsx` and `FlowSessionPreview.tsx`; spatial keyboard navigation coverage lives in `modalKeyboardDom.test.ts`.
- Successful user actions advance to the next eligible waiting thread: sending, completing approvals or input requests, settling, snoozing, archiving, and starting plan implementation. When no eligible destination exists, leave an inspected session and return to the working-session grid. Automatic queued sends must not navigate the user.
- New activity alone never switches threads. Typing, navigating, or leaving Flow cancels a pending automatic jump. Draft promotion must not replace a newer navigation choice.
- Keep the git toolbar hidden in Flow while retaining command registration, including the Normal-mode `g k` commit command.

See [Flow behavior](docs/user/keybindings.md). Focused coverage lives in the Flow logic/store, `toggleFlowMode`, and `useFlowAutoJump` tests under `apps/web/src`.

## Custom snooze

Web, desktop, and mobile snooze menus offer **Custom duration…**, opening directly to an editable duration in minutes. Accept arbitrary positive durations rather than limiting input to presets or a fixed numeric range. Retain presets, hours/days, date-and-time scheduling, cancellation, and waking early. Vim `s` opens a compact duration form directly with an empty, focused input: type a positive number with an optional `s`, `m`, `h`, or `d` suffix (seconds, minutes, hours, days; minutes when absent) and press Enter to snooze, or Escape to cancel. No preset menu or unit selection intervenes. For an already snoozed thread, `s` wakes it. Menu and multi-selection actions retain the full custom dialog. Durations start at confirmation. See [snooze guidance](docs/user/thread-sidebar.md#snooze-until-later) and `packages/client-runtime/src/state/customSnooze.test.ts`.

## Grok Bot / Crew

Crew is the implementation name; the user-facing integration is Grok Bot.

- Web and desktop retain the bot rail, adjacent chat, toggle, command-palette entry, and shortcut. Rail and chat layout must coexist with the sidebar, right panel, and narrow windows. Closing the rail or switching bots preserves drafts and task links.
- Mobile retains the composer and environment-details entry points where the environment advertises Crew support.
- The connection belongs to the environment. Remote clients use that environment's Grok Bot connection.
- Manual messages and agent delegation retain explicit task links, reviewed context attachments, reply references, durable receipts, and reply delivery. Preserve queued delivery and the safeguards for stopped, snoozed, archived, or approval-blocked tasks.
- Grok Bot agent access and browser agent access remain independently configurable. Disabling agent access leaves manual panels available.

Preserve both client entry points and server services/contracts. The detailed behavior is in [Grok Bot](docs/user/composer.md#grok-bot).

## Hermes provider

Preserve Hermes as a selectable ACP provider, including provider settings, its icon, model discovery/switching, session resume, and recovery after cancellation. A configured instance is available without an attention warning while backend credentials are unverified, including after a server restart. Missing credentials and failed turns still show actionable warnings; routine status and model refreshes must not clear a failed-turn warning. Status checks must not send model requests; successful backend usage establishes verification.

The composer offers an Agent profile selector beside every Hermes model, including cached model entries, populated from the selected environment's Hermes profiles, with a required explicit choice defaulting to `default`. There is no Automatic option; omitted or legacy implicit selections resolve to `default`, and every ACP launch passes an explicit profile. Hermes model labels retain a concise inference-route suffix so identical model names from providers such as OpenRouter and xAI OAuth remain distinguishable in the composer. Selection belongs to the conversation, not the provider settings. Preserve it through drafts, sends, and resume on web, desktop, and mobile. Changing profiles starts a fresh Hermes session on the next send; never load another profile's session. Refreshing provider status or models refreshes the available profiles. Focused coverage lives in `HermesProfiles.test.ts` and `HermesAdapter.test.ts`.

The composer also offers session-scoped reasoning effort. Apply changes before the next prompt and preserve them through session resume without writing profile configuration. Require ACP reasoning support for explicit effort overrides; older Hermes versions must report an actionable error rather than silently ignore the selection.

The configured Hermes home isolates that instance's configuration, credentials, memory, and skills. Preserve honest capability reporting and the documented restrictions rather than enabling unsupported controls. See [Hermes setup and limitations](docs/user/install.md#hermes).

## Lexicon prompt display

Web and desktop show the user text from a Lexicon prompt as an ordinary message, without wrapper headings or a surrounding code block. A small **Lexicon context** disclosure below the message starts collapsed and reveals the complete injected context and Runtime attachments. Its expansion is independent of the long-message control. Support both historical JSON prompts and the readable fenced format. Unrecognized or incomplete prompts stay visible in full. Storage, provider input, and full-message copying retain the complete prompt. Native mobile continues to show the complete prompt without this presentation customization.

Focused coverage lives in `lexiconPrompt.test.ts` and `MessagesTimeline.test.tsx`.

## Diff repository identity

The diff panel must show the selected thread's repository/worktree. If that workspace is rejected or unavailable, show the failure instead of silently retrying against the server's working directory and displaying another repository's diff.

## Integrating upstream

The web integration lives in [`apps/web/src/customizations/huy`](apps/web/src/customizations/huy). Keep fork policy there and pass narrow, typed actions or state from upstream components. `HuyWorkspace` owns Crew placement and custom styles; the chat hooks own focus requests, modal context, timeline navigation, and command registration. `useHuyActionLifecycle` captures user intent before an action and accepts success receipts afterward; `useFlowAutoJump` owns destination selection and cancellation. Background sends do not claim navigation. Avoid inferring user intent from background server updates.

Chat shortcuts and modal commands share the chat action handler. Keep registration stable across renders so another mounted command owner does not lose priority. Git state and command registration live in `useGitActionsController`. Toolbar/menu views and `GitActionsDialogs` consume that controller; `HuyChatHeader` selects Flow chrome and mounts its controller/dialog host without a hidden toolbar. Crew spacing and Vim focus styles live in the Huy workspace stylesheet, using explicit state attributes on upstream headers and panels. Custom snooze input state and fields live in the Huy customization modules on web and each mobile platform; upstream dialogs and native sheets own their presentation. Named `data-modal-surface` attributes remain deliberate focus integration points and must survive markup changes.

When adding a customization, extend these boundaries before adding effects, listeners, or layout policy directly to `ChatView` or `AppSidebarLayout`. Schemas, provider capabilities, and repository-identity safeguards may still need direct upstream edits. Keep those edits explicit and small.

1. Read these requirements and compare both sides of the merge. A clean Git merge does not establish that custom behavior survived.
2. Adapt custom behavior to upstream replacements, such as a new composer editor or moved routing component. Check mounts, command registration, focus attributes, CSS, capability flags, and server wiring as well as surviving feature files.
3. Run focused tests for affected behavior. When live verification is authorized, exercise entry and exit paths in the client, including Escape, focus indication, Flow previews, and Crew layout. Report any unverified surfaces explicitly.
4. Update this file when Huy authorizes a functional change. Keep detailed user instructions in the linked guides and remove obsolete requirements rather than preserving contradictory versions.
