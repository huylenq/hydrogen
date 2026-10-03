# Modal keyboard navigation

The web and desktop clients offer an opt-in Vim navigation profile. The client setting
`modalKeyboardEnabled` defaults to false. Mode, pending prefixes, focus requests, and
queue/sidebar bookmarks belong to one client window and never cross the WebSocket.

`packages/client-runtime/src/keyboard.ts` defines the navigation vocabulary, prefix
resolver, and bookmark/index rules without browser dependencies. The initial profile uses
fixed navigation sequences. Common actions have direct keys (`q`, `i`, `a`, `n`, `m`,
`r`); `w`, `t`, and `f` are pure prefixes with no standalone action. Space focuses the right pane, and `w Space` toggles its visibility.
There are no time-based action/prefix ambiguities. Existing configurable shortcuts remain available, including
`keyboard.toggleModal` and `keyboard.normal` for entering the profile and reclaiming focus.

`ModalKeyboard` installs one modal key listener in the app shell. It lets dialogs, editable
controls, composition, and embedded surfaces own their input. Unhandled Escape from a
text field returns to the conversation in the bubble phase, after the field has had a
chance to cancel its own interaction. Terminal reclaim runs inside Ghostty's `beforeKey`
callback so the surface suppresses the corresponding key release as well as the press.
The desktop preview retains its existing native forwarding; its command-palette shortcut
provides a way back to T3. Arbitrary custom shortcuts cannot cross a preview guest boundary.

Normal mode disables chat's type/paste-to-focus redirection and the right-panel launcher's
global letter shortcuts. The existing modified shortcuts remain handled by their current
owners. Launcher letter shortcuts are local to its focused controls in this profile. Sidebar and Work Queue thread traversal choose one owner explicitly in modal mode.

Bare `1`–`9` dispatch the existing thread-jump commands, using the same
sidebar or queue order as modified shortcuts. `s`, Escape, and Space request sidebar,
conversation, and right-panel focus. Escape cancels pending sequences or help first. ChatView
reveals the requested surface before completing focus after a DOM commit. Panel focus
uses `show`, so repeating the request cannot close it. Returning to conversation restores
a maximized panel; switching out of a narrow-window panel closes its sheet. Panel chrome
participates in navigation, while embedded content retains its own keys. Terminal mount
autofocus yields when the right-panel frame has navigation focus.

`n` uses the question component's local command handler to expand its current question
and request focus. It never selects an answer. `r` uses the existing add-diff action with
its Git/server-thread guards, then requests right-panel focus. Repeated review requests
keep the panel open. `w` actions toggle visibility independently of the focus commands.

Expanded pending-input questions own their keys while focused. In modal mode their
numbered-answer handler requires focus inside that question; elsewhere bare numbers
select threads. Unhandled Escape leaves the question. The standard profile keeps global
numbered answers. Both reject repeats, composition, consumed events, and modified keys.

App actions use `appCommands.ts` to call the same action executors as existing shortcuts.
The registry only lives in the client; components release their handlers when they unmount.
Commands retain the environment and thread references captured by their current view.

Queue and sidebar navigation moves DOM focus without changing the route. Activation opens
the selected item. Bookmarks use environment-scoped thread keys; after removal, restoration
uses the nearest remaining index. The virtual conversation timeline handles its own scroll
motions and cancels automatic following through the existing user-navigation path.

Direct-prefix hints appear after 250 ms and stay until completion or cancellation. The delay only
controls discovery, never whether a sequence is accepted. Focus changes, navigation,
pointer interaction, composition, window blur, and configuration changes cancel prefixes.
The help reference is independent of prefix state: navigation, focus requests, and prefix
cancellation leave it visible. It does not intercept command dispatch. Explicit dismissal
or disabling the profile closes it; native input ownership still takes priority.
Hints and help come from the same command list as dispatch. No animation or polling runs
while the keyboard is idle.

`modalKeyboardCommands.ts` derives command labels, targets, and unavailable reasons from
the active thread capabilities and layout. ChatView publishes that context into the local
modal store. Help and dispatch share the descriptions; failed guards display a brief
status message. Prefix matching highlights reference entries without blocking dispatch.

Panel focus uses the existing focus requests. Navigation history tracks
the last two non-question areas for `w w`. Right-panel tab buttons carry stable surface
IDs; horizontal motion focuses and activates the adjacent tab. Enter dispatches a local
panel-enter action. The selected terminal handles that action through its surface API;
other panels focus their first control. Reclaim returns to the currently selected tab,
never an older bookmark. Exact DOM return targets cover transient pickers and are scoped
to the current route, with stable item bookmarks as fallback after removal.

The initial scope is queue/sidebar navigation, conversation scrolling, composer entry,
and direct access to existing thread, file-search, model, terminal, and review actions.
Vim text editing, configurable modal sequences, line/hunk review motions, and the native
mobile hardware-keyboard adapter are not implemented. Native mobile keeps its existing
input behavior and can later reuse the pure navigation rules.
