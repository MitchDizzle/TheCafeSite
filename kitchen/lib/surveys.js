// Manage -> Survey: the customer survey's answers, from the paper cards and
// the website's /survey, imported from a spreadsheet (Excel, CSV, or rows
// pasted from one) and summed up for any range of days. "For the website"
// makes the summary the public /feedback page is built from
// (CONTACT-PLAN.md in CafeWork, client 2026-10-27).
//
// The questions are the website's own (src/_data/survey.json, beside this
// folder in the repo), so the columns are matched to the same names and
// labels the card and the page use. No contact details are kept: a phone or
// email column is left out on import, and a name only when the customer
// ticked that their comment may be shared, as a first name and initial.
// Kept in data\surveys.json, which the nightly backup copies but the GitHub
// backup does not.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DIR, DATA, MOCK } = require("./config");
const { localDate } = require("./util");
const { readXlsx } = require("./xlsx");

const FILE = path.join(DATA, MOCK ? "surveys-mock.json" : "surveys.json");
const SURVEY_JSON = path.join(DIR, "..", "src", "_data", "survey.json");

let store = { answers: [], imports: [] };
try {
  store = { answers: [], imports: [], ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch {}
function save() {
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(store));
  fs.renameSync(FILE + ".tmp", FILE);
}

// The questions, read fresh each time so a change on the website (pulled
// with Check for updates) shows without a restart. A free-text "comments"
// column, which a typed-up sheet often has, is kept as its own question.
const OTHER = { name: "comments", label: "Other comments" };
function questions() {
  const q = JSON.parse(fs.readFileSync(SURVEY_JSON, "utf8"));
  return { scale: q.scale, ratings: q.ratings, choices: q.choices, open: [...q.open, OTHER] };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------- reading a sheet

// CSV, or tab-separated (rows pasted from Excel): quoted cells, "" inside
// quotes, line breaks inside quotes, a byte-order mark.
function parseTable(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes("\t") && !first.includes(",") ? "\t" : first.split("\t").length > first.split(",").length ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// What each column holds, from its heading: a question (by its name or its
// label, or a good part of either), the date, where it came from, the
// customer's name, whether they said their comment may be shared, or
// contact details (never kept).
const DATE_HEADS = new Set(["date", "day", "when", "created", "createdat", "submitted", "submittedat", "timestamp", "time", "datesubmitted", "received"]);
const COMMENT_HEADS = new Set(["comment", "comments", "notes", "note", "feedback", "othercomments"]);
function columnFor(header, q) {
  const h = norm(header);
  if (!h) return null;
  if (DATE_HEADS.has(h) || h.startsWith("date")) return { as: "date" };
  if (h === "source" || h === "where" || h === "type") return { as: "source" };
  if (/email|phone|contact|number|reply/.test(h)) return { as: "contact" };
  if (/share|permission|quote|okto/.test(h)) return { as: "share" };
  if (h === "name" || h === "firstname" || h === "yourname" || h === "customer") return { as: "name" };
  for (const [kind, list] of [["rating", q.ratings], ["choice", q.choices], ["open", q.open]]) {
    for (const item of list) {
      const n = norm(item.name), l = norm(item.label);
      if (h === n || h === l || (h.length >= 4 && (l.includes(h) || n.includes(h))) || (l.length >= 4 && h.includes(l))) return { as: kind, q: item };
    }
  }
  if (COMMENT_HEADS.has(h)) return { as: "open", q: OTHER };
  return null;
}

const RATING_WORDS = { excellent: "Great", ok: "Okay", fair: "Okay", average: "Okay", bad: "Poor" };
function ratingOf(value, scale) {
  const v = norm(value);
  return scale.find((s) => norm(s) === v) || RATING_WORDS[v] || null;
}
function choiceOf(value, options) {
  const v = norm(value);
  return options.find((o) => norm(o) === v) || (v.length >= 4 && options.find((o) => norm(o).includes(v))) || "Other";
}
const BLANK = new Set(["", "-", "na", "n/a", ".", "x", "none given"]);
const YES = new Set(["yes", "y", "true", "x", "✓", "✔", "1", "ok", "okay", "checked", "agree", "sure"]);
const sourceOf = (value, fallback) => {
  const v = norm(value);
  if (/card|paper/.test(v)) return "card";
  if (/web|online|site|qr/.test(v)) return "web";
  return fallback;
};
// "Linda Kaye" -> "Linda K."; just a first name stays as it is.
function shortName(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const cap = (w) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  return words.length > 1 ? `${cap(words[0])} ${words[words.length - 1][0].toUpperCase()}.` : cap(words[0]);
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dateOf(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) return ymd(new Date(+m[1], m[2] - 1, +m[3]));
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(v))) return ymd(new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], m[1] - 1, +m[2]));
  if (/^\d{5}(\.\d+)?$/.test(v)) { // an Excel date, as days since 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 864e5);
    return ymd(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : ymd(new Date(t));
}

// A sheet's rows as answers, without saving anything: what Import shows
// before it's pressed. `date` is the day for a row without one, `source`
// where a row came from when the sheet doesn't say.
function readSheet({ text, xlsx, date, source }) {
  const q = questions();
  const rows = (xlsx ? readXlsx(Buffer.from(xlsx, "base64")) : parseTable(text))
    .filter((r) => r.some((c) => String(c).trim()));
  if (rows.length < 2) return { ok: false, message: "Nothing to read: the first row should be the headings, then one row per survey." };
  const used = new Set();
  const columns = rows[0].map((header) => {
    const col = columnFor(header, q);
    const key = col && (col.q ? `${col.as}:${col.q.name}` : col.as);
    if (!col || used.has(key)) return { header, as: null };
    used.add(key);
    return { header, ...col };
  });
  if (!columns.some((c) => c.as === "rating" || c.as === "choice" || c.as === "open")) {
    return { ok: false, message: "None of the headings is a survey question. The first row should name them (The food, The service, ... or food, service, ...)." };
  }
  const answers = [];
  const unreadable = [];
  const seen = new Map();
  let empty = 0, undated = 0;
  rows.slice(1).forEach((row, i) => {
    const a = { date: null, source: source || "card", ratings: {}, choices: {}, open: {}, share: false, name: null };
    let rawName = "";
    columns.forEach((col, c) => {
      const value = String(row[c] == null ? "" : row[c]).trim();
      if (!col.as || !value) return;
      if (col.as === "date") a.date = dateOf(value);
      else if (col.as === "source") a.source = sourceOf(value, a.source);
      else if (col.as === "share") a.share = YES.has(value.toLowerCase());
      else if (col.as === "name") rawName = value;
      else if (col.as === "rating") {
        const r = ratingOf(value, q.scale);
        if (r) a.ratings[col.q.name] = r;
        else unreadable.push({ row: i + 2, column: col.header, value });
      } else if (col.as === "choice") a.choices[col.q.name] = choiceOf(value, col.q.options);
      else if (col.as === "open" && !BLANK.has(value.toLowerCase())) a.open[col.q.name] = value.replace(/\s+/g, " ");
    });
    if (!Object.keys(a.ratings).length && !Object.keys(a.choices).length && !Object.keys(a.open).length) { empty++; return; }
    if (!a.date) { a.date = date || localDate(); undated++; }
    if (a.share) a.name = shortName(rawName);
    // The same answers on the same day: the second one in this sheet is a
    // second card, but importing the sheet again matches them all.
    const body = JSON.stringify([a.date, a.ratings, a.choices, a.open]);
    const nth = (seen.get(body) || 0) + 1;
    seen.set(body, nth);
    a.id = crypto.createHash("sha1").update(`${body}#${nth}`).digest("hex").slice(0, 16);
    answers.push(a);
  });
  const have = new Set(store.answers.map((a) => a.id));
  const fresh = answers.filter((a) => !have.has(a.id));
  return {
    ok: true,
    columns: columns.map((c) => ({ header: c.header, as: c.as, label: c.q ? c.q.label : null })),
    answers: fresh,
    found: answers.length,
    already: answers.length - fresh.length,
    empty, undated, unreadable: unreadable.slice(0, 20), unreadableCount: unreadable.length,
  };
}

function importSheet(input) {
  const r = readSheet(input);
  if (!r.ok || input.preview) return r;
  if (!r.answers.length) return { ...r, added: 0 };
  const batch = crypto.randomBytes(4).toString("hex");
  for (const a of r.answers) a.batch = batch;
  store.answers.push(...r.answers);
  store.imports.push({ batch, at: new Date().toISOString(), file: String(input.file || "").slice(0, 80) || "pasted", count: r.answers.length });
  save();
  return { ...r, added: r.answers.length, answers: undefined };
}

// Take one import back out, every row of it: a sheet read wrongly.
function removeImport(batch) {
  const before = store.answers.length;
  store.answers = store.answers.filter((a) => a.batch !== batch);
  store.imports = store.imports.filter((i) => i.batch !== batch);
  save();
  return before - store.answers.length;
}

// ---------------------------------------------------------------- the numbers

function tally(list, q) {
  const count = (kind, item, values) => {
    const counts = Object.fromEntries(values.map((v) => [v, 0]));
    let answered = 0;
    for (const a of list) {
      const v = a[kind][item.name];
      if (v == null) continue;
      answered++;
      counts[v] = (counts[v] || 0) + 1;
    }
    return { name: item.name, label: item.label, answered, counts: values.concat(Object.keys(counts).filter((k) => !values.includes(k))).map((v) => [v, counts[v]]) };
  };
  return {
    total: list.length,
    cards: list.filter((a) => a.source === "card").length,
    web: list.filter((a) => a.source === "web").length,
    ratings: q.ratings.map((item) => count("ratings", item, q.scale)),
    choices: q.choices.map((item) => count("choices", item, item.options)),
  };
}

const byDateDesc = (a, b) => b.date.localeCompare(a.date);

// Manage -> Survey: [from, to], with every comment.
function surveyReport(from, to) {
  const q = questions();
  const list = store.answers.filter((a) => a.date >= from && a.date <= to);
  const labels = Object.fromEntries(q.open.map((o) => [o.name, o.label]));
  const comments = [];
  for (const a of [...list].sort(byDateDesc)) {
    for (const [name, text] of Object.entries(a.open)) comments.push({ date: a.date, source: a.source, question: labels[name] || name, text, share: a.share, name: a.name });
  }
  const dates = store.answers.map((a) => a.date).sort();
  return { from, to, scale: q.scale, ...tally(list, q), comments, first: dates[0] || null,
    imports: [...store.imports].reverse().slice(0, 12) };
}

// "For the website": every answer, summed up, plus the comments customers
// said may be shared. What src/_data/feedbackStats.json on the website is.
// Never a name beyond a first name and initial, never contact details, and
// only comments with permission: everything else is counts.
function websiteStats() {
  const q = questions();
  const all = [...store.answers].sort(byDateDesc);
  const labels = Object.fromEntries(q.open.map((o) => [o.name, o.label]));
  const months = [...new Set(all.map((a) => a.date.slice(0, 7)))].sort().map((month) => {
    const t = tally(all.filter((a) => a.date.startsWith(month)), q);
    return { month, total: t.total, ratings: t.ratings };
  });
  const quotes = [];
  for (const a of all) {
    if (!a.share) continue;
    for (const [name, text] of Object.entries(a.open)) quotes.push({ date: a.date, name: a.name, question: labels[name] || name, text });
  }
  const { choices, ...t } = tally(all, q); // how they heard of the cafe is ours, not the page's
  return {
    _note: "Made by the kitchen PC: Manage -> Survey -> For the website. Replace this whole file with a new one from there; don't edit it by hand. The themes and 'You said, we did' are in feedback.json, written by hand.",
    updated: localDate(),
    since: all.length ? all[all.length - 1].date : null,
    scale: q.scale,
    ...t,
    months,
    quotes: quotes.slice(0, 40),
  };
}

module.exports = { readSheet, importSheet, removeImport, surveyReport, websiteStats, parseTable, dateOf, shortName };
