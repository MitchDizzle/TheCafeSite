// Reads the first sheet of an Excel file (.xlsx) into rows of text, with no
// packages: an .xlsx is a zip of XML files, and Node's zlib unpacks the zip's
// parts. Enough for a plain table someone typed up (Survey import); formulas
// come through as their last value, formatting and other sheets are ignored.
const zlib = require("zlib");

// The zip's files by name, unpacked: read from the central directory at the
// end, which has every file's real size even when the local headers don't.
function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not an Excel file (.xlsx).");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescape = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");
// The text of every <t> inside a piece of XML, joined (rich text is split
// into runs, each with its own <t>).
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
// "C12" -> 2 (A is 0).
const colOf = (ref) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readXlsx(buf) {
  const files = unzip(buf);
  const shared = files["xl/sharedStrings.xml"]
    ? [...files["xl/sharedStrings.xml"].toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  // The first sheet in the workbook's order, through its relationship id.
  let sheetPath = "xl/worksheets/sheet1.xml";
  try {
    const book = files["xl/workbook.xml"].toString("utf8");
    const rels = files["xl/_rels/workbook.xml.rels"].toString("utf8");
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(book)[1];
    const target = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(rels)
      || new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(rels);
    sheetPath = target[1].startsWith("/") ? target[1].slice(1) : `xl/${target[1]}`;
  } catch {}
  if (!files[sheetPath]) throw new Error("The Excel file has no sheet to read.");
  const rows = [];
  for (const [, row] of files[sheetPath].toString("utf8").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const out = [];
    let next = 0;
    for (const [, attrs, body = ""] of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
      const col = ref ? colOf(ref[1]) : next;
      const type = (/\bt="(\w+)"/.exec(attrs) || [])[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let text = "";
      if (type === "s" && v) text = shared[+v[1]] || "";
      else if (type === "inlineStr") text = textOf(body);
      else if (type === "b" && v) text = v[1] === "1" ? "TRUE" : "FALSE";
      else if (v) text = unescape(v[1]);
      out[col] = text;
      next = col + 1;
    }
    rows.push(Array.from(out, (c) => (c == null ? "" : String(c))));
  }
  return rows;
}

module.exports = { readXlsx };
