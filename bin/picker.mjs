import { herdr, placeBeside, resolvePaneId } from "./lib.mjs";

const KEY = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  enter: "\r",
  esc: "\x1b",
  ctrlC: "\x03",
};
const SIDE_BY_KEY = { [KEY.left]: "left", [KEY.up]: "up", [KEY.right]: "right", [KEY.down]: "down" };

const sourceId = process.env.PANE_SHIFT_SOURCE || resolvePaneId();
const focus = process.env.PANE_SHIFT_SOURCE_FOCUSED === "0" ? "--no-focus" : "--focus";
const rows = buildRows(sourceId);
const targets = rows.filter((row) => row.pane);

const state = { mode: "pick", index: 0, scroll: 0, error: null };

start();

function start() {
  if (targets.length === 0) {
    state.error = "There is no other pane to place this pane beside.";
  }
  process.stdout.write("\x1b[?25l");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onKey);
  process.stdout.on("resize", render);
  render();
}

function onKey(key) {
  if (key === KEY.ctrlC) return exit(1);
  if (state.error) return exit(1);

  if (state.mode === "pick") {
    if (key === KEY.esc || key === "q") return exit(0);
    if (key === KEY.up) state.index = Math.max(0, state.index - 1);
    if (key === KEY.down) state.index = Math.min(targets.length - 1, state.index + 1);
    if (key === KEY.enter) state.mode = "side";
    return render();
  }

  if (key === KEY.esc) {
    state.mode = "pick";
    return render();
  }
  const side = SIDE_BY_KEY[key];
  if (!side) return;
  try {
    placeBeside(sourceId, targets[state.index].pane.pane_id, side, focus);
    exit(0);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

/** 依 workspace、tab 分組列出所有 pane，來源所在的 workspace 排最前面，來源本身不列入。 */
function buildRows(excludeId) {
  const workspaces = herdr("workspace", "list").workspaces;
  const tabs = herdr("tab", "list").tabs;
  const panes = herdr("pane", "list").panes;
  const agents = new Map(herdr("agent", "list").agents.map((agent) => [agent.pane_id, agent]));
  const sourceWorkspace = panes.find((p) => p.pane_id === excludeId)?.workspace_id;

  const ordered = [
    ...workspaces.filter((w) => w.workspace_id === sourceWorkspace),
    ...workspaces.filter((w) => w.workspace_id !== sourceWorkspace),
  ];
  const result = [];
  for (const workspace of ordered) {
    for (const tab of tabs.filter((t) => t.workspace_id === workspace.workspace_id)) {
      const tabPanes = panes.filter((p) => p.tab_id === tab.tab_id && p.pane_id !== excludeId);
      if (tabPanes.length === 0) continue;
      result.push({ heading: `${workspace.label} › ${tab.label}` });
      for (const pane of tabPanes) {
        result.push({ pane, agent: agents.get(pane.pane_id) });
      }
    }
  }
  return result;
}

function render() {
  const width = process.stdout.columns || 80;
  const height = process.stdout.rows || 24;
  const lines = [];

  lines.push(bold(truncate(`Place ${sourceId} beside…`, width)));
  lines.push("");
  const listHeight = Math.max(1, height - 5);
  const selectedRow = rows.indexOf(targets[state.index]);
  if (selectedRow < state.scroll) state.scroll = selectedRow;
  if (selectedRow >= state.scroll + listHeight) state.scroll = selectedRow - listHeight + 1;
  for (const row of rows.slice(state.scroll, state.scroll + listHeight)) {
    lines.push(formatRow(row, row === targets[state.index], width));
  }
  while (lines.length < height - 2) lines.push("");

  lines.push(dim("─".repeat(width)));
  lines.push(footer(width));

  process.stdout.write("\x1b[H\x1b[2J" + lines.map((line) => line + "\x1b[K").join("\r\n"));
}

function formatRow(row, selected, width) {
  if (row.heading) {
    return dim(truncate(row.heading, width));
  }
  const { pane, agent } = row;
  const name = pane.label || pane.terminal_title_stripped || "shell";
  const kind = agent ? `${agent.agent}${agent.agent_status ? ` · ${agent.agent_status}` : ""}` : "";
  const text = truncate(`${selected ? "▸" : " "} ${pane.pane_id}  ${kind ? `[${kind}]  ` : ""}${name}  ${pane.cwd ?? ""}`, width - 2);
  return selected ? `  ${inverse(text)}` : `  ${text}`;
}

/** 頁尾超過寬度會折行並把整個畫面往上推，所以先截斷純文字再上色。 */
function footer(width) {
  if (state.error) return red(truncate(`${state.error}  (press any key)`, width));
  if (state.mode === "side") {
    return bold(truncate(`Side of ${targets[state.index].pane.pane_id}?  ← ↑ → ↓   Esc back`, width));
  }
  return dim(truncate("↑↓ choose   Enter confirm   Esc cancel", width));
}

function exit(code) {
  process.stdout.write("\x1b[H\x1b[2J\x1b[?25h");
  process.stdin.setRawMode(false);
  process.exit(code);
}

/** 依終端顯示寬度截斷；中日韓文字與全形符號佔兩格。 */
function truncate(text, width) {
  const chars = [...text];
  if (chars.reduce((sum, char) => sum + charWidth(char), 0) <= width) return text;
  let used = 0;
  let result = "";
  for (const char of chars) {
    if (used + charWidth(char) > width - 1) break;
    used += charWidth(char);
    result += char;
  }
  return result + "…";
}

function charWidth(char) {
  const code = char.codePointAt(0);
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd);
  return wide ? 2 : 1;
}

function bold(text) {
  return `\x1b[1m${text}\x1b[0m`;
}

function dim(text) {
  return `\x1b[2m${text}\x1b[0m`;
}

function inverse(text) {
  return `\x1b[7m${text}\x1b[0m`;
}

function red(text) {
  return `\x1b[31m${text}\x1b[0m`;
}
