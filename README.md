**English** | [繁體中文](README.zh-TW.md)

# Pane Shift

A small [Herdr](https://herdr.dev) plugin for rearranging panes from the keyboard. Swap a pane
with its neighbor, break it into its own tab, rotate a split, or place it beside any pane in any
tab. Running processes and agents keep going: panes are only moved, never closed or re-created.

| Key | What it does |
|---|---|
| `prefix+ctrl+←` `↑` `→` `↓` | Swap the focused pane with its neighbor in that direction |
| `prefix+ctrl+t` | Move the focused pane into a new tab of its own |
| `prefix+ctrl+r` | Rotate: stack the pane into the column beside it, or pop it out of its column |
| `prefix+ctrl+p` | Pick any pane in any tab and place the focused pane on one side of it |

With Herdr's default prefix (`ctrl+b`) you can hold Ctrl the whole time: hold Ctrl, tap B, then
tap the arrow, T, R, or P.

## Quick start

### 1. Check the requirements

- Herdr 0.9.0 or newer
- Node.js 18 or newer, available as `node` on your `PATH`

No other dependencies and no build step. Works on Linux, macOS, and Windows.

### 2. Install the plugin

```sh
herdr plugin install Hon-Lu/herdr-pane-shift
```

Herdr shows a preview of the commands the plugin runs and asks you to confirm.

### 3. Add the keybindings

Herdr plugins cannot ship their own keybindings, so the plugin does nothing on a keypress until
you add these. Open Herdr's `config.toml`:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\herdr\config.toml` |
| Linux, macOS | `~/.config/herdr/config.toml` |

Paste this at the end of the file:

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

None of these keys are used by Herdr's defaults. If one clashes with your own bindings or another
plugin, change the `key` line.

### 4. Reload the config

```sh
herdr server reload-config
```

### 5. Try it

Split a pane (`ctrl+b`, then `v`), then press `ctrl+b`, `ctrl+←`. The two panes swap places.

## Optional: move focus with the arrow keys too

Herdr moves focus with `prefix+h/j/k/l` by default, and `prefix+arrow` is unbound. Binding the
arrows to focus pairs naturally with this plugin: the arrows move focus, and the same arrows with
Ctrl move the pane itself. The lists keep the default `h/j/k/l` keys working:

```toml
[keys]
focus_pane_left = ["prefix+h", "prefix+left"]
focus_pane_down = ["prefix+j", "prefix+down"]
focus_pane_up = ["prefix+k", "prefix+up"]
focus_pane_right = ["prefix+l", "prefix+right"]
```

| Keys | Moves |
|---|---|
| `prefix+←` `↑` `→` `↓` | Focus |
| `prefix+ctrl+←` `↑` `→` `↓` | The focused pane |

Put the `[keys]` table before the `[[keys.command]]` entries. If you have already customized
`focus_pane_*`, add the arrow keys to your own lists instead.

## Rotate

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

## Place

`place` opens a popup listing every pane, grouped by workspace and tab, with the current
workspace first. Each row shows the pane ID, the agent and its status, the pane name, and its
working directory.

1. `↑` `↓` to choose the pane to sit beside, `Enter` to confirm
2. `←` `↑` `→` `↓` to choose the side; the move happens immediately

`Esc` goes back a step, or closes the popup from the list. Nothing moves until a side is chosen.

## Troubleshooting

**Nothing happens when I press a key.** Check whether the action ran:

```sh
herdr plugin log list --plugin pane-shift --limit 5
```

- No new entry: the keypress never reached Herdr. Make sure you added the keybindings and reloaded
  the config. Some terminals and editors capture Ctrl+arrow keys for themselves (for example the
  VS Code integrated terminal); free the key there or pick another one.
- A `failed` entry: its message says why, for example there is no pane in that direction.

**The key works only some of the time.** Press the prefix once. In prefix mode a second `ctrl+b`
sends a literal `^B` to the pane and leaves prefix mode, so the next key goes to the pane.

**Errors.** They are shown as Herdr notifications and written to the plugin log above.

Avoid `prefix+ctrl+m` for your own bindings: terminals send Ctrl+M as Enter.

## How it works

Every action also works from the CLI and acts on the pane Herdr currently has focused:

```sh
herdr plugin action invoke pane-shift.rotate
```

A moved pane keeps focus only if it had focus before, so invoking an action from the CLI or
another client does not pull your view away. A tab left empty by a move is closed by Herdr.

`herdr pane move` can only put a pane to the right of or below its target, and ignores a move
within the same tab. `rotate` and `place` work around this: they read the split tree from
`herdr pane layout`, park the affected panes in a temporary tab, and move them back one by one
in the new arrangement. The temporary tab closes on its own, though you may see it flash in the
tab bar.

## Development

Link a local checkout instead of installing from GitHub, so edits take effect immediately:

```sh
herdr plugin uninstall pane-shift
herdr plugin link /path/to/herdr-pane-shift
```

## License

MIT
