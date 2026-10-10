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
5. Use `j` and `k` to read the conversation block by block, or `r` to open its changes.
6. Press `i` and write in the composer. Its usual editing and send controls still work.
7. Press `Esc`, then `q`, to return to the Flow bar. Your draft stays intact.

Returning to the Flow bar restores the card you left. If it has disappeared, focus moves to
the nearest remaining card. When no threads need attention, the Flow overview stays
on screen, and `w g` brings it up even while threads wait: `n` or `a` starts a new thread, and `Enter` opens the focused preview.
Use `h`/`l` across a row and `j`/`k` between rows. Grid edges keep focus on the
current preview.
From a session opened in the overview, press `Esc` in Normal mode to return to the overview.
Use `w h` from the conversation to browse the sidebar instead. Enabling Flow hides the left sidebar if it is open; you can still show or hide the sidebar afterward.

## Common actions

These keys work in Normal mode, outside text fields, embedded tools, and open dialogs.

| Key       | Action                                                          |
| --------- | --------------------------------------------------------------- |
| `H` / `L` | Focus the area to the left/right                                |
| `h` / `l` | Move within the current area; collapse/expand in a conversation |
| `Esc`     | Focus Conversation or show Flow overview                        |
| `Space`   | Same as `j`; `Shift+Space` is the same as `k`                   |
| `q`       | Open and focus Flow bar                                         |
| `F`       | Toggle Flow mode                                                |
| `i`       | Focus composer                                                  |
| `n`       | Open the new-thread chooser                                     |
| `a`       | Open the new-thread chooser                                     |
| `A`       | Expand and focus the pending question                           |
| `z i`     | Turn the reading lamp on or off                                 |
| `c`       | Cite the reading cursor's block in the composer                 |
| `m` / `e` | Choose a model / reasoning effort                               |
| `r`       | Open and focus review changes                                   |
| `/`       | Search and switch threads                                       |
| `,`       | Open keyboard settings                                          |
| `?`       | Show the complete shortcut reference                            |

Numbers follow the same thread order as the modified shortcuts: the Flow bar order while
Flow is on in a thread, otherwise the sidebar order. After a jump, the main content gets
focus in Normal mode, so another number immediately selects a thread from the sidebar.

Help reflects the current state: it shows **Unpin** for a pinned thread and **Restore**
for a maximized panel. It names the open thread targeted by thread actions. Unavailable
commands show a reason, and trying one displays that reason briefly. While the `?`
reference is open, typing a prefix highlights its matching commands.

Focus actions keep their destination open. Pressing `w l`, `q`, or `r` again does not close
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
| `w g`     | Toggle the Flow overview, even while threads wait on you                         |
| `w Space` | Toggle right-panel visibility                                                    |
| `w t`     | Toggle terminal visibility                                                       |
| `w m`     | Maximize or restore the open right panel, where the layout supports it           |
| `w h`     | Focus the area to the left, toward the sidebar                                   |
| `w l`     | Focus the area to the right, toward the right panel                              |
| `t p`     | Pin or unpin the open thread                                                     |
| `t s`     | Settle or unsettle the open thread                                               |
| `f f`     | Find a file in the active project                                                |
| `f s`     | Search the active project's file contents                                        |
| `g k`     | Commit changes                                                                   |

`w` controls workspace layout, `t` acts on the open thread, `f` finds things, and
`g k` commits changes.
For example, `q` opens Flow and focuses its bar when visible; the Flow overview keeps the bar hidden.
`F` or `w q` toggles Flow mode.

The commit dialog opens on its file list. `j`/`k` move between files, `Space` includes or excludes a file, `Enter` opens it in your editor, and `i` moves to the message. `Esc` in the message returns to the list, and `Cmd+Enter` (`Ctrl+Enter` off macOS) commits.

Use direct sequences such as `w q` for grouped commands, and `?` for the full reference.
The `?` reference stays visible while you navigate and run commands. Press `?` again or
`Esc` in Normal mode to close it. Text fields, questions, and embedded tools keep their
usual keys while the reference is visible.

Press `Esc` to cancel a sequence or close help first; press it again to focus the main
content. With no sequence or help open, one press focuses the main content. An invalid next key cancels the sequence
without running another command. Clicking elsewhere, changing focus, and changing views
also cancel it.

## Move and read

| Keys                                   | Flow bar             | Sidebar              | Conversation                            |
| -------------------------------------- | -------------------- | -------------------- | --------------------------------------- |
| `j` / `k` (or `Space` / `Shift+Space`) | Next / previous card | Next / previous item | Next / previous block                   |
| `h` / `l` (or arrows)                  | Previous / next card |                      | Collapse / expand (files, folds, tools) |
| `[[` / `]]`                            |                      |                      | Previous / next section                 |
| `Ctrl+j` / `Ctrl+k`                    |                      |                      | Scroll down / up                        |
| `gg` / `G`                             | First / last card    | First / last item    | Top / bottom                            |
| `J` / `K`                              |                      |                      | Next / previous message you sent        |
| `zt` / `zz` / `zb`                     |                      |                      | Scroll block to top / center / bottom   |
| `Enter`                                | Open focused thread  | Open focused item    | Use the focused control's usual action  |

In a conversation, a block is a paragraph, heading, list item, table, or code block of an answer, the header and each folder or file of the changed-files card after it, or any other timeline entry. Sections start at each message, at headings, at paragraphs or list items that open in bold, and at a changed-files card; when `[[` or `]]` stops, the heading or bold text that made it a section briefly lights up. The reading cursor marks your place: a bar beside the block you are on, or a highlighted border around a message you sent. The page stays still while it moves through the middle of the screen; before it gets within a fifth of the top or bottom, the conversation scrolls a little under half a screen toward where you are reading, so your place never sits at an edge. The block brightens as it moves so you can follow it. A quick step back scrolls only as far as it needs, so the block you left stays in view. A block taller than the window scrolls half a screen at a time before `j` moves on. `k`, `[[`, and `K` first return to the start of the block, section, or message you are partway through. Your first `j` or `k` shows the reading cursor on the first block that starts on screen. `Ctrl+j` and `Ctrl+k` scroll only when no other shortcut uses them; on Windows and Linux they open the terminal and command palette unless you change those.

With the reading cursor in a changed-files card, `h` and `l` work like a file tree: `l` opens a file's diff, expands a folder or steps into an open one, and on the card's header opens the turn's full diff; `h` collapses an open folder or steps out to the folder above, then the header. A finished turn's "Worked for …" fold and a group of tool calls such as "Ran 3 commands" work the same way: `l` expands one and then steps into what it reveals, and `h` collapses it. Inside an open group, `j` and `k` move from call to call, `l` and `h` show and hide a call's output, and `h` on a call steps back to the group. `h` from anything inside an open "Worked for …" fold steps back out to it. `Enter` opens or toggles whatever the cursor is on. Elsewhere in a conversation, `Enter` moves to the composer.

As in Vim, `zt`, `zz`, and `zb` scroll the conversation so the reading cursor's block sits near the top, in the middle, or near the bottom.

Press `z i` to turn on the reading lamp: everything except the reading cursor's block dims. The lamp stays on for this client until you press `z i` again. Press `c` to cite the reading cursor's block in the composer, as if you had selected its text and chosen **Cite**. Add an optional comment, or press `Esc` to remove the citation. Only answer text can be cited.

Movement changes focus. Press Enter to open a highlighted thread before pinning or
settling it: thread actions always apply to the thread you have open.

## Right-panel tabs and returning to your place

Press `w l` from the conversation to open and focus the active right-panel content.
Use `Ctrl+Shift+Space` to focus its selected tab. Use `h` / `l` (or `ArrowLeft` / `ArrowRight`) to select the previous or
next tab, then Enter to move into that surface's controls. Switching tabs keeps focus on
the tab strip. `h` stops at the first tab and `l` at the last; `w h` returns to the conversation. Embedded tools keep their own input behavior once you enter them.
If the panel has no tabs, Enter focuses its launcher so you can choose a surface.

`Ctrl+Shift+Space` returns from a right-panel editor or terminal to its selected tab.
From the terminal drawer, it returns to the conversation. Plain Escape stays available
to terminal programs.

Closing the command, file, model, or reasoning-effort picker restores the control you left. Enter on a model or effort choice from Normal mode stays in Normal mode. A conversation
keeps its scroll position. If a row has disappeared, focus falls back to its nearest
remaining item. `w w` alternates between your last two navigation areas without changing
the open thread.

## Review a diff

Press `r` (or `w l` while the review panel is open) to focus the diff. Focus waits for the diff to load, and the keys work anywhere in the panel, including its toolbar. The keys follow Emacs magit with evil bindings. Your first `j` or `k` puts the cursor on the first line on screen; the cursor is the highlighted line, or a bar on a file's header. While the diff has focus, its keys replace the app's `/`, `n`, `c`, `?`, `Space`, `h`, `l`, `[`, and `]`. Other app keys such as `w h`, `H`/`L`, and `q` keep working. Press `?` or the keyboard button in the diff toolbar for a cheatsheet of these keys.

| Keys                    | Action                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `j` / `k`               | Next / previous line, stepping through file headers                                                                |
| `Ctrl+j` / `Ctrl+k`     | Next / previous file header or hunk                                                                                |
| `]` / `[`               | Next / previous hunk in the file, or file to file from a header                                                    |
| `^` or `g h`            | The file's header                                                                                                  |
| `h` / `l`               | In split view, the old / new side; otherwise `h` goes to the header, which `h` collapses and `l` expands or enters |
| `gg` / `G`              | First file / last line                                                                                             |
| `Space` / `Shift+Space` | Scroll a page down / up (also `Ctrl+f` / `Ctrl+b`)                                                                 |
| `Ctrl+d` / `Ctrl+u`     | Scroll half a page down / up                                                                                       |
| `zt` / `zz` / `zb`      | Scroll the cursor's line to the top / center / bottom                                                              |
| `Tab` / `Shift+Tab`     | Collapse or expand the file / all files                                                                            |
| `1` / `2`               | The cursor's file: header only / show it all                                                                       |
| `Alt+1` / `Alt+2`       | Every file: headers only / show them all                                                                           |
| `+`                     | Show more unchanged lines around this file's hunks                                                                 |
| `/`, then `n` / `N`     | Search lines and file paths, then the next / previous match                                                        |
| `v` or `V`, then `y`    | Select lines, then copy them; `Esc` ends the selection                                                             |
| `y y` / `y s`           | Copy the line / the hunk (the file path on a header)                                                               |
| `c`                     | Comment on the line or selection                                                                                   |
| `Enter`                 | Open the file at the cursor's line                                                                                 |
| `g r`                   | Refresh the diff                                                                                                   |

Search ignores case unless your search has a capital letter. It looks inside collapsed files and opens the one it lands in. The digits follow magit's section levels, but hunks can't be folded on their own, so there are two levels: file headers, then everything. `Esc` ends a selection first; otherwise it returns to the conversation.

## Answer a question

Press `A` from Normal mode to expand and focus the pending question. This selects no
answer and sends nothing. Then press `1`–`9` to choose a numbered answer. Single-choice
answers advance as usual; multiple-choice answers toggle the option. Tab and mouse
selection also work.

While the expanded question has focus, its controls own the keys. Press `Esc` to return
to the conversation. Typed numbers in text fields remain
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

This profile does not add Vim text operators, counts, or macros.
Native mobile does not yet offer it.
