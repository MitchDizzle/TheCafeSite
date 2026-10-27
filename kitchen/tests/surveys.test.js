// Manage -> Survey: a typed-up sheet of survey answers read into the kitchen
// PC, summed up, and the website's /feedback summary (lib/surveys.js,
// client 2026-10-27). Run: node --test kitchen/tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("zlib");
require("./board.js");
const surveys = require("../lib/surveys");

const CSV = [
  "Date,The food,The service,How long it took,Value for the price,Cleanliness & seating,How did you hear about us?,What should we add to the menu?,Anything we could do better?,Name,Phone or email,OK to share",
  "10/14/2026,Great,Great,Good,Great,Good,Facebook,More soups,,Linda Kaye,913-555-0100,yes",
  '10/15/2026,Excellent,good,Okay,Great,Great,friend,"Gluten free bread, please",Faster at noon,Bob Smith,bob@example.com,',
  "10/15/2026,Great,Great,Great,Great,Great,,,,,,",
  "10/15/2026,Great,Great,Great,Great,Great,,,,,,",
  "10/16/2026,Grat,Good,,,,,,,,,",
  "10/17/2026,,,,,,,,,,,",
].join("\r\n");

test("a CSV with the card's questions as headings: what each column is, contact details left out", () => {
  const r = surveys.readSheet({ text: CSV, source: "card", date: "2026-10-20" });
  assert.ok(r.ok);
  const as = Object.fromEntries(r.columns.map((c) => [c.header, c.label || c.as]));
  assert.equal(as["The food"], "The food");
  assert.equal(as["How did you hear about us?"], "How did you hear about us?");
  assert.equal(as["Phone or email"], "contact");
  assert.equal(as["OK to share"], "share");
  assert.equal(r.found, 5);
  assert.equal(r.empty, 1, "a row with a date and nothing else");
  assert.equal(r.unreadableCount, 1, "“Grat” isn't a rating");
  const [linda, bob, same1, same2] = r.answers;
  assert.equal(linda.date, "2026-10-14");
  assert.equal(linda.name, "Linda K.", "OK to share: first name and initial");
  assert.equal(bob.name, null, "not OK to share: no name kept");
  assert.equal(bob.ratings.food, "Great");
  assert.equal(bob.ratings.service, "Good");
  assert.equal(bob.choices.heard, "Friend or family");
  assert.equal(bob.open.add_to_menu, "Gluten free bread, please");
  assert.notEqual(same1.id, same2.id, "two cards the same on one day are two cards");
  assert.ok(!JSON.stringify(r.answers).includes("555") && !JSON.stringify(r.answers).includes("example.com"));
});

test("import once; the same sheet again adds nothing; Take out removes it", () => {
  const first = surveys.importSheet({ text: CSV, source: "card", file: "cards.csv" });
  assert.equal(first.added, 5);
  const again = surveys.importSheet({ text: CSV, source: "card", file: "cards.csv" });
  assert.equal(again.added, 0);
  assert.equal(again.already, 5);
  const rep = surveys.surveyReport("2026-10-01", "2026-10-31");
  assert.equal(rep.total, 5);
  assert.equal(rep.cards, 5);
  const food = rep.ratings.find((q) => q.name === "food");
  assert.deepEqual(Object.fromEntries(food.counts), { Great: 4, Good: 0, Okay: 0, Poor: 0 });
  assert.equal(food.answered, 4);
  assert.equal(rep.comments.length, 3);

  const web = surveys.websiteStats();
  assert.equal(web.total, 5);
  assert.equal(web.quotes.length, 1, "only Linda said her comment may be shared");
  assert.deepEqual(web.quotes[0], { date: "2026-10-14", name: "Linda K.", question: "What should we add to the menu?", text: "More soups" });
  assert.equal(web.months[0].month, "2026-10");
  assert.equal(web.choices, undefined, "how they heard of us stays off the website");
  assert.ok(!JSON.stringify(web).includes("Faster at noon"), "a comment without permission is never in it");

  assert.equal(surveys.removeImport(rep.imports[0].batch), 5);
  assert.equal(surveys.surveyReport("2026-10-01", "2026-10-31").total, 0);
});

test("rows pasted from Excel (tabs), short headings, no date column", () => {
  const r = surveys.readSheet({ text: "food\tservice\tcomments\nGreat\tPoor\tCold fries\nGood\t\t", source: "web", date: "2026-10-21" });
  assert.equal(r.found, 2);
  assert.equal(r.undated, 2);
  assert.equal(r.answers[0].date, "2026-10-21");
  assert.equal(r.answers[0].source, "web");
  assert.equal(r.answers[0].open.comments, "Cold fries");
});

test("dates as typed and as Excel keeps them", () => {
  assert.equal(surveys.dateOf("10/5/26"), "2026-10-05");
  assert.equal(surveys.dateOf("2026-10-05T14:03:00Z").slice(0, 7), "2026-10");
  assert.equal(surveys.dateOf("46300"), "2026-10-05"); // Excel's day number
  assert.equal(surveys.dateOf("not a date"), null);
});

// A small real .xlsx, put together here: shared strings, a number cell, an
// empty cell skipped by its reference, deflated like Excel's own.
function makeXlsx(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = zlib.deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(8, 10);
    head.writeUInt32LE(data.length, 20); head.writeUInt32LE(text.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, n, data);
    central.push(head, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

test("an Excel file", () => {
  const xlsx = makeXlsx({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Cards" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Date</t></si><si><t>Food</t></si><si><t>Comments</t></si><si><t>Great</t></si><si><r><t>Love the </t></r><r><t>Reuben &amp; soup</t></r></si></sst>",
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2"><v>46309</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c></row>' +
      '<row r="3"><c r="A3"><v>46310</v></c><c r="C3" t="inlineStr"><is><t>Quick</t></is></c></row></sheetData></worksheet>',
  });
  const r = surveys.readSheet({ xlsx: xlsx.toString("base64"), source: "card" });
  assert.ok(r.ok, r.message);
  assert.equal(r.found, 2);
  assert.equal(r.answers[0].date, "2026-10-14");
  assert.equal(r.answers[0].ratings.food, "Great");
  assert.equal(r.answers[0].open.comments, "Love the Reuben & soup");
  assert.equal(r.answers[1].open.comments, "Quick");
});
