#!/usr/bin/env node
/**
 * Kitchen order board — runs on the kitchen mini PC, nowhere else.
 *
 *   node server.js          → live, reads config.json
 *   KITCHEN_MOCK=1 node server.js → fake orders, no Square account needed
 *
 * Polls Square's Orders API every few seconds and serves a full-screen board
 * at http://localhost:8090 for Chrome in kiosk mode (start-kitchen.bat).
 *
 * Why a local program and not a page on the website: the board needs a Square
 * access token, and a token can never go in this public repo or on the public
 * site. Here it lives in config.json on the kitchen PC (gitignored), the server
 * binds to 127.0.0.1 only, and nothing new is exposed to the internet.
 *
 * What shows on the board:
 *   - Counter (POS) sales from today. Square marks these COMPLETED the moment
 *     they're paid, so Square never "finishes" them for us — the cooks bump
 *     them off with Done. Bumps are kept in data\state.json, local to this PC.
 *   - A counter sale with nothing paid on it shows like any other, tagged
 *     NOT PAID: a pay-later phone order is cooked straight away and kept
 *     warm. If it was a sale that fell through (card declined, payment
 *     canceled on the terminal), the front takes it off both screens with
 *     "Canceled". Once it's paid in Square the tag goes away by itself.
 *   - Online / pickup orders due today (or within SHOW_AHEAD of now), until a
 *     cook bumps them OR the front marks them ready/picked up in Square —
 *     whichever comes first.
 *
 * Done does not touch a counter sale in Square. For online and DoorDash
 * orders, Done marks them Ready in Square and Handed off marks them picked up
 * (squareStatus; see lib/square-status.js).
 *
 * The front page (/front) is the same orders for the counter, on a laptop or
 * tablet over the cafe wifi: what's cooking, what's ready (the kitchen pressed
 * Done), and what the front adds to the bag (the skip-list items: drinks,
 * chips). The front clears its own list with "Handed off"; that never touches
 * the kitchen board. Only /front and its own actions answer the network;
 * the kitchen board, the power menu and updates answer this PC alone.
 *
 * This file only starts things. The work is in lib/, one file per job, with
 * nothing to npm install:
 *   config.js         config.json and the KITCHEN_* switches
 *   data.js           data\, where this PC's own files are kept
 *   backup.js         the nightly copy of data\
 *   offsite.js        ...and pushing it to a private GitHub repo
 *   state.js          what's been pressed (state.json) and the skip list
 *   square.js         Square's API, and fetching the orders
 *   catalog.js        Square's item list; reading and writing one object
 *   tickets.js        Square's orders into tickets; which screen each is on
 *   orders.js         polling, what each screen is sent, Undo, demo, reset
 *   live.js           what the last poll found
 *   square-status.js  telling Square Ready / picked up
 *   stats.js          today's numbers and the daily history (Reports)
 *   specials/         the plan, and the day's names, prices, sides,
 *                     descriptions and photos in Square
 *   desserts.js, photo-post.js   Manage -> Desserts and Photo post
 *   reservations.js   Manage -> Reservations, the website's table requests
 *                     (through google-script/Code.gs), the screens' list
 *   mock.js           test mode's and the demo's made-up orders
 *   check.js          /check, and the front page's addresses
 *   system.js         power menu, updates, watchdog
 *   routes.js         every address the program answers
 */

const http = require("http");
const { MOCK, MUTE, cfg } = require("./lib/config");
const { CATALOG_MINUTES, loadCatalog } = require("./lib/catalog");
const { poll } = require("./lib/orders");
const { syncSquare } = require("./lib/square-status");
const { SITE_MINUTES, pullSite, plan } = require("./lib/specials/plan");
const { applyToday } = require("./lib/specials/today");
const { sideSlots, swapsFor, specialSideOptions, leaveOffOptions } = require("./lib/specials/sides");
const { dayDescription } = require("./lib/specials/descriptions");
const { setSkip, bumped, platesDone, canceled, handedOff, markedReady } = require("./lib/state");
const { toTicket, isOnline, hiddenReason, frontHiddenReason, readyAt, orderDetail } = require("./lib/tickets");
const { FRONT_URL, frontAddresses } = require("./lib/check");
const { startWatchdog } = require("./lib/system");
const { startBackups } = require("./lib/backup");
const { startReservations } = require("./lib/reservations");
const { handle } = require("./lib/routes");

function start() {
  const server = http.createServer(handle);
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${cfg.port} is already in use: another copy of the board program is running.
` +
          "Close every \"Kitchen board program\" window (or restart the PC), then run start-kitchen.bat."
      );
      process.exit(1);
    }
    throw err;
  });

  // The kitchen board is for this PC's own screen. With frontOnNetwork the
  // program also listens on the wifi, for /front; isLocal() and
  // networkAllowed() in lib/routes.js keep everything else to this PC.
  const HOST = cfg.frontOnNetwork ? "0.0.0.0" : "127.0.0.1";
  startWatchdog();
  server.listen(cfg.port, HOST, () => {
    console.log(`Kitchen board on http://localhost:${cfg.port}${MOCK ? "  (MOCK ORDERS)" : ""}`);
    console.log(cfg.frontOnNetwork ? `Front page for the counter: ${FRONT_URL}` : "Front page: this PC only (frontOnNetwork is false).");
    if (cfg.frontOnNetwork) {
      for (const a of frontAddresses()) console.log(`  or by address: ${a.url}   (${a.adapter}, hardware address ${a.mac})`);
    }
    console.log(`Checking Square every ${cfg.pollSeconds} s.`);
    if (!cfg.sound || MUTE) console.log("Sound is OFF.");
    for (const note of cfg.notes) console.log(`config.json: ${note}`);
    // The catalog first, so a skipped category is never on the first board.
    // Then the website's week, then today's specials into Square.
    loadCatalog().finally(() => {
      poll();
      pullSite().finally(applyToday);
    });
    setInterval(loadCatalog, CATALOG_MINUTES * 6e4);
    setInterval(pullSite, SITE_MINUTES * 6e4);
    setInterval(applyToday, 6e4);
    setInterval(syncSquare, 2000);
    startBackups();
    startReservations();
  });
}

// Started only when run (node server.js), not when the tests load it.
if (require.main === module) start();

// For the tests (tests/*.test.js): the rules that turn Square's orders into
// tickets, and the state they read.
module.exports = {
  cfg, toTicket, isOnline, hiddenReason, frontHiddenReason, readyAt, orderDetail, setSkip, loadCatalog,
  sideSlots, swapsFor, specialSideOptions, leaveOffOptions, dayDescription, plan, bumped, platesDone, canceled, handedOff, markedReady,
};
