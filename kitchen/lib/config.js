// config.json and the switches the board is started with. Everything else
// reads its settings from `cfg`.
const fs = require("fs");
const path = require("path");

// The kitchen folder, and data\ in it: this PC's own files (lib/data.js).
const { DIR, DATA } = require("./data");
// KITCHEN_CONFIG moves config.json elsewhere. Only the tests use it, so a
// test run never reads the real config.
const CONFIG_FILE = process.env.KITCHEN_CONFIG || path.join(DIR, "config.json");
const MOCK = process.env.KITCHEN_MOCK === "1";
// KITCHEN_MUTE=1 silences the board for testing on another computer. On the
// kitchen PC, leave sound on: the chime is how a new order gets noticed.
const MUTE = process.env.KITCHEN_MUTE === "1";
// KITCHEN_DEV=1 marks a development copy (start-dev.bat sets it): it never
// updates itself from git, never powers the computer off, and never runs
// the watchdog that reopens the board window. Only the kitchen PC runs
// without it.
const DEV = process.env.KITCHEN_DEV === "1";

const DEFAULTS = {
  accessToken: "",
  environment: "production", // or "sandbox"
  locationIds: [], // empty = every active location on the account
  port: 8090,
  pollSeconds: 5,
  // Outside the kitchen's hours (this PC's clock; from an hour before
  // opening to closing, on openDays) Square is checked every
  // quietPollSeconds instead, so a PC left on overnight and at weekends
  // isn't asking every 5 seconds (client 2026-10-27). An online order for
  // tomorrow still shows on the front page within that time, and Check now
  // on the board always checks at once.
  kitchenHours: [5, 14],
  quietPollSeconds: 300,
  sound: true, // new-order chime and lost-connection alarm
  // Pickup orders (and phone orders with a time) go on the kitchen board
  // this long before they're due: 15 covers big and small orders (client
  // 2026-10-21; 60 until then, which started the kitchen clock too early).
  showAheadMinutes: 15,
  // A bigger order goes on sooner: its size's usual kitchen time from the
  // history, plus this (lib/lead.js, client 2026-10-27).
  leadBufferMinutes: 5,
  // Before that they wait in the WAIT UNTIL row at the bottom of the board,
  // from this long before they're due, and the front page has them.
  waitRowMinutes: 60,
  // DoorDash orders stay off the kitchen board until a Dasher is assigned or
  // this many minutes after they came in, whichever is first (client
  // 2026-10-21: a Dasher can take up to an hour). 0 shows them at once.
  dasherWaitMinutes: 15,
  openLookbackDays: 14, // how far back to look for pre-ordered pickups
  skipItems: [], // the skip list to start from; after that it's edited live on /front (Manage)
  frontOnNetwork: true, // serve /front to other devices on the wifi; false = this PC only
  frontKey: "", // if set, other devices must open /front?key=<this>
  updatePin: "", // if set, /front can run Check for updates with this PIN
  // Items whose price (and, for a one-size item, what it is today) the front
  // can set each morning: Manage -> Specials. Names as in Square.
  dailyItems: ["Lunch Special", "Soup of the Day"],
  // Items whose photo and options (flavors) the front can change: Manage ->
  // Desserts. Names as in Square.
  dessertItems: ["Cheesecake", "Dessert Bar"],
  // ...and every item in this Square category, which is also where a new
  // dessert made there goes. "" for the items above only.
  dessertCategory: "Desserts",
  // The item whose sides are set each morning, and its side lists, one per
  // side the plate comes with: each pre-picks the day's side (or Chef's
  // Choice) and lists the sides it can be swapped for. Names as in Square;
  // a list that isn't there yet is made the first time it's needed.
  sideItem: "Lunch Special",
  sideLists: ["Side 1", "Side 2", "Side 3"],
  // The side sold on its own, and its list: each morning it offers the sides
  // the day's plate comes with (pick one; picked already when there's one).
  // "" leaves it alone.
  specialSideItem: "Special Side",
  specialSideList: "Today's Side",
  // The list on sideItem for what can be left off that day's plate ("No
  // Bacon" on a Chicken Bacon Avocado Wrap day): each morning it holds the
  // day's `leaveOff` from the website, pick any, $0, and is off on a day
  // without one. "" leaves it alone.
  leaveOffList: "Leave Off",
  // The daily items' descriptions, which online ordering and DoorDash show
  // under the name: each morning the board writes the day's plate or soup in
  // front of these words ("Lasagna with ... Served from 11am."), and puts
  // them back alone on a day with nothing planned. {} leaves them alone.
  descriptions: { "Lunch Special": "Served from 11am.", "Soup of the Day": "Starting at 11am." },
  // Each morning, the daily items' picture in Square (online ordering and
  // DoorDash) becomes a photo of the day's dish, found by its name among the
  // photos (see "Photos in Square" in the README). false leaves them alone.
  dailyPhotos: true,
  // A photo Photo post saved for any other item in Square becomes that item's
  // picture (the newest one), so the online menu fills up as dishes are
  // photographed. false leaves them alone.
  itemPhotos: true,
  // The picture on a day the dish has no photo yet (or nothing is planned),
  // per item, relative to this folder. The studio's square-placeholder pieces.
  // An item left out shows nothing of ours on those days. Lunch Special's is
  // left out (client 2026-10-23): Square has one picture per item for every
  // channel, so it went to DoorDash too, and a "Today's Lunch Special" card
  // isn't wanted there. Its file stays in placeholders/ to put back here.
  photoPlaceholders: { "Soup of the Day": "placeholders/soup-of-the-day.png" },
  // Tell Square what the kitchen and the front did, for online and delivery
  // orders (counter sales are finished in Square when they're paid): Done
  // on the board marks the order Ready in Square readyDelaySeconds later
  // (Undo before then and Square never hears of it), which texts a Square
  // Online customer and tells DoorDash; Handed off on the front page marks
  // it picked up (Completed). false = the board only reads from Square.
  squareStatus: true,
  readyDelaySeconds: 10,
  // The week's specials as the website publishes them (built from the site's
  // src/_data/specials.json). Read every half hour into Manage -> Plan the
  // week; "" turns that off and the plan is only what the front types in.
  specialsUrl: "https://lvcafetogo.com/specials.json",
  // Days the cafe is open (0 = Sunday ... 6 = Saturday): the days Plan the
  // week offers.
  openDays: [1, 2, 3, 4, 5],
  // A ready order nobody pressed Handed off for leaves the front page by
  // itself after this many minutes (it goes on Undo like any hand-off).
  // 0 = never. Not for unpaid orders, or online orders not yet marked ready
  // in Square: those still need someone.
  autoHandoffMinutes: 10,
  // A second place for the nightly backup of data\ (lib/backup.js), off
  // this PC's drive: a USB stick ("E:\\Kitchen backup" in config.json), a
  // OneDrive folder or a share on another PC. "" = only the copies in
  // data\backups\.
  backupDir: "",
  // The private GitHub repo the daily backup is pushed to
  // (lib/offsite.js), as "git@github.com:<owner>/<repo>.git" or its web
  // address. "" = not pushed anywhere.
  backupRepo: "",
  // Reservations (lib/reservations.js): the key setup() in
  // google-script/Code.gs prints, which lets this PC read the website's
  // table requests and save the book to the cafe's Google Sheet. "" = the
  // book stays on this PC and nothing is emailed. The script's address comes
  // from the website (reservations.formUrl in src/_data/site.json);
  // reservationsUrl overrides it.
  reservationsKey: "",
  reservationsUrl: "",
  // A table booked for today shows on the board and at the top of the front
  // page from this many minutes before its time.
  reservationAheadMinutes: 90,
};

// Settings that are the cafe's own and have no meaningful default: never
// flagged as "differs from the default".
const OWN = new Set(["accessToken", "locationIds", "skipItems", "frontKey", "updatePin", "dailyItems", "dessertItems", "openDays", "autoHandoffMinutes", "backupDir", "backupRepo", "reservationsKey", "reservationsUrl"]);

// What's worth knowing about config.json, in plain words. Written to the
// program window at startup and shown on /check.
//
// The point: a line in config.json pins that setting forever, so when a
// default improves in an update (pollSeconds went 10 -> 5), a PC whose config
// still says 10 never gets it. Saying so is how an update reaches it.
function reviewConfig(file) {
  const notes = [];
  for (const [key, value] of Object.entries(file)) {
    if (key.startsWith("_")) continue; // notes, not settings
    if (!(key in DEFAULTS)) {
      notes.push(`"${key}" is not a setting the board knows; check the spelling. It is being ignored.`);
    } else if (!OWN.has(key) && JSON.stringify(value) !== JSON.stringify(DEFAULTS[key])) {
      notes.push(
        `"${key}" is set to ${JSON.stringify(value)} in config.json; the current default is ` +
          `${JSON.stringify(DEFAULTS[key])}. Delete that line to use the default, or keep it if it's on purpose.`
      );
    }
  }
  return notes;
}

function loadConfig() {
  let file = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      file = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (err) {
      console.error(
        `config.json has a typo and can't be read (${err.message}).
` +
          "Usual causes: a missing comma between lines, a comma after the last line, or a missing quote."
      );
      process.exit(1);
    }
  } else if (MOCK) {
    // Test mode with no config: borrow the example's settings (skip list etc.).
    file = JSON.parse(fs.readFileSync(path.join(DIR, "config.example.json"), "utf8"));
  } else {
    console.error(
      "No config.json. Copy config.example.json to config.json and add the Square access token.\n" +
        "To try the board without Square: set KITCHEN_MOCK=1"
    );
    process.exit(1);
  }
  const known = Object.fromEntries(Object.entries(file).filter(([k]) => k in DEFAULTS));
  const cfg = { ...DEFAULTS, ...known };
  cfg.notes = fs.existsSync(CONFIG_FILE) ? reviewConfig(file) : [];
  if (!MOCK && !cfg.accessToken) {
    console.error("config.json has no accessToken.");
    process.exit(1);
  }
  return cfg;
}

const cfg = loadConfig();

module.exports = { DIR, DATA, MOCK, MUTE, DEV, DEFAULTS, cfg };
