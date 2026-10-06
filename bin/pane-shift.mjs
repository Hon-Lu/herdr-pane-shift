import {
  buildTree,
  findPath,
  focusFlag,
  fromGroups,
  getLayout,
  getPane,
  herdr,
  makeGroup,
  notify,
  rebuildSubtree,
  resolvePaneId,
  toGroups,
} from "./lib.mjs";

const DIRECTIONS = ["left", "up", "right", "down"];

const commands = {
  move: movePane,
  break: breakPane,
  rotate: rotateSplit,
  place: openPicker,
};

main();

function main() {
  const [name, ...args] = process.argv.slice(2);
  const command = commands[name];
  try {
    if (!command) {
      throw new Error(`Unknown command: ${name ?? "(none)"}`);
    }
    command(...args);
  } catch (error) {
    console.error(error.message);
    notify("Pane Shift", error.message);
    process.exit(1);
  }
}

function movePane(direction) {
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`Unknown direction: ${direction ?? "(none)"}`);
  }
  const paneId = resolvePaneId();
  const result = herdr("pane", "swap", "--direction", direction, "--pane", paneId);
  if (!result.swap.changed) {
    throw new Error(`There is no pane ${direction === "up" || direction === "down" ? direction : `to the ${direction}`} to swap with.`);
  }
}

function breakPane() {
  const paneId = resolvePaneId();
  const layout = getLayout(paneId);
  if (layout.panes.length < 2) {
    throw new Error("This pane is already alone in its tab.");
  }
  herdr("pane", "move", paneId, "--new-tab", focusFlag(paneId));
}

/**
 * 依畫面上看到的排與欄旋轉焦點 pane，與 herdr 內部的分割巢狀方式無關：
 * 在一排裡就疊到左鄰下方（最左邊時改疊到右鄰上方），在一欄裡就抽出成獨立一欄放到右側（最上方時放到左側）。
 * 兩種動作互為反向，所以再按一次會回到原位。
 */
function rotateSplit() {
  const paneId = resolvePaneId();
  const layout = getLayout(paneId);
  const path = findPath(toGroups(buildTree(layout)), paneId);
  if (!path) {
    throw new Error("This pane is alone in its tab, so there is nothing to rotate.");
  }
  const { group, index } = path.at(-1);
  const outer = path.at(-2);
  // 兩種動作都可能改動外層的排列，所以重組範圍取到外層群組
  const region = outer?.group ?? group;
  const rotated = group.direction === "right"
    ? replaceItem(outer, stackIntoNeighbor(group, index))
    : popOutOfColumn(group, index, outer);
  rebuildSubtree(layout.tab_id, region.source, fromGroups(rotated), { paneId, flag: focusFlag(paneId) });
}

/** 選擇器以 popup 開啟後焦點會離開來源 pane，所以先記下來源與它當下的焦點狀態再交給選擇器。 */
function openPicker() {
  const paneId = resolvePaneId();
  const focused = getPane(paneId).focused;
  herdr("plugin", "pane", "open", "--plugin", "pane-shift", "--entrypoint", "picker",
    "--env", `PANE_SHIFT_SOURCE=${paneId}`,
    "--env", `PANE_SHIFT_SOURCE_FOCUSED=${focused ? "1" : "0"}`);
}

/** 以新節點取代外層群組中原本的項目，大小沿用原項目；沒有外層時直接回傳新節點。 */
function replaceItem(outer, node) {
  if (!outer) return node;
  const items = outer.group.items.map((item, i) => (i === outer.index ? { node, size: item.size } : item));
  return makeGroup(outer.group.direction, items);
}

/** 把排中的 pane 疊進相鄰那一欄：有左鄰時接在左鄰最底下，最左邊時接在右鄰最上方。 */
function stackIntoNeighbor(row, index) {
  const items = [...row.items];
  const [pane] = items.splice(index, 1);
  const at = Math.max(0, index - 1);
  const neighbor = items[at];
  const members = neighbor.node.type === "group" ? neighbor.node.items : [{ node: neighbor.node, size: 1 }];
  const share = 1 / (members.length + 1);
  const kept = members.map((member) => ({ node: member.node, size: member.size * (1 - share) }));
  const added = { node: pane.node, size: share };
  const column = makeGroup("down", index > 0 ? [...kept, added] : [added, ...kept]);
  items[at] = { node: column, size: neighbor.size + pane.size };
  return makeGroup("right", items);
}

/**
 * 把欄中的 pane 抽出成獨立一欄：原本在最上方就放到左側，否則放到右側。
 * 抽出的 pane 依欄中格數分到相應的寬度（三格中抽一格就拿 1/3），畫面不會突然大幅跳動。
 */
function popOutOfColumn(column, index, outer) {
  const items = [...column.items];
  const [pane] = items.splice(index, 1);
  const share = 1 / column.items.length;
  const rest = { node: makeGroup("down", items), size: 1 - share };
  const popped = { node: pane.node, size: share };
  const pair = index > 0 ? [rest, popped] : [popped, rest];
  if (!outer) return makeGroup("right", pair);

  const width = outer.group.items[outer.index].size;
  const row = outer.group.items.flatMap((item, i) =>
    i === outer.index ? pair.map((entry) => ({ node: entry.node, size: entry.size * width })) : [item]);
  return makeGroup(outer.group.direction, row);
}
