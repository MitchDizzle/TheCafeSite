// The PC's own files: moved into data\ once (lib/data.js), and the website's
// details that Photo post draws (siteDetails). Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("./board.js");
const { moveIntoData } = require("../lib/data");
const { siteDetails } = require("../lib/photo-post");

test("data folder: the loose files move in, Square's photo paths follow", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitchen-move-"));
  try {
    const data = path.join(dir, "data");
    const photo = path.join(dir, "photos", "2026-10-12-lasagna.jpg");
    fs.mkdirSync(path.dirname(photo));
    fs.writeFileSync(photo, "jpeg");
    fs.writeFileSync(path.join(dir, "state.json"), "{}");
    fs.writeFileSync(path.join(dir, "specials-plan.json"), JSON.stringify({ days: {}, squareImages: { [`${photo}#abc`]: "IMG1", "other#def": "IMG2" } }));
    moveIntoData(dir, data);
    assert.ok(fs.existsSync(path.join(data, "state.json")));
    assert.ok(fs.existsSync(path.join(data, "photos", "2026-10-12-lasagna.jpg")));
    assert.ok(!fs.existsSync(path.join(dir, "state.json")));
    const plan = JSON.parse(fs.readFileSync(path.join(data, "specials-plan.json"), "utf8"));
    assert.deepEqual(plan.squareImages, { [`${path.join(data, "photos", "2026-10-12-lasagna.jpg")}#abc`]: "IMG1", "other#def": "IMG2" });
    // A second start finds nothing to move and changes nothing.
    moveIntoData(dir, data);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, "specials-plan.json"), "utf8")), plan);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("data folder: a file already in the data folder is never overwritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitchen-move-"));
  try {
    const data = path.join(dir, "data");
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, "state.json"), "new");
    fs.writeFileSync(path.join(dir, "state.json"), "old");
    moveIntoData(dir, data);
    assert.equal(fs.readFileSync(path.join(data, "state.json"), "utf8"), "new");
    assert.equal(fs.readFileSync(path.join(dir, "state.json"), "utf8"), "old");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Photo post: phone, web address and hours come from the website's site.json", () => {
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "src", "_data", "site.json"), "utf8"));
  const d = siteDetails();
  assert.equal(d.phone, site.phone);
  assert.equal(d.website, site.social.website);
  assert.equal(d.menu, `${site.social.website}/menu`);
  assert.equal(d.order, `${site.social.website}/order`);
  assert.match(d.hours, new RegExp(String.raw`^${site.opening.hoursDays}, \d+(:\d\d)?(am|pm) – \d+(:\d\d)?(am|pm)$`));
});

test("backup to GitHub: the repo's web address becomes its ssh address", () => {
  const { cfg } = require("../lib/config");
  const { repoUrl } = require("../lib/offsite");
  const before = cfg.backupRepo;
  try {
    for (const s of ["https://github.com/Owner/CafeKitchenData", "https://github.com/Owner/CafeKitchenData.git", "git@github.com:Owner/CafeKitchenData.git"]) {
      cfg.backupRepo = s;
      assert.equal(repoUrl(), "git@github.com:Owner/CafeKitchenData.git");
    }
  } finally {
    cfg.backupRepo = before;
  }
});
