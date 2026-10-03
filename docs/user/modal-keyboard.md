# Using modal keyboard navigation

The **Vim navigation** profile gives common T3 actions short keys. Use
Vim-style movement to browse threads and read conversations, then `i` to write. The
profile is available in web and desktop clients and starts turned off.

## Turn it on

Open **Settings → Keybindings** and enable **Vim navigation**. The default
toggle is `Cmd+Option+V` on macOS or `Ctrl+Alt+V` on Windows and Linux. Use it outside the
terminal. The setting applies to the current client.

Spaces between keys mean press them in sequence: `w q` means `w`, then `q`. A plus sign
means hold keys together: `Ctrl+Shift+Space` is one shortcut. `gg` means two lowercase `g`
presses; `G` means `Shift+g`.

## Try the main workflow

Start with an open thread.

1. Press `Esc` to leave the composer. Dismiss any open suggestion or menu first.
2. Press `q` to open and focus the Flow bar.
3. Use `h` and `l` (or the arrow keys) to move between cards. The outline marks keyboard focus.
4. Press `Enter` to open that thread.
5. Use `j` and `k` to scroll the conversation, or `r` to open its changes.
6. Press `i` and write in the composer. Its usual editing and send controls still work.
7. Press `Esc`, then `q`, to return to the Flow bar. Your draft stays intact.

Returning to the Flow bar restores the card you left. If it has disappeared, focus moves to
the nearest remaining card. When no threads need attention, the working-session grid stays
on screen: `n` or `a` starts a new thread, and `Enter` opens the focused preview.
Use `h`/`l` across a row and `j`/`k` between rows. At the left edge, `h` moves to the
sidebar. The other grid edges keep focus on the current preview.
From an opened working-session preview, press `Esc` in Normal mode to return to the grid.
Use `h` from the conversation to browse the sidebar instead. Enabling Flow hides the left sidebar if it is open; you can still show or hide the sidebar afterward.

## Common actions

These keys work in Normal mode, outside text fields, embedded tools, and open dialogs.

| Key       | Action                                            |
| --------- | ------------------------------------------------- |
| `H` / `L` | Toggle sidebar / right panel visibility           |
| `h` / `l` | Navigate left / right within the current UI level |
| `Esc`     | Focus Conversation or show Flow grid              |
| `Space`   | Open and focus Right panel                        |
| `q`       | Open and focus Flow bar                           |
| `F`       | Toggle Flow mode                                  |
| `i`       | Focus composer                                    |
| `n`       | Open the new-thread chooser                       |
| `a`       | Open the new-thread chooser                       |
| `A`       | Expand and focus the pending question             |
| `m` / `e` | Choose a model / reasoning effort                 |
| `r`       | Open and focus review changes                     |
| `/`       | Search and switch threads                         |
| `,`       | Open keyboard settings                            |
| `1`–`9`   | Select thread as with `Cmd+1`–`Cmd+9`             |
| `?`       | Show the complete shortcut reference              |

Numbers follow the same thread order as the modified shortcuts: the sidebar order, or
the Flow bar order while the Flow bar has focus. After a jump, the main content gets
focus in Normal mode, so another number immediately selects a thread from the sidebar.

Help reflects the current state: it shows **Unpin** for a pinned thread and **Restore**
for a maximized panel. It names the open thread targeted by thread actions. Unavailable
commands show a reason, and trying one displays that reason briefly. While the `?`
reference is open, typing a prefix highlights its matching commands.

Focus actions keep their destination open. Pressing `Space`, `q`, or `r` again does not close
it. Right-panel focus lands in its active content. Use `Ctrl+Shift+Space` to return to the selected tab. `r` requires an
existing thread in a Git repository.

Press `Esc` to restore the conversation when the right panel is maximized. In narrow
windows, switching away from a panel sheet closes the sheet to reveal the destination.

## Workspace, thread, and find commands

Press a group key directly. Pause briefly to see its available commands, or type the
whole sequence without waiting. There is no typing deadline.

| Sequence  | Action                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `w w`     | Return to the previous navigation area; repeat to alternate between the last two |
| `w s`     | Toggle sidebar visibility                                                        |
| `w q`     | Toggle Flow bar visibility; enabling hides the left sidebar if it is open        |
| `w Space` | Toggle right-panel visibility                                                    |
| `w t`     | Toggle terminal visibility                                                       |
| `w m`     | Maximize or restore the open right panel, where the layout supports it           |
| `t p`     | Pin or unpin the open thread                                                     |
| `t s`     | Settle or unsettle the open thread                                               |
| `f f`     | Find a file in the active project                                                |
| `f s`     | Search the active project's file contents                                        |
| `g k`     | Commit changes                                                                   |

`w` controls workspace layout, `t` acts on the open thread, `f` finds things, and
`g k` commits changes.
For example, `q` opens Flow and focuses its bar when visible; the working-session grid keeps the bar hidden.
`F` or `w q` toggles Flow mode.

Space focuses the right panel immediately. Use direct sequences such as `w q` for
grouped commands, and `?` for the full reference.
The `?` reference stays visible while you navigate and run commands. Press `?` again or
`Esc` in Normal mode to close it. Text fields, questions, and embedded tools keep their
usual keys while the reference is visible.

Press `Esc` to cancel a sequence or close help first; press it again to focus the main
content. With no sequence or help open, one press focuses the main content. An invalid next key cancels the sequence
without running another command. Clicking elsewhere, changing focus, and changing views
also cancel it.

## Move and read

| Keys                  | Flow bar             | Sidebar              | Conversation                           |
| --------------------- | -------------------- | -------------------- | -------------------------------------- |
| `j` / `k`             | Next / previous card | Next / previous item | Scroll down / up                       |
| `h` / `l` (or arrows) | Previous / next card | Stay / conversation  | Focus sidebar / right panel            |
| `gg` / `G`            | First / last card    | First / last item    | Top / bottom                           |
| `J` / `K`             |                      |                      | Next / previous message you sent       |
| `Enter`               | Open focused thread  | Open focused item    | Use the focused control's usual action |

Movement changes focus. Press Enter to open a highlighted thread before pinning or
settling it: thread actions always apply to the thread you have open.

## Right-panel tabs and returning to your place

Press `l` from the conversation or `Space` to focus the active right-panel content.
Use `Ctrl+Shift+Space` to focus its selected tab. Use `h` / `l` (or `ArrowLeft` / `ArrowRight`) to select the previous or
next tab, then Enter to move into that surface's controls. Switching tabs keeps focus on
the tab strip. At the first tab, `h` returns to the conversation; `l` stops at the last tab. Embedded tools keep their own input behavior once you enter them.
If the panel has no tabs, Enter focuses its launcher so you can choose a surface.

`Ctrl+Shift+Space` returns from a right-panel editor or terminal to its selected tab.
From the terminal drawer, it returns to the conversation. Plain Escape stays available
to terminal programs.

Closing the command, file, model, or reasoning-effort picker restores the control you left. Enter on a model or effort choice from Normal mode stays in Normal mode. A conversation
keeps its scroll position. If a row has disappeared, focus falls back to its nearest
remaining item. `w w` alternates between your last two navigation areas without changing
the open thread.

## Answer a question

Press `A` from Normal mode to expand and focus the pending question. This selects no
answer and sends nothing. Then press `1`–`9` to choose a numbered answer. Single-choice
answers advance as usual; multiple-choice answers toggle the option. Tab and mouse
selection also work.

While the expanded question has focus, its controls own the keys. Press `Esc` to return
to the conversation, where `1`–`9` select threads again. Typed numbers in text fields remain
ordinary input. With this profile off, numbered answers keep their usual global shortcuts
outside text fields.

## Know where your keys will go

A steady accent outline marks the focused navigation area. Press `i` to write and
`Esc` to return to navigation. Press `?` for the keyboard reference; command prefixes
show available next keys.

| Context                     | Behavior                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| Normal                      | Direct action keys and prefixes navigate T3.                                  |
| Text field                  | Native editing; unhandled Escape returns to the conversation.                 |
| Question                    | Its controls and numbered answers own the keys; Escape returns to navigation. |
| Menu, picker, or dialog     | The open control handles its own keys and gets Escape first.                  |
| Terminal or embedded editor | The embedded tool keeps its editing keys.                                     |
| Right-panel launcher        | Its displayed letter shortcuts work while the launcher has focus.             |

Open the terminal with `w t`. Once it has focus, keys go to the shell or its running
program. Plain Escape remains available to programs such as Vim.

Press `Ctrl+Shift+Space` to return to T3 navigation. This uses Control
on macOS too and leaves the terminal's program running. Embedded file editors use the
same return shortcut, returning to their right-panel tab. In the desktop preview, use its existing command-palette shortcut,
then Escape, to return to T3.

Existing modified shortcuts, such as `Cmd+1`, keep their behavior. Mouse controls and
Tab navigation remain available.

## Customize or recover

In **Settings → Keybindings**, search for **Keyboard: Toggle Modal** to change the profile
toggle, or **Keyboard: Normal** to change the return shortcut. The direct keys and
sequences above are fixed in this version. See [Keybindings](./keybindings.md) for
recording shortcuts and resolving conflicts.

| What happened                                    | What to do                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `q`, `w`, or Space types into a field            | Press Escape and check for Normal mode.                                                  |
| Escape closes a suggestion but leaves you typing | Press Escape again.                                                                      |
| Escape stays in a terminal                       | Use `Ctrl+Shift+Space`.                                                                  |
| A command does nothing                           | Open a thread if needed; `A` needs a pending question and `r` needs a Git-backed thread. |
| You want ordinary keyboard behavior              | Turn the profile off in Settings or use its toggle shortcut.                             |

This profile does not add Vim text operators, counts, macros, or file/hunk review motions.
Native mobile does not yet offer it.
