// Each screen's version: a hash of its page and the files it loads from this
// program (kitchen.css, front/*.js). Sent with the screen's data, so an open
// screen sees when an update changed it and reloads itself once nobody is
// using it (client 2026-10-29: an update shouldn't close the board window).
// Worked out once, at start: the files only change with an update, and an
// update restarts this program.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DIR } = require("./config");

function versionOf(page) {
  const hash = crypto.createHash("sha1");
  try {
    const html = fs.readFileSync(path.join(DIR, page), "utf8");
    hash.update(html);
    // Its own stylesheets and scripts: href="/kitchen.css", src="/front/x.js".
    for (const [, url] of html.matchAll(/(?:href|src)="\/([\w./-]+\.(?:css|js))"/g)) {
      try { hash.update(fs.readFileSync(path.join(DIR, url))); } catch {}
    }
  } catch {}
  return hash.digest("hex").slice(0, 12);
}

const pageVersions = { board: versionOf("board.html"), front: versionOf("front.html") };

module.exports = { pageVersions };
