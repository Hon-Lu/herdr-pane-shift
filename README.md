# Pane Shift

A small [Herdr](https://herdr.dev) plugin for rearranging panes from the keyboard:

| Suggested key | Action | What it does |
|---|---|---|
| `prefix+ctrl+←` `↑` `→` `↓` | `pane-shift.move-left` / `-up` / `-right` / `-down` | Swap the focused pane with its neighbor in that direction |
| `prefix+ctrl+t` | `pane-shift.break` | Move the focused pane into a new tab of its own |
| `prefix+ctrl+r` | `pane-shift.rotate` | Stack the focused pane into the column beside it, or pop it out of its column |
| `prefix+ctrl+p` | `pane-shift.place` | Pick any pane in any tab and place the focused pane on one side of it |

None of the suggested keys are used by Herdr's defaults. With the default prefix (`ctrl+b`) you
can hold Ctrl the whole time: hold Ctrl, tap B, then tap the arrow, T, R, or P.

Running processes and agents keep going: panes are moved with `herdr pane move` and
`herdr pane swap`, never closed or re-created. A tab left empty by a move is closed by Herdr.

## Requirements

- Herdr 0.9.0 or newer
- Node.js 18 or newer on `PATH`

No dependencies, no build step. Linux, macOS, and Windows.

## Install

From a local checkout:

```sh
herdr plugin link /path/to/herdr-pane-shift
```

## Keybindings

Herdr plugins cannot ship keybindings, so add these to Herdr's `config.toml`
(`%APPDATA%\herdr\config.toml` on Windows) and run `herdr server reload-config`. Change any key
that clashes with your own bindings or another plugin:

```toml
[[keys.command]]
key = "prefix+ctrl+left"
type = "plugin_action"
command = "pane-shift.move-left"
description = "move pane left"

[[keys.command]]
key = "prefix+ctrl+up"
type = "plugin_action"
command = "pane-shift.move-up"
description = "move pane up"

[[keys.command]]
key = "prefix+ctrl+right"
type = "plugin_action"
command = "pane-shift.move-right"
description = "move pane right"

[[keys.command]]
key = "prefix+ctrl+down"
type = "plugin_action"
command = "pane-shift.move-down"
description = "move pane down"

[[keys.command]]
key = "prefix+ctrl+t"
type = "plugin_action"
command = "pane-shift.break"
description = "break pane into new tab"

[[keys.command]]
key = "prefix+ctrl+r"
type = "plugin_action"
command = "pane-shift.rotate"
description = "rotate split"

[[keys.command]]
key = "prefix+ctrl+p"
type = "plugin_action"
command = "pane-shift.place"
description = "place pane beside another pane"
```

Avoid `prefix+ctrl+m` for your own bindings: terminals send Ctrl+M as Enter.

Press the prefix only once. In prefix mode a second `ctrl+b` sends a literal `^B` to the pane
and leaves prefix mode, and in navigate mode it only leaves navigate mode. Either way the next
key goes to the pane instead of triggering an action.

Every action also works from the CLI and acts on the pane Herdr currently has focused:

```sh
herdr plugin action invoke pane-shift.rotate
```

## Place

`place` opens a popup listing every pane, grouped by workspace and tab, with the current
workspace first. Each row shows the pane ID, the agent and its status, the pane name, and its
working directory.

1. `↑` `↓` to choose the pane to sit beside, `Enter` to confirm
2. `←` `↑` `→` `↓` to choose the side; the move happens immediately

`Esc` goes back a step, or closes the popup from the list. Nothing moves until a side is chosen.

## How it works

`herdr pane move` can only put a pane to the right of or below its target, and ignores a move
within the same tab. `place` works around both: a pane that stays in its tab first moves out to
a temporary tab, comes back with the wanted split direction, and is swapped with its target when
it should end up on the left or above. The temporary tab closes on its own.

`rotate` follows the rows and columns you see, not how Herdr happens to nest its splits:

| The focused pane is | Rotate |
|---|---|
| In a row, with a pane on its left | Stacks under its left neighbor, at the bottom of that column |
| The first pane of a row | Stacks on top of its right neighbor |
| In a column, with a pane above it | Pops out into its own column, to the right of that column |
| The top pane of a column | Pops out into its own column, to the left |

Stacking and popping out undo each other, so rotating the same pane again puts it back. A pane
popped out of a column takes its share of that column's width (one of three panes gets a third).

```
focus on C           rotate              focus on A           rotate
┌─────┬─────┐        ┌───────────┐       ┌─────┬─────┐        ┌───┬───┬───┐
│  A  │     │        │     A     │       │  A  │     │        │   │   │   │
├─────┤  C  │   →    ├───────────┤       ├─────┤  C  │   →    │ A │ B │ C │
│  B  │     │        │     B     │       │  B  │     │        │   │   │   │
└─────┴─────┘        ├───────────┤       └─────┴─────┘        └───┴───┴───┘
                     │     C     │
                     └───────────┘
```

Under the hood it reads the split tree from `herdr pane layout`, parks the affected panes in a
temporary tab, and moves them back one by one in the new arrangement.

## Focus

A moved pane keeps focus only if it had focus before, so invoking an action from the CLI or
another client does not pull your view away.

Errors are shown as Herdr notifications and written to the plugin log
(`herdr plugin log list --plugin pane-shift`).
