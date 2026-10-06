import {
  findSibling,
  focusFlag,
  getLayout,
  getPane,
  herdr,
  notify,
  placeBeside,
  resolvePaneId,
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

/** 把 pane 與同一層的相鄰 pane 從上下改成左右（或反之），保留兩者的先後位置。 */
function rotateSplit() {
  const paneId = resolvePaneId();
  const sibling = findSibling(getLayout(paneId), paneId);
  if (!sibling) {
    throw new Error("No neighbor shares a full edge with this pane, so there is no split to rotate.");
  }
  const side = sibling.axis === "vertical"
    ? (sibling.paneIsFirst ? "left" : "right")
    : (sibling.paneIsFirst ? "up" : "down");
  placeBeside(paneId, sibling.paneId, side, focusFlag(paneId));
}

/** 選擇器以 popup 開啟後焦點會離開來源 pane，所以先記下來源與它當下的焦點狀態再交給選擇器。 */
function openPicker() {
  const paneId = resolvePaneId();
  const focused = getPane(paneId).focused;
  herdr("plugin", "pane", "open", "--plugin", "pane-shift", "--entrypoint", "picker",
    "--env", `PANE_SHIFT_SOURCE=${paneId}`,
    "--env", `PANE_SHIFT_SOURCE_FOCUSED=${focused ? "1" : "0"}`);
}
