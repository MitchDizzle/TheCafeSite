// Gallery thumbnails: a copy of every photo in src/assets/photos/ and
// src/assets/gallery/, at most 1000px on its longest side, in a thumbs/
// folder beside it. The /gallery grid shows these (the `thumb` filter in
// .eleventy.js) and a tap opens the full photo, so a phone loads a fraction
// of the bytes for a grid of tiles a few hundred pixels wide.
//
// Run it after adding or replacing a photo:  npm run thumbs
// It needs ImageMagick's `magick` on the PATH. Only missing or out-of-date
// thumbnails are made. Forgetting it is not a broken page: the filter falls
// back to the full photo when a thumbnail is missing.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIRS = ["src/assets/photos", "src/assets/gallery"];
const SIZE = 1000;
const IMAGE = /\.(jpe?g|webp|png)$/i;

let made = 0;
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  const out = path.join(src, "thumbs");
  fs.mkdirSync(out, { recursive: true });

  for (const name of fs.readdirSync(src)) {
    if (!IMAGE.test(name)) continue;
    const from = path.join(src, name);
    const to = path.join(out, name);
    if (fs.existsSync(to) && fs.statSync(to).mtimeMs >= fs.statSync(from).mtimeMs) continue;

    // -strip: no camera or GPS data in the copy, whatever the source held.
    const r = spawnSync("magick", [from, "-auto-orient", "-resize", `${SIZE}x${SIZE}>`, "-strip", "-quality", "78", to], {
      stdio: "inherit",
    });
    if (r.error || r.status !== 0) {
      console.error(`magick failed on ${dir}/${name}${r.error ? `: ${r.error.message}` : ""}`);
      process.exit(1);
    }
    made++;
    console.log(`  thumb  ${dir}/thumbs/${name}`);
  }
}
console.log(made ? `${made} thumbnail(s) made.` : "Thumbnails are up to date.");
