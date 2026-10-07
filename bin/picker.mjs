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
// SGR 滑鼠回報：按鍵代碼 0 為左鍵、2 為右鍵，64、65 為滾輪上下；結尾 M 是按下、m 是放開
const MOUSE_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1000l\x1b[?1006l";

const sourceId = process.env.PANE_SHIFT_SOURCE || resolvePaneId();
const focus = process.env.PANE_SHIFT_SOURCE_FOCUSED === "0" ? "--no-focus" : "--focus";
const rows = buildRows(sourceId);
const targets = rows.filter((row) => row.pane);

const state = { mode: "pick", index: 0, scroll: 0, error: null };
// 每次重畫時記下可點擊的位置：清單列的 y 對應 targets 索引，按鈕記錄所在列與 x 範圍
const hits = { rows: new Map(), buttons: [] };

start();

function start() {
  if (targets.length === 0) {
    state.error = "There is no other pane to place this pane beside.";
  }
  process.stdout.write("\x1b[?25l" + MOUSE_ON);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onInput);
  process.stdout.on("resize", render);
  render();
}

function onInput(data) {
  const mouseEvents = [...data.matchAll(MOUSE_PATTERN)];
  if (mouseEvents.length === 0) return onKey(data);
  for (const [, button, x, y, kind] of mouseEvents) {
    if (kind === "M") onMouse(Number(button), Number(x), Number(y));
  }
}

function onKey(key) {
  if (key === KEY.ctrlC) return exit(1);
  if (state.error) return exit(1);

  if (state.mode === "pick") {
    if (key === KEY.esc || key === "q") return exit(0);
    if (key === KEY.up) moveSelection(-1);
    if (key === KEY.down) moveSelection(1);
    if (key === KEY.enter) state.mode = "side";
    return render();
  }

  if (key === KEY.esc) return runAction("back");
  const side = SIDE_BY_KEY[key];
  if (side) runAction(side);
}

function onMouse(button, x, y) {
  if (state.error) return exit(1);
  if (state.mode === "pick" && (button === 64 || button === 65)) {
    moveSelection(button === 64 ? -1 : 1);
    return render();
  }
  if (button === 2) return runAction(state.mode === "side" ? "back" : "cancel");
  if (button !== 0) return;

  const hit = hits.buttons.find((b) => b.y === y && x >= b.from && x <= b.to);
  if (hit) return runAction(hit.action);
  // 第一次點只選取，再點同一列才確認，避免一點就跳到選方向
  if (state.mode === "pick" && hits.rows.has(y)) {
    const index = hits.rows.get(y);
    if (index === state.index) state.mode = "side";
    state.index = index;
    render();
  }
}

/** 頁尾按鈕與對應按鍵的動作：left／up／right／down 放置，back 回到清單，cancel 關閉。 */
function runAction(action) {
  if (action === "cancel") return exit(0);
  if (action === "back") {
    state.mode = "pick";
    return render();
  }
  try {
    placeBeside(sourceId, targets[state.index].pane.pane_id, action, focus);
    exit(0);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function moveSelection(delta) {
  state.index = Math.min(targets.length - 1, Math.max(0, state.index + delta));
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
  hits.rows.clear();
  for (const row of rows.slice(state.scroll, state.scroll + listHeight)) {
    if (row.pane) hits.rows.set(lines.length + 1, targets.indexOf(row));
    lines.push(formatRow(row, row === targets[state.index], width));
  }
  while (lines.length < height - 2) lines.push("");

  lines.push(dim("─".repeat(width)));
  lines.push(footer(width, lines.length + 1));

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

/**
 * 頁尾超過寬度會折行並把整個畫面往上推，所以每段都先截斷再上色；
 * 按鈕的 x 範圍同時記進 hits 供滑鼠比對。y 是頁尾所在的列。
 */
function footer(width, y) {
  hits.buttons = [];
  if (state.error) return red(truncate(`${state.error}  (click or press any key)`, width));
  const parts = state.mode === "side"
    ? [
        { text: `Side of ${targets[state.index].pane.pane_id}?  ` },
        { text: "[← left]", action: "left" }, { text: " " },
        { text: "[↑ up]", action: "up" }, { text: " " },
        { text: "[→ right]", action: "right" }, { text: " " },
        { text: "[↓ down]", action: "down" }, { text: "   " },
        { text: "[esc · right-click back]", action: "back" },
      ]
    : [
        { text: "↑↓ / wheel / click choose   Enter or click again confirm   " },
        { text: "[esc · right-click cancel]", action: "cancel" },
      ];

  let column = 1;
  let line = "";
  for (const part of parts) {
    const room = width - column + 1;
    if (room <= 0) break;
    const text = truncate(part.text, room);
    if (part.action) {
      hits.buttons.push({ y, from: column, to: column + displayWidth(text) - 1, action: part.action });
      line += inverse(text);
    } else {
      line += state.mode === "side" ? bold(text) : dim(text);
    }
    column += displayWidth(text);
  }
  return line;
}

function exit(code) {
  process.stdout.write(MOUSE_OFF + "\x1b[H\x1b[2J\x1b[?25h");
  process.stdin.setRawMode(false);
  process.exit(code);
}

/** 依終端顯示寬度截斷；中日韓文字與全形符號佔兩格。 */
function truncate(text, width) {
  const chars = [...text];
  if (displayWidth(text) <= width) return text;
  let used = 0;
  let result = "";
  for (const char of chars) {
    if (used + charWidth(char) > width - 1) break;
    used += charWidth(char);
    result += char;
  }
  return result + "…";
}

function displayWidth(text) {
  return [...text].reduce((sum, char) => sum + charWidth(char), 0);
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
