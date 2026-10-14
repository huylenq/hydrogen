# Keybindings

Customize shortcuts in **Settings → Keybindings** on web and desktop. That page
also lists the command IDs and defaults available in your version.

## Vim navigation

See [Using Vim navigation](./modal-keyboard.md) for a walkthrough,
examples, and troubleshooting.

Turn on **Vim navigation** in **Settings** → **Keybindings**. This preference
applies to the current web or desktop client. You can also toggle it with `mod+alt+v`.

In **Normal** mode, direct keys run common actions and `w`, `t`, and `f` open command
groups. `?` shows the shortcut reference. Reading a conversation with the keyboard is covered in
[Using modal keyboard navigation](./modal-keyboard.md).

| Keys                         | Action                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| `q` / `F` / `i` / `A`        | Focus Flow bar / toggle Flow mode / composer / pending question         |
| `n` or `a` / `m` / `e` / `r` | New-thread chooser / model / reasoning effort / open and focus changes  |
| `/` / `,`                    | Switch thread / keyboard settings                                       |
| `j` / `k` (or `Space`)       | Next/previous Flow card or sidebar item; next/previous reading block    |
| `gg` / `G`                   | First/last item; top/bottom of conversation                             |
| `Enter`                      | Open or toggle the reading cursor's item, else write; open focused item |
| `w w`                        | Alternate between the previous two navigation areas                     |
| `w s` / `w q` / `w Space`    | Toggle sidebar / Flow mode / right panel visibility                     |
| `w g`                        | Toggle the Flow overview, even while threads wait on you                |
| `w t` / `w m`                | Toggle terminal / maximize or restore open right panel                  |
| `t p` / `t s`                | Pin/unpin / settle/unsettle the open thread                             |
| `f f` / `f s`                | Find file / search project contents                                     |
| `g k`                        | Commit changes                                                          |
| `H` / `L`                    | Focus the area to the left/right, like `w h` / `w l`                    |
| `h` / `l`                    | Within Flow cards or panel tabs; collapse/expand in a conversation      |
| `w h` / `w l`                | Focus the area to the left/right                                        |
| `Esc`                        | Focus conversation, or return from Flow inspection                      |

`?` opens the complete shortcut reference. Help shows current toggle states, thread-action targets, and reasons for unavailable
commands. Panel labels identify the active area. In the right-panel tab strip, h/l or Left/Right arrow keys
select tabs and Enter enters their controls; `ctrl+shift+space` returns to the selected tab.
Pickers restore the control you left when dismissed. Enter on a model or reasoning effort from Normal mode stays in Normal mode.

Press `s`, type a duration such as `30s`, `15m`, `24h`, or `2d`, and press Enter to snooze the open thread.
A bare number means minutes. The duration field receives focus immediately; Escape cancels. If the thread is already
snoozed, `s` wakes it instead.
Snooze requires support from the connected environment.

`q` opens Flow and focuses its bar when visible; the Flow overview keeps the bar hidden.
`F` or `w q` toggles Flow mode; `w g` toggles the Flow overview. Prefixes have no typing
deadline. Escape dismisses help or cancels a sequence first, then focuses the main
content on the next press. When no threads wait on you, that next press returns an opened
session to the Flow overview. Escape closes an open picker first; otherwise it returns from text fields to navigation.

Press `A` to expand and focus a question without answering it. Its numbered answers work
only while the expanded question has focus. Escape returns to conversation navigation.
The `?` reference keeps shortcuts active and stays visible until you close it with `?` or
Escape in Normal mode. Thread actions apply to the open thread; moving focus over another row does not change
the target.

Text fields and embedded editors keep their editing behavior. Terminals keep plain Escape;
use `ctrl+shift+space` to return to T3's Normal mode. Existing modified shortcuts, Tab
navigation, and mouse controls remain available. Native mobile does not offer this profile.

The toggle and return shortcuts can be customized by editing **Keyboard: Toggle Modal**
and **Keyboard: Normal** below. The navigation keys and sequences are fixed in this version.

## Composer controls

In **Settings → General → Send shortcut**, choose whether Enter sends, requires
`mod+Enter` for multiline prompts, or always requires `mod+Enter`. `Shift+Enter`
inserts a new line. This applies to the web and desktop composer at desktop widths.

**Follow-up behavior** chooses Queue or Steer while the agent runs. Use
`mod+Enter` to do the opposite for one message, even when the send shortcut
requires a modifier. `mod+Alt+Enter` sends, keeps that thread running in the
background, and opens a fresh new-thread composer. In a new thread, `mod+Enter`
does the same. Change these shortcuts in **Settings → Keybindings** under
**Composer: Opposite Queue or Steer Action**, **Composer: Start in Background**,
or **Composer: Send and Start New Thread**. These bindings take priority over the
send shortcut. Click the send button to use the configured follow-up behavior.

When an active turn has queued messages, `mod+Shift+Enter` sends the first as a
steer. Change it under **Queue: Send First Queued Message as Steer** in Keybindings.

Use `mod+shift+m` to choose a model and `mod+shift+h` to choose a host.
To step a new thread to the next machine instead of opening the menu, bind
**Composer: Cycle Host** in Keybindings. It has no default shortcut.
Use `mod+shift+e` for effort, `mod+shift+a` for access mode, `mod+shift+x` for the
workspace, and `mod+shift+g` for the Git branch. The workspace menu includes the
current checkout, a new worktree, and the previous worktree when available.
Use `mod+shift+l` to reuse the previous worktree directly.

In the model picker, press Left in an empty search field or Shift+Tab to reach
the provider list. Use Up/Down to move and Enter to choose. Right returns to
model search. `mod+shift+up` and `mod+shift+down` switch providers directly and clear the
search. These provider shortcuts can also be changed in Settings.

These shortcuts run inside the focused web or desktop client. `mod` uses Command
on macOS and Ctrl on Windows and Linux, including GNOME, KDE Plasma, Niri, and
Hyprland. If a custom desktop shortcut takes the same keys, choose another binding
in Settings.

## Resize the right panel

Use `ctrl+alt+h` to move the divider between the chat and the right panel to the left, widening the panel, and `ctrl+alt+l` to move it right. Hold either to keep resizing. The width is remembered like a dragged one. They work while the panel sits beside the chat, not when it is maximized or shown over the chat in a narrow window. Change them under **Right Panel: Widen** and **Right Panel: Narrow** in Settings.

## Copy pull request references

With a PR open in the right panel or on the Pull Requests page, use `mod+shift+c`
to copy its URL and `mod+shift+k` to copy its number with a `#` prefix.
Both shortcuts can be changed in Settings. Search for “Copy Link or Thread ID”
or “Copy Number”. They copy the selected PR and leave terminal input alone.

## Find in a diff

Click into a diff in the Diff panel or a pull request's Code tab, then press
`mod+f` to search every file in it, including folded files and unchanged lines
hidden between changes. Enter and `Shift+Enter` move between matches, and a
match in a folded file opens it. Escape closes the search. This shortcut is not
configurable. A very large uncommitted diff loads its files as you scroll, and
find only searches the files loaded so far.

## iPad

With a hardware keyboard, use `Cmd+1` through `Cmd+9` to open the first nine
displayed threads. The shortcuts follow the current list filters and order.
`Cmd+K` opens the command palette to search commands, projects, and threads.
Use the arrow keys and Return to choose a result, or `Cmd+1` through `Cmd+9` to
choose directly. Escape or `Cmd+K` closes the palette. Start a search with `>`
to show only actions.

In a new thread, `Cmd+Shift+H` moves the draft to the next machine.

In the composer, Return sends and `Shift+Return` inserts a new line. `Cmd+Return`
also sends. To make Return insert a new line instead, change the Return key
behavior in Settings → Keyboard.

## Edit the configuration file

Keybindings live on the environment's machine, in
`~/.t3/userdata/keybindings.json` by default. You can edit this file directly.
It is a JSON array of rules:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

T3 Code creates the file with its defaults and adds new defaults on later startups.
New defaults do not replace commands you customized. If a new default overlaps one
of your shortcuts, [rule order](#precedence) decides which runs.
Invalid rules are ignored; if the file cannot be parsed, T3 Code uses defaults.

## Rule shape

Each rule requires a `key` shortcut and a `command` ID. An optional `when`
expression restricts when it runs.

Project scripts use `script.{id}.run`, such as `script.test.run`.

## Key syntax

Join modifiers and a key with `+`, such as `mod+shift+d` or `ctrl+l`.
`mod` means Command on macOS and Control elsewhere. Other modifiers are
`cmd` / `meta`, `ctrl` / `control`, `alt` / `option`, and `shift`.

## When conditions

Available context keys are `terminalFocus`, `terminalOpen`, `previewFocus`,
`previewOpen`, `modelPickerOpen`, `usagePageOpen`, `composerFocus`, `composerDraft`,
`turnRunning`, `editableFocus`, `isWeb`, and `isDesktop`.
`editableFocus` is true while a text field, the composer, or another editor has
the keyboard. `isWeb` is true in a browser tab. `isDesktop` is true in the
desktop app. Unknown keys evaluate to `false`.

`mod+1` through `mod+9` jump to the first nine threads, and to models while the
model picker is open. Those defaults use `isDesktop` so they do not steal the
browser's tab-switch shortcuts. Remove that condition in Settings if you want
the same jumps in a browser.

Combine keys with `!` for not, `&&` for and, `||` for or, and parentheses:

```json
{ "key": "mod+j", "command": "terminal.toggle", "when": "terminalOpen && !terminalFocus" }
```

## Find in the current thread

`chat.find` searches conversation messages and proposed plans in the active thread. Entering a
query searches the entire thread, including older messages. Thread search requires server support;
update an older server to enable it. Select **Retry** if a search fails. It defaults to
`mod+f` outside terminals and previews. Press **Enter** or **Shift+Enter** to move between matches,
and **Escape** to close find.

## Precedence

The last rule whose key and condition both match wins, even if it belongs to a
different command. Put a more specific rule after a general one when they share
a shortcut.

## Commands with special behavior

`thread.stop` interrupts the running turn in the focused thread. It has no default
shortcut; assign one in **Settings → Keybindings**.

`thread.undo` (`mod+z` by default) reverses the actions shown in the notice at the
bottom of the sidebar, such as unpin, settle, snooze, archive, or discarding a
draft. Consecutive
actions of the same kind undo together. The notice remains available for five
seconds after the latest action. The default shortcut skips text fields and
terminals so native undo keeps working there.

`navigation.back` (`mod+[` by default) and `navigation.forward` (`mod+]`) move
through the pages you have visited, like a browser's back and forward buttons.

`chat.new` may ask you to choose a project when there is more than one.
`chat.newLocal` skips that chooser. Both use your
[new-thread defaults](./thread-sidebar.md#start-a-thread). `chat.newWithoutProject`
(`mod+alt+n`) starts a thread [without a project](./thread-sidebar.md#start-without-a-project).

`flow.toggle` toggles Flow mode, which replaces the chat title bar with the Flow bar. It has no default
shortcut; in Vim Normal mode use `F` or `w q`, or bind it yourself. Enabling Flow hides the left
sidebar if it is open. Important sessions lead both the waiting queue and the right-side
working bench. Within each priority, waiting sessions go oldest first and working
sessions go newest-created first. Use `t f` in Vim Normal mode to flag or unflag a session.

The Flow overview shows a preview of each running session when nothing waits on you.
`flow.overview.toggle` (`w g` in Vim Normal mode, otherwise bind it yourself) holds the
overview open even while threads wait, with waiting threads first. While it is held, Flow
doesn't enter waiting threads on its own. Opening a session or toggling it again resumes the
queue; with threads waiting, only `w g` brings the overview back.

The Flow bar is hidden in the overview and returns when you open a session.
The overview uses `h`/`l` within a row and
`j`/`k` between rows. At the left edge, `h` moves to the sidebar. The other grid edges keep
focus on the current preview.

While Flow mode is active, sending a message, finishing the current thread's approval
or input requests, or settling, snoozing, or archiving it advances to an important
session needing attention first, otherwise the oldest available ordinary waiting session.
Starting a plan implementation advances too.
The next destination is marked **Next**. If nothing else needs attention, an open
session returns to the Flow overview. New activity never switches threads by itself. Typing or navigating
while an action is pending cancels its jump; leaving Flow mode turns auto-jump off.

## Reserved shortcuts

In the desktop app, `mod+w` closes the focused terminal or the active right-panel
tab. When nothing remains to close, it closes the window. In a browser, `mod+w`
closes the browser tab; rebind `rightPanel.close` and `terminal.close` to an available
shortcut such as `alt+w`.

`mod+shift+t` reopens the last closed tab across the app, including files,
diffs, pull requests, browsers, and devices, in the order you closed them.
A browser opens in a fresh session without its old page history. Incognito tabs
can reopen until you reload or quit the app. This shortcut does not undo deleted work.
Browsers also use it to reopen browser tabs; choose another binding in Settings
if the browser takes it first.

Many defaults include `!terminalFocus` so they do not intercept terminal input.
Keep that condition when remapping them if you want the same behavior.

## Desktop quit shortcut

Use `Cmd+Q` on macOS or `Ctrl+Q` on Windows and Linux. In the default **Hold** mode,
hold for 1.2 seconds or press twice within 500 milliseconds. Holding requires
keyboard repeat; if repeat is disabled, use two presses or the application menu.

Change **Settings → General → Confirmations → Quit shortcut** to **Direct** for a
single press or **Double press** for two presses only. Choosing **Quit** from the
application menu always quits immediately.
