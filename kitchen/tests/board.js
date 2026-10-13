// Loads the board program for a test: demo orders (KITCHEN_MOCK, so nothing
// reaches Square), config.example.json's settings (KITCHEN_CONFIG points at
// a file that isn't there), and a fresh empty folder for its own files
// (KITCHEN_DATA), so a test run never reads or changes this PC's.
const fs = require("fs");
const os = require("os");
const path = require("path");

const data = fs.mkdtempSync(path.join(os.tmpdir(), "kitchen-test-"));
process.env.KITCHEN_MOCK = "1";
process.env.KITCHEN_CONFIG = path.join(data, "no-config.json");
process.env.KITCHEN_DATA = data;
process.on("exit", () => fs.rmSync(data, { recursive: true, force: true }));

const board = require("../server.js");

// Every test starts from a board where nothing has been pressed.
board.reset = () => {
  for (const map of [board.bumped, board.canceled, board.handedOff, board.markedReady]) {
    for (const id of Object.keys(map)) delete map[id];
  }
  board.setSkip({ items: [], categories: [] });
};

// Times relative to now, as Square writes them.
board.minutesFromNow = (min) => new Date(Date.now() + min * 6e4).toISOString();

module.exports = board;
