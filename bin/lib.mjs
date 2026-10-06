import { spawnSync } from "node:child_process";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
// 版面座標是整數格，間距設定可能讓相鄰 pane 之間差一格
const EDGE_TOLERANCE = 1;

export function herdr(...args) {
  const result = spawnSync(HERDR, args, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = parseJson(result.stderr)?.error?.message || result.stderr.trim() || result.stdout.trim();
    throw new Error(`herdr ${args.slice(0, 2).join(" ")} failed: ${detail}`);
  }
  return parseJson(result.stdout)?.result ?? null;
}

export function notify(title, body) {
  spawnSync(HERDR, ["notification", "show", title, "--body", body], { encoding: "utf8" });
}

/**
 * 依序採用呼叫端 context 的焦點 pane、注入的 HERDR_PANE_ID，最後才查詢 UI 焦點，
 * 讓快捷鍵與 CLI 觸發都能找到目標。
 */
export function resolvePaneId() {
  const context = parseJson(process.env.HERDR_PLUGIN_CONTEXT_JSON) ?? {};
  const paneId = context.focused_pane_id || context.pane_id || process.env.HERDR_PANE_ID;
  if (paneId) return paneId;
  return herdr("pane", "current").pane.pane_id;
}

export function getPane(paneId) {
  return herdr("pane", "get", paneId).pane;
}

export function getLayout(paneId) {
  return herdr("pane", "layout", "--pane", paneId).layout;
}

/** 被搬動的 pane 原本持有焦點時才跟著聚焦，避免從背景觸發時把使用者的畫面帶走。 */
export function focusFlag(paneId) {
  return getPane(paneId).focused ? "--focus" : "--no-focus";
}

/**
 * 把 source 放到 target 的指定一側，可跨 tab 與 workspace，回傳 source 搬動後的 pane ID。
 * herdr 的 move 只能放在右方或下方，左方與上方靠事後互換達成；
 * 同一個 tab 內的 move 會被 herdr 忽略，所以先移到暫時的 tab 再移回來。
 */
export function placeBeside(sourceId, targetId, side, focus) {
  const source = getPane(sourceId);
  const target = getPane(targetId);
  const sameTab = source.tab_id === target.tab_id;
  const direction = side === "left" || side === "right" ? "right" : "down";

  let paneId = sourceId;
  if (sameTab) {
    paneId = movedPaneId(herdr("pane", "move", paneId, "--new-tab", "--no-focus"), paneId);
  }
  try {
    paneId = movedPaneId(herdr("pane", "move", paneId, "--tab", target.tab_id, "--split", direction,
      "--target-pane", targetId, focus), paneId);
  } catch (error) {
    if (sameTab) {
      // 移回失敗時 pane 會留在暫時的 tab，盡量放回原本的 tab
      herdr("pane", "move", paneId, "--tab", source.tab_id, "--split", "right", "--target-pane", targetId, focus);
    }
    throw error;
  }
  if (side === "left" || side === "up") {
    herdr("pane", "swap", "--source-pane", paneId, "--target-pane", targetId);
  }
  return paneId;
}

/**
 * 找出與 pane 共用一整條邊的相鄰 pane，也就是同一個分割底下的另一半。
 * axis 為 "vertical" 表示上下排列；paneIsFirst 表示 pane 在上方或左方。
 */
export function findSibling(layout, paneId) {
  const pane = layout.panes.find((p) => p.pane_id === paneId);
  const a = pane.rect;
  for (const other of layout.panes) {
    if (other.pane_id === paneId) continue;
    const b = other.rect;
    const sameColumn = near(a.x, b.x) && near(a.width, b.width);
    const sameRow = near(a.y, b.y) && near(a.height, b.height);
    if (sameColumn && near(a.y + a.height, b.y)) {
      return { paneId: other.pane_id, axis: "vertical", paneIsFirst: true };
    }
    if (sameColumn && near(b.y + b.height, a.y)) {
      return { paneId: other.pane_id, axis: "vertical", paneIsFirst: false };
    }
    if (sameRow && near(a.x + a.width, b.x)) {
      return { paneId: other.pane_id, axis: "horizontal", paneIsFirst: true };
    }
    if (sameRow && near(b.x + b.width, a.x)) {
      return { paneId: other.pane_id, axis: "horizontal", paneIsFirst: false };
    }
  }
  return null;
}

export function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 跨 workspace 的 move 會配發新的 pane ID，之後的操作要改用回傳值。 */
function movedPaneId(result, fallback) {
  return result?.move_result?.pane?.pane_id ?? fallback;
}

function near(a, b) {
  return Math.abs(a - b) <= EDGE_TOLERANCE;
}
