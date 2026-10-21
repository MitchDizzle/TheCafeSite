// Every address the board program answers: the two screens, /check, and
// their actions. What another device on the wifi may reach is narrow on
// purpose (NETWORK_PATHS); everything else answers this PC alone.
const fs = require("fs");
const path = require("path");
const { DIR, DEV, cfg } = require("./config");
const { localDate, dayWords } = require("./util");
const { live } = require("./live");
const { catalog, loadCatalog } = require("./catalog");
const { bump, handedOff, canceled, byHand, keepOnFront, autoOff, state, unbump, saveState, setSkip, skipSummary } = require("./state");
const { poll, snapshot, frontSnapshot, lastCleared, lastHandedOff, startDemo, endDemo, resetDay } = require("./orders");
const { recordHistoryNow, historyReport, todayView } = require("./stats");
const { dessertItems, saveDesserts, saveDessertPhoto, newDessert } = require("./desserts");
const { RETRY_MINUTES, pullSite, planView, savePlanDays } = require("./specials/plan");
const { applyToday } = require("./specials/today");
const { photoSetup, savePhotoPost, savedPhotos, savedPhotoFile, deleteSavedPhotos, clearBackedUpPhotos } = require("./photo-post");
const { backupNow } = require("./backup");
const { offsiteStatus } = require("./offsite");
const { checkPage } = require("./check");
const { syncNow, saveReservation, actOn, markSeated, manageView } = require("./reservations");
const { power, checkUpdates, boardCheckedIn } = require("./system");

const BOARD_FILE = path.join(DIR, "board.html");
const FRONT_FILE = path.join(DIR, "front.html");
const TODAY_FILE = path.join(DIR, "today.html");

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// Up to 20 MB: photos arrive as base64 in JSON. A dessert photo is shrunk
// to about 1600px first, Photo post's to 2000px plus the finished post, so
// one to three MB is usual.
const MAX_BODY = 20 * 1024 * 1024;
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY) { data = ""; req.destroy(); }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

// Power menu: close the board window, restart or shut down this PC.
//
// Only the board page itself may ask. The server listens on 127.0.0.1, but
// any web page open in any browser on this PC could still send a request to
// localhost, so the request must carry the X-Kitchen-Board header (a page
// from another site can't add a custom header without a preflight, which
// this server never answers) and, if the browser sent an Origin, it must be
// this board's own.
function fromBoard(req) {
  if (!isLocal(req)) return false;
  if (req.headers["x-kitchen-board"] !== "1") return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${cfg.port}` || origin === `http://127.0.0.1:${cfg.port}`;
}

// A request from this PC itself (the kitchen board), as opposed to another
// device on the wifi (the front page).
function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

// What another device on the wifi (or the owner's phone over Tailscale) may
// reach: the front page, the phone page (/today) and their own actions. With frontKey set, it must also carry ?key=<frontKey>.
const NETWORK_PATHS = new Set(["/front", "/today", "/api/front", "/api/front-today", "/api/handoff", "/api/cancel-unpaid", "/api/front-skip", "/api/front-skip-save", "/api/front-unlock", "/api/front-desserts", "/api/front-desserts-save", "/api/front-dessert-photo", "/api/front-dessert-new", "/api/handoff-undo", "/api/unhandoff", "/api/front-update", "/api/front-reset", "/api/front-plan", "/api/front-plan-save", "/api/front-report", "/api/front-photo", "/api/front-photo-save", "/api/front-saved-photos", "/api/front-saved-photo", "/api/front-saved-photos-delete", "/api/front-saved-photos-clear", "/api/front-backup", "/api/front-reservations", "/api/front-reservation-save", "/api/front-reservation-act", "/api/reservation-seated"]);
// The front page's home-screen icon and app manifest: what a phone fetches to
// put /front on its home screen. Nothing in them is private, and a phone
// fetches the icons without the page's ?key=, so they never need it.
const APP_FILES = {
  "/front.webmanifest": null, // built per request, see below
  "/today.webmanifest": null,
  "/front-icon-180.png": "icon-180.png",
  "/front-icon-192.png": "icon-192.png",
  "/front-icon-512.png": "icon-512.png",
  "/front-wordmark.svg": "wordmark.svg", // drawn into Photo post's pictures
};

// The screens' stylesheets and the front page's Manage jobs (front/*.js).
// Colours and code, nothing private, so like the icons they need no ?key=.
// Never cached: after an update the pages get the new ones straight away.
const STATIC = {
  "/kitchen.css": "kitchen.css",
  "/front/manage.css": "front/manage.css",
  "/front/specials.js": "front/specials.js",
  "/front/photo-post.js": "front/photo-post.js",
  "/front/reports.js": "front/reports.js",
  "/front/desserts.js": "front/desserts.js",
  "/front/leave-off.js": "front/leave-off.js",
  "/front/saved-photos.js": "front/saved-photos.js",
  "/front/reservations.js": "front/reservations.js",
};

// Wrong update PINs from /front: after 5 in 10 minutes, refuse for 10.
let pinFails = [];
let pinLockedUntil = 0;

// null if the PIN is right, else what to tell the person.
function pinRefusal(pin) {
  const now = Date.now();
  if (!cfg.updatePin) return "Not set up: add \"updatePin\" to config.json on the kitchen PC.";
  if (now < pinLockedUntil) return "Too many wrong PINs. Try again in 10 minutes.";
  if (String(pin || "") !== String(cfg.updatePin)) {
    pinFails = pinFails.filter((t) => now - t < 10 * 6e4).concat(now);
    if (pinFails.length >= 5) { pinLockedUntil = now + 10 * 6e4; pinFails = []; }
    console.log(`Front page: wrong PIN (${new Date().toLocaleTimeString()}).`);
    return "Wrong PIN.";
  }
  pinFails = [];
  return null;
}

function networkAllowed(req, url) {
  if (req.method === "GET" && (url.pathname in APP_FILES || url.pathname in STATIC)) return true;
  if (!NETWORK_PATHS.has(url.pathname)) return false;
  return !cfg.frontKey || url.searchParams.get("key") === cfg.frontKey;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (!isLocal(req) && !networkAllowed(req, url)) {
    // The kitchen board's address opened from a laptop: send it to the
    // front page rather than a bare refusal.
    if (req.method === "GET" && url.pathname === "/" && !cfg.frontKey) {
      res.writeHead(302, { Location: "/front" });
      return res.end();
    }
    return send(res, 403, "This page only opens on the kitchen PC. The front page is /front.", "text/plain; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/front") {
    return send(res, 200, fs.readFileSync(FRONT_FILE, "utf8"), "text/html; charset=utf-8");
  }
  // The owner's phone page: the day's numbers on top, then the open orders.
  if (req.method === "GET" && url.pathname === "/today") {
    return send(res, 200, fs.readFileSync(TODAY_FILE, "utf8"), "text/html; charset=utf-8");
  }
  // Added to a phone's home screen, /front (or /today) opens like an app:
  // its own icon, full screen, no address bar. start_url carries the key
  // when the page asking for the manifest had the right one, so the icon
  // keeps working with frontKey set.
  if (req.method === "GET" && (url.pathname === "/front.webmanifest" || url.pathname === "/today.webmanifest")) {
    const key = cfg.frontKey && url.searchParams.get("key") === cfg.frontKey ? `?key=${encodeURIComponent(cfg.frontKey)}` : "";
    const today = url.pathname === "/today.webmanifest";
    return send(res, 200, {
      name: today ? "The Café · Today" : "The Café · Front",
      short_name: today ? "Café Today" : "Café Front",
      start_url: `/${today ? "today" : "front"}${key}`,
      scope: "/",
      display: "standalone",
      background_color: "#FAF7F2",
      theme_color: "#1F4552",
      icons: [
        { src: "/front-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/front-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    }, "application/manifest+json; charset=utf-8");
  }
  if (req.method === "GET" && STATIC[url.pathname]) {
    const file = STATIC[url.pathname];
    return send(res, 200, fs.readFileSync(path.join(DIR, file), "utf8"),
      file.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8");
  }
  if (req.method === "GET" && APP_FILES[url.pathname]) {
    res.writeHead(200, { "Content-Type": url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/png", "Cache-Control": "max-age=86400" });
    return res.end(fs.readFileSync(path.join(DIR, APP_FILES[url.pathname])));
  }
  if (req.method === "GET" && url.pathname === "/api/front") {
    return send(res, 200, frontSnapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/handoff") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    handedOff[id] = new Date().toISOString();
    byHand[id] = handedOff[id];
    saveState();
    return send(res, 200, frontSnapshot());
  }
  // An unpaid order that was never going to be paid (card declined, sale
  // abandoned): off the kitchen board and the front page at once. It goes
  // on the front's Undo list like a hand-off, so a wrong tap comes back.
  if (req.method === "POST" && url.pathname === "/api/cancel-unpaid") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    const at = new Date().toISOString();
    canceled[id] = at;
    handedOff[id] = at;
    saveState();
    console.log(`Front page: unpaid order ...${id.slice(-4)} canceled (${new Date().toLocaleTimeString()}).`);
    return send(res, 200, frontSnapshot());
  }
  // Desserts, behind the PIN: read (photos, kinds and counts, options), save
  // kinds and options, replace a photo, and make a new dessert.
  if (req.method === "POST" && /^\/api\/front-dessert(s|s-save|-photo|-new)$/.test(url.pathname)) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-desserts") return send(res, 200, { ok: true, items: await dessertItems() });
      if (url.pathname === "/api/front-dessert-photo") {
        await loadCatalog();
        await saveDessertPhoto(body.itemId, body.photo);
        return send(res, 200, { ok: true, message: "Photo saved. Online ordering shows it within a few minutes." });
      }
      if (url.pathname === "/api/front-dessert-new") {
        const name = await newDessert(body);
        return send(res, 200, { ok: true, message: `${name} is in Square, under Desserts. Online ordering shows it within a minute or so.` });
      }
      await loadCatalog();
      const saved = await saveDesserts({ kinds: body.kinds, lists: body.lists });
      return send(res, 200, { ok: true, message: saved.length
        ? `Saved in Square: ${saved.join(", ")}. Online ordering updates within a minute or so.`
        : "Nothing changed." });
    } catch (err) {
      console.error(`Desserts: ${err.message}`);
      if (err.plain) return send(res, 200, { ok: false, message: err.message });
      const conflict = /409|VERSION_MISMATCH|version/i.test(err.message);
      // A kind marked sold out on the iPad: Square won't let another program
      // touch that item until the iPad takes the mark off.
      const soldOut = /may not be changed in place/i.test(err.message);
      return send(res, 200, { ok: false, message: conflict
        ? "Someone changed that in Square a moment ago. Open Desserts again."
        : soldOut
          ? "Square won't take that change to this dessert from here. If it's marked sold out on the iPad, take the mark off there and save again."
          : `Square didn't take it: ${err.message}` });
    }
  }
  // Reservations, behind the PIN: the book (Google's new requests fetched
  // first), a new or changed reservation, and Accept / Decline / Cancel /
  // Seated and the rest. A change that emails the customer waits for Google
  // so the front can say whether it went.
  if (req.method === "POST" && /^\/api\/front-reservation(s|-save|-act)$/.test(url.pathname)) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      // Google gets a few seconds to hand over new requests; a slow one
      // carries on behind the screen (it's checked every 2 minutes anyway).
      if (url.pathname === "/api/front-reservations") {
        const done = await Promise.race([syncNow().then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]);
        return send(res, 200, { ok: true, ...manageView(), stillChecking: !done });
      }
      const done = url.pathname === "/api/front-reservation-save"
        ? await saveReservation(body.reservation || {}, !!body.email)
        : { message: await actOn(String(body.id || ""), String(body.act || ""), !!body.email) };
      return send(res, 200, { ok: true, ...done, ...manageView() });
    } catch (err) {
      console.error(`Reservations: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Didn't work: ${err.message}` });
    }
  }
  // Seated, from the band at the top of the front page: no PIN, like
  // Handed off. Anything else about a reservation is in Manage.
  if (req.method === "POST" && url.pathname === "/api/reservation-seated") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    markSeated(id);
    return send(res, 200, frontSnapshot());
  }
  // Manage's first screen: is the PIN right? (Every action checks it again;
  // this only lets the front say "Wrong PIN" before showing the menu.)
  if (req.method === "POST" && url.pathname === "/api/front-unlock") {
    const refused = pinRefusal((await readBody(req)).pin);
    return send(res, 200, refused ? { ok: false, message: refused } : { ok: true });
  }
  // Leave off kitchen tickets, behind the PIN: read it (with a fresh read of
  // the Square catalog to choose from) and save it. A save applies at once,
  // to the tickets already up too.
  if (req.method === "POST" && (url.pathname === "/api/front-skip" || url.pathname === "/api/front-skip-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    if (url.pathname === "/api/front-skip-save") {
      setSkip(body.skip || {});
      state.skipEdited = true;
      saveState();
      console.log(`Skip list changed from the front page (${new Date().toLocaleTimeString()}): ${skipSummary()}.`);
      await poll();
      return send(res, 200, { ok: true, message: "Saved. The kitchen board is updated." });
    }
    await loadCatalog();
    return send(res, 200, { ok: true, skip: state.skip, categories: catalog.categories, catalogError: catalog.error });
  }
  // Specials, behind the PIN: read the plan (with Square's sizes and prices
  // for the boxes, and today's names as Square has them) and save the days
  // the front changed. Saving today puts it into Square straight away; other
  // days go in on their morning. Through saveDaily, this is the board's only
  // write to Square besides Desserts.
  if (req.method === "POST" && (url.pathname === "/api/front-plan" || url.pathname === "/api/front-plan-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-plan") {
        await pullSite(); // so the website's latest is what's shown
        return send(res, 200, { ok: true, ...(await planView()) });
      }
      const saved = savePlanDays(body.days, body.notes);
      const dates = [...new Set([...saved.days, ...saved.notes])].sort();
      if (!dates.length) return send(res, 200, { ok: true, message: "Nothing changed." });
      let message = `Saved: ${dates.map(dayWords).join(", ")}.`;
      if (saved.days.includes(localDate())) {
        const r = await applyToday();
        message += r && r.error ? ` Today's didn't go into Square yet (${r.error}); the board tries again in ${RETRY_MINUTES} minutes.`
          : " Today's is in Square now.";
      }
      if (saved.days.some((d) => d > localDate())) message += " The rest go into Square by themselves on the morning of each day.";
      return send(res, 200, { ok: true, message });
    } catch (err) {
      console.error(`Specials: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Didn't work: ${err.message}` });
    }
  }
  // Photo post, behind the PIN: what the screen starts from, and keeping
  // the photo and the finished post on this PC.
  if (req.method === "POST" && (url.pathname === "/api/front-photo" || url.pathname === "/api/front-photo-save")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-photo") return send(res, 200, { ok: true, ...(await photoSetup()) });
      const name = savePhotoPost(body);
      return send(res, 200, { ok: true, message: `Kept on the kitchen PC for the website (data\\photos\\${name}).` });
    } catch (err) {
      console.error(`Photo post: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Couldn't keep it: ${err.message}` });
    }
  }
  // Saved photos, behind the PIN: the list, one picture (as a JPEG, for the
  // list's thumbnails), deleting the ticked ones, and moving them all to the
  // GitHub backup (a backup first; only what it pushed leaves this PC).
  if (req.method === "POST" && /^\/api\/front-saved-photo(s|s-delete|s-clear)?$/.test(url.pathname)) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    try {
      if (url.pathname === "/api/front-saved-photos") return send(res, 200, { ok: true, photos: savedPhotos(), backup: !!cfg.backupRepo });
      if (url.pathname === "/api/front-saved-photos-clear") {
        console.log(`Move to GitHub from the front page (${new Date().toLocaleTimeString()}).`);
        const b = await backupNow();
        if (!cfg.backupRepo || DEV || offsiteStatus.error) {
          return send(res, 200, { ok: false, message: `Nothing was moved: the backup didn't reach GitHub. ${b.message}` });
        }
        const n = clearBackedUpPhotos();
        return send(res, 200, { ok: true, message: n
          ? `Moved ${n} photo${n === 1 ? "" : "s"} to GitHub. They're off the kitchen PC now.`
          : "Nothing to move: no photo here is in the GitHub backup yet." });
      }
      if (url.pathname === "/api/front-saved-photo") {
        const jpeg = savedPhotoFile(String(body.name || ""));
        return jpeg ? res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).end(jpeg) : send(res, 404, { ok: false });
      }
      const n = deleteSavedPhotos(body.names);
      return send(res, 200, { ok: true, message: `Deleted ${n} photo${n === 1 ? "" : "s"} from the kitchen PC.` });
    } catch (err) {
      console.error(`Saved photos: ${err.message}`);
      return send(res, 200, { ok: false, message: err.plain ? err.message : `Didn't work: ${err.message}` });
    }
  }
  // Reports, behind the PIN: the saved daily history for a date range.
  // Today is saved first, so a report that ends today is up to the minute.
  if (req.method === "POST" && url.pathname === "/api/front-report") {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(body.from || "") || !day.test(body.to || "") || body.from > body.to) {
      return send(res, 200, { ok: false, message: "Pick a start date on or before the end date." });
    }
    recordHistoryNow();
    return send(res, 200, { ok: true, ...historyReport(body.from, body.to, !!body.orders) });
  }
  // The phone page's numbers, behind the PIN like Reports: sales are the
  // owner's business, not the counter's.
  if (req.method === "POST" && url.pathname === "/api/front-today") {
    const refused = pinRefusal((await readBody(req)).pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    return send(res, 200, { ok: true, ...todayView() });
  }
  if (req.method === "POST" && url.pathname === "/api/unhandoff") {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    delete handedOff[id];
    delete canceled[id];
    delete byHand[id];
    // Back on the front page to stay: it won't clear itself again.
    keepOnFront[id] = new Date().toISOString();
    autoOff.delete(id);
    saveState();
    return send(res, 200, frontSnapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/reset-day") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { clearBoard } = await readBody(req);
    resetDay(!!clearBoard, "the board");
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/handoff-undo") {
    const last = lastHandedOff();
    if (last) {
      delete handedOff[last.id];
      delete canceled[last.id];
      delete byHand[last.id];
      keepOnFront[last.id] = new Date().toISOString();
      autoOff.delete(last.id);
      saveState();
    }
    return send(res, 200, frontSnapshot());
  }

  // Check for updates and Reset for the day from the front page, both
  // behind the PIN in config.json. Same actions as the board's own.
  // Back up now, behind the PIN: the same backup as at start and at 2pm,
  // waited for so the phone can say how it went. git runs as its own
  // process, so orders keep coming in meanwhile.
  if (req.method === "POST" && url.pathname === "/api/front-backup") {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    console.log(`Back up now from the front page (${new Date().toLocaleTimeString()}).`);
    return send(res, 200, await backupNow());
  }
  if (req.method === "POST" && (url.pathname === "/api/front-update" || url.pathname === "/api/front-reset")) {
    const body = await readBody(req);
    const refused = pinRefusal(body.pin);
    if (refused) return send(res, 200, { ok: false, message: refused });
    if (url.pathname === "/api/front-update") {
      console.log(`Update from the front page (${new Date().toLocaleTimeString()}).`);
      return send(res, 200, await checkUpdates());
    }
    resetDay(!!body.clearBoard, "the front page");
    return send(res, 200, { ok: true, message: body.clearBoard
      ? "Reset: the Undo lists and today's stats start fresh, and every order on the board was cleared."
      : "Reset: the Undo lists and today's stats start fresh." });
  }
  if (req.method === "POST" && url.pathname === "/api/demo") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { on } = await readBody(req);
    if (on) startDemo();
    else if (live.demo) endDemo();
    await poll();
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/update") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    return send(res, 200, await checkUpdates());
  }
  if (req.method === "POST" && url.pathname === "/api/power") {
    if (!fromBoard(req)) return send(res, 403, { ok: false, message: "Not from the board." });
    const { action } = await readBody(req);
    return send(res, 200, power(action));
  }

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, fs.readFileSync(BOARD_FILE, "utf8"), "text/html; charset=utf-8");
  }
  // One order exactly as Square sent it, for checking how the POS recorded
  // something (a split to-go order, say). This PC only, like /check.
  if (req.method === "GET" && url.pathname === "/check/raw") {
    const o = live.rawOrders.get(url.searchParams.get("id") || "");
    return o ? send(res, 200, JSON.stringify(o, null, 2)) : send(res, 404, { error: "not in the last check; refresh /check" });
  }
  if (req.method === "GET" && url.pathname === "/check") {
    return send(res, 200, checkPage(), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/api/tickets") {
    boardCheckedIn();
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await poll();
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && url.pathname === "/api/undo") {
    const last = lastCleared();
    if (last) {
      unbump(last.id);
      saveState();
    }
    return send(res, 200, snapshot());
  }
  if (req.method === "POST" && (url.pathname === "/api/bump" || url.pathname === "/api/unbump")) {
    const { id } = await readBody(req);
    if (typeof id !== "string" || !id) return send(res, 400, { error: "id required" });
    if (url.pathname === "/api/bump") {
      const t = live.all.find((x) => x.id === id);
      bump(id, !!t && t.items.some((it) => it.toGo));
    }
    else unbump(id);
    saveState();
    return send(res, 200, snapshot());
  }
  send(res, 404, { error: "not found" });
}

module.exports = { handle };
