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
 * 由 pane layout 的座標還原 herdr 的分割樹。
 * 節點為 { type: "pane", paneId } 或 { type: "split", direction, ratio, first, second }；
 * direction 沿用 herdr 的 "right"（左右並排）與 "down"（上下排列），ratio 是 first 所佔比例。
 */
export function buildTree(layout) {
  return buildNode(layout.panes, layout.splits);
}

/**
 * 把 tab 中的子分割 oldNode 重組成 newNode 的樹形，兩者必須包含同一組 pane；
 * pane 與其中的程序都不會重建。newNode 的第一個 pane 留在原位當錨點（其餘 pane 移走後
 * 它會佔滿整個子分割的位置），其餘 pane 先移到暫存 tab，再依新的樹形逐一切回錨點周圍；
 * 暫存 tab 搬空後由 herdr 自動關閉。
 * focus 指定要維持焦點的 pane 與它搬回時使用的焦點旗標。
 */
export function rebuildSubtree(tabId, oldNode, newNode, focus) {
  const anchor = firstLeaf(newNode);
  const parked = leaves(oldNode).filter((id) => id !== anchor);
  let holdingTab = null;
  for (const id of parked) {
    if (holdingTab) {
      herdr("pane", "move", id, "--tab", holdingTab, "--split", "right", "--target-pane", parked[0], "--no-focus");
    } else {
      holdingTab = herdr("pane", "move", id, "--new-tab", "--no-focus").move_result.pane.tab_id;
    }
  }

  const remaining = new Set(parked);
  try {
    attach(newNode, anchor, tabId, remaining, focus);
  } catch (error) {
    // 中途失敗時至少把還在暫存 tab 的 pane 放回原 tab，不讓它們遺落在別處
    for (const id of remaining) {
      try {
        herdr("pane", "move", id, "--tab", tabId, "--split", "right", "--target-pane", anchor, "--no-focus");
      } catch {
        // 盡力而為，原始錯誤比較重要
      }
    }
    throw error;
  }
}

/**
 * 把二元分割樹攤平成使用者看得到的排與欄：同方向的連續分割合併成一個群組。
 * 群組為 { type: "group", direction, items: [{ node, size }], source }，size 是項目在群組內的比例，
 * source 是這個群組在原本二元樹中的根節點。
 */
export function toGroups(node) {
  if (node.type === "pane") return node;
  return { type: "group", direction: node.direction, items: flatten(node, node.direction, 1), source: node };
}

/** toGroups 的反向轉換，群組內的項目依序以往右（或往下）巢狀的分割串起來。 */
export function fromGroups(node) {
  if (node.type === "pane") return node;
  const last = node.items.at(-1);
  let result = fromGroups(last.node);
  let total = last.size;
  for (let i = node.items.length - 2; i >= 0; i--) {
    const { node: child, size } = node.items[i];
    result = { type: "split", direction: node.direction, ratio: size / (size + total), first: fromGroups(child), second: result };
    total += size;
  }
  return result;
}

/**
 * 建立群組：與群組同方向的子群組併入同一層，比例重新正規化；只剩一個項目時直接回傳該項目。
 */
export function makeGroup(direction, items) {
  const merged = items.flatMap(({ node, size }) =>
    node.type === "group" && node.direction === direction
      ? node.items.map((item) => ({ node: item.node, size: item.size * size }))
      : [{ node, size }]);
  if (merged.length === 1) return merged[0].node;
  const total = merged.reduce((sum, item) => sum + item.size, 0);
  return { type: "group", direction, items: merged.map((item) => ({ node: item.node, size: item.size / total })) };
}

/** 從根群組走到 pane 的路徑，每一步記錄所在群組與項目索引；pane 獨佔整個 tab 時回傳 null。 */
export function findPath(node, paneId) {
  if (node.type === "pane") return null;
  for (const [index, item] of node.items.entries()) {
    if (item.node.type === "pane" && item.node.paneId === paneId) return [{ group: node, index }];
    const rest = findPath(item.node, paneId);
    if (rest) return [{ group: node, index }, ...rest];
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

function buildNode(panes, splits) {
  if (panes.length === 1) {
    return { type: "pane", paneId: panes[0].pane_id };
  }
  const box = boundingBox(panes.map((p) => p.rect));
  const split = splits.find((s) => sameRect(s.rect, box));
  // 對不到 herdr 回報的分割時，改從座標推斷方向
  const candidates = split ? [split] : [{ direction: "right", ratio: 0.5 }, { direction: "down", ratio: 0.5 }];
  for (const { direction, ratio } of candidates) {
    const parts = cut(panes, box, direction, ratio);
    if (parts) {
      return {
        type: "split",
        direction,
        ratio,
        first: buildNode(parts[0], splits),
        second: buildNode(parts[1], splits),
      };
    }
  }
  throw new Error("Could not work out how this tab is split.");
}

/** 沿分割方向找出能把 pane 乾淨分成兩群的切線；有多條時取最接近分割比例的那條。 */
function cut(panes, box, direction, ratio) {
  const alongX = direction === "right";
  const start = (r) => (alongX ? r.x : r.y);
  const end = (r) => (alongX ? r.x + r.width : r.y + r.height);
  const origin = alongX ? box.x : box.y;
  const expected = origin + (alongX ? box.width : box.height) * ratio;
  let best = null;
  for (const line of new Set(panes.map((p) => start(p.rect)))) {
    if (line <= origin) continue;
    const first = panes.filter((p) => start(p.rect) < line);
    if (!first.every((p) => end(p.rect) <= line + EDGE_TOLERANCE)) continue;
    if (!best || Math.abs(line - expected) < Math.abs(best.line - expected)) {
      best = { line, parts: [first, panes.filter((p) => start(p.rect) >= line)] };
    }
  }
  return best?.parts ?? null;
}

function flatten(node, direction, share) {
  if (node.type === "split" && node.direction === direction) {
    return [
      ...flatten(node.first, direction, share * node.ratio),
      ...flatten(node.second, direction, share * (1 - node.ratio)),
    ];
  }
  return [{ node: toGroups(node), size: share }];
}

function attach(node, anchor, tabId, remaining, focus) {
  if (node.type === "pane") return;
  const head = firstLeaf(node.second);
  herdr("pane", "move", head, "--tab", tabId, "--split", node.direction, "--target-pane", anchor,
    "--ratio", String(node.ratio), head === focus.paneId ? focus.flag : "--no-focus");
  remaining.delete(head);
  attach(node.first, anchor, tabId, remaining, focus);
  attach(node.second, head, tabId, remaining, focus);
}

function leaves(node) {
  return node.type === "pane" ? [node.paneId] : [...leaves(node.first), ...leaves(node.second)];
}

function firstLeaf(node) {
  return node.type === "pane" ? node.paneId : firstLeaf(node.first);
}

function boundingBox(rects) {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

function sameRect(a, b) {
  return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);
}

function near(a, b) {
  return Math.abs(a - b) <= EDGE_TOLERANCE;
}
