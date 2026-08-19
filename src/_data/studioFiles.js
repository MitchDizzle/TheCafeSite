// Auto-discovery for the /studio/ proof board.
//
// Anything dropped into src/studio/files/ shows up on the board on the next
// build — no template to edit, no list to maintain. That is the whole point:
// the board has to be cheaper to add to than it is to skip.
//
//   src/studio/files/flyers/fall-specials.pdf  →  category "Flyers"
//   src/studio/files/logo-mark.png             →  category "Files"
//
// A subfolder becomes the category. An optional src/studio/_meta.json can
// override the title, note, or category of any entry; see the README.

const fs = require("fs");
const path = require("path");

const DROP_DIR = path.join(__dirname, "..", "studio", "files");

// How each extension gets previewed on the board. Anything not listed is
// skipped rather than rendered as a broken frame.
const KIND_BY_EXT = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".svg": "image",
  ".avif": "image",
  ".pdf": "pdf",
  ".html": "embed",
  ".htm": "embed",
};

// Words that stay lowercase mid-title, and initialisms that stay upper.
const LOWER = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const UPPER = new Set(["qr", "pdf", "png", "svg", "fb", "ig", "li", "kc", "ks", "usa"]);

function prettify(basename) {
  return basename
    // Drop a leading sort prefix: "02-fall-flyer" → "fall-flyer".
    .replace(/^\d{1,3}[-_. ]+/, "")
    .replace(/[-_.]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (UPPER.has(lower)) return lower.toUpperCase();
      if (i > 0 && LOWER.has(lower)) return lower;
      // Leave words that already carry internal capitals alone (LVCafeToGo).
      if (/[a-z][A-Z]/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readMeta() {
  // Deliberately one level ABOVE the drop folder: files/ is passthrough-copied
  // into _site wholesale, and these notes are internal commentary that should
  // not ship. src/studio/ itself is not copied.
  const file = path.join(__dirname, "..", "studio", "_meta.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    // A typo in the overrides must not take the whole board down.
    console.warn(`[studioFiles] ignoring malformed _meta.json: ${err.message}`);
    return {};
  }
}

function walk(dir, relBase, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Leading dot or underscore marks a file as plumbing, not content.
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const abs = path.join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(abs, rel, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel });
    }
  }
  return out;
}

module.exports = () => {
  if (!fs.existsSync(DROP_DIR)) return [];

  const meta = readMeta();

  return walk(DROP_DIR, "", [])
    .map(({ abs, rel }) => {
      const ext = path.extname(rel).toLowerCase();
      const kind = KIND_BY_EXT[ext];
      if (!kind) return null;

      const override = meta[rel] || {};
      const segments = rel.split("/");
      const basename = path.basename(rel, ext);
      const stat = fs.statSync(abs);

      return {
        title: override.title || prettify(basename),
        // A subfolder names the category; loose files land in "Files".
        category: override.category || (segments.length > 1 ? prettify(segments[0]) : "Files"),
        note: override.note || "",
        // Each path segment encoded separately so the slashes survive.
        url: "/studio/files/" + rel.split("/").map(encodeURIComponent).join("/"),
        kind,
        ext: ext.replace(".", "").toUpperCase(),
        size: formatBytes(stat.size),
        // ISO so the template can format it; epoch so it can sort by it.
        added: stat.mtime.toISOString().slice(0, 10),
        addedAt: stat.mtimeMs,
        order: typeof override.order === "number" ? override.order : 500,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || b.addedAt - a.addedAt);
};
