// Manage -> Survey: the customer survey's answers (paper cards and the
// website's /survey) for any range of days, importing a typed-up sheet, and
// the summary the website's /feedback page is built from (lib/surveys.js).
// Loaded by front.html after reports.js, whose date ranges it shares.
(() => {
  const { esc, postJson, screen, busy, dialog } = Front;

  const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
  const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  let shown = null; // the range on screen, to come back to after an import
  function openSurvey(from, to) {
    const ranges = { ...Front.ranges(), "All time": ["2026-01-01", ymd(new Date())] };
    if (!from) [from, to] = ranges["Last 30 days"];
    shown = [from, to];
    screen({ title: "Survey", back: true,
      body: `<form class="r-range" id="sv-range">
          <label class="m-field">From<input type="date" id="sv-from" value="${from}" required></label>
          <label class="m-field">To<input type="date" id="sv-to" value="${to}" required></label>
        </form>
        <div class="r-quick">${Object.entries(ranges).map(([name, [a, b]]) =>
          `<button type="button" data-from="${a}" data-to="${b}"${a === from && b === to ? ' class="on"' : ""}>${name}</button>`).join("")}</div>
        <div id="sv-out"><p class="m-busy">Reading…</p></div>`,
      buttons: [{ label: "Import a sheet", act: "survey-import" }, { label: "For the website", act: "survey-website" }] });
    document.getElementById("sv-range").addEventListener("change", () => {
      const a = document.getElementById("sv-from").value, b = document.getElementById("sv-to").value;
      if (a && b) openSurvey(a, b);
    });
    dialog.querySelector(".r-quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-from]");
      if (b) openSurvey(b.dataset.from, b.dataset.to);
    });
    load(from, to);
  }

  async function load(from, to) {
    const r = await postJson("/api/front-survey", { pin: Front.pin, from, to });
    const out = document.getElementById("sv-out");
    if (!out) return;
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    if (!r.total) {
      out.innerHTML = `<p class="m-note">No answers in this range.${r.first ? ` The first is from ${esc(dayName(r.first))}.` : " None imported yet: Import a sheet below."}</p>${imports(r)}`;
      return;
    }
    const cell = (b, label) => `<div class="stat"><b>${b}</b><span>${label}</span></div>`;
    const table = (rows, heads) => `<div class="r-table-wrap"><table class="r-table sv-table">
        <thead><tr><th></th>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}<th>Answered</th></tr></thead>
        <tbody>${rows.map((q) => `<tr><td>${esc(q.label)}</td>${q.counts.map(([, n]) =>
          `<td>${n}<small>${pct(n, q.answered)}%</small></td>`).join("")}<td>${q.answered}</td></tr>`).join("")}</tbody></table></div>`;
    out.innerHTML = `
      <div class="r-stats">
        ${cell(r.total, "surveys")}
        ${cell(r.cards, "paper cards")}
        ${cell(r.web, "on the website")}
      </div>
      <p class="r-h">Ratings</p>
      ${table(r.ratings, r.scale)}
      ${r.choices.filter((c) => c.answered).map((c) => `<p class="r-h">${esc(c.label)}</p>
        <ol class="r-items">${c.counts.filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([v, n]) =>
          `<li>${esc(v)} ×${n} <small class="m-note">${pct(n, c.answered)}%</small></li>`).join("")}</ol>`).join("")}
      <p class="r-h">Comments (${r.comments.length})</p>
      ${r.comments.length ? `<ul class="sv-comments">${r.comments.map((c) => `<li>
          <span class="sv-meta">${esc(dayName(c.date))} · ${c.source === "web" ? "website" : "card"} · ${esc(c.question)}${c.share ? ` · <b class="sv-ok">OK to share${c.name ? `: ${esc(c.name)}` : ""}</b>` : ""}</span>
          ${esc(c.text)}</li>`).join("")}</ul>` : `<p class="m-note">No comments in this range.</p>`}
      ${imports(r)}`;
  }

  // The last imports, each with a way to take it back out (a sheet read wrongly).
  const imports = (r) => (r.imports && r.imports.length ? `<p class="r-h">Imports</p>
    <ul class="sv-imports">${r.imports.map((i) => `<li><span>${esc(new Date(i.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} · ${esc(i.file)} · ${i.count} answer${i.count === 1 ? "" : "s"}</span>
      <button type="button" class="m-mini" data-act="survey-remove" data-batch="${esc(i.batch)}">Take out</button></li>`).join("")}</ul>` : "");

  // ---- Import: a file (Excel, CSV) or rows pasted from a spreadsheet,
  // previewed first so a sheet read wrongly is seen before it's saved.
  let sheet = null; // { text } or { xlsx, file }
  function openImport() {
    sheet = null;
    screen({ title: "Import survey answers", back: true,
      body: `<p class="m-note">A sheet with one row per survey and the questions as headings in the first row (The food, The service, … or food, service, …). A date column is used if there is one. Phone and email columns are left out: they're never kept.</p>
        <label class="m-field">Excel or CSV file<input type="file" id="sv-file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <label class="m-field">Or paste the rows, headings first<textarea id="sv-paste" rows="4" placeholder="Copy the cells in Excel, then paste here"></textarea></label>
        <label class="m-field">Where they came from<select id="sv-source"><option value="card">Paper cards</option><option value="web">The website</option></select>
          <small>Used when the sheet has no column saying so.</small></label>
        <label class="m-field">Day for rows without a date<input type="date" id="sv-date" value="${ymd(new Date())}"></label>
        <div id="sv-preview"></div>`,
      buttons: [{ label: "Check it", act: "survey-preview", kind: "primary" }] });
    document.getElementById("sv-file").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (/\.xlsx$/i.test(f.name)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        sheet = { xlsx: btoa(bin), file: f.name };
      } else sheet = { text: await f.text(), file: f.name };
      document.getElementById("sv-paste").value = "";
      preview();
    });
  }
  const input = () => {
    const pasted = document.getElementById("sv-paste").value;
    return { ...(pasted.trim() ? { text: pasted, file: "pasted" } : sheet || {}),
      source: document.getElementById("sv-source").value, date: document.getElementById("sv-date").value };
  };
  const AS = { date: "the date", source: "where it came from", share: "OK to share", name: "name (kept only if OK to share)", contact: "left out: contact details are never kept" };
  async function preview() {
    const box = document.getElementById("sv-preview");
    const body = input();
    if (!body.text && !body.xlsx) { box.innerHTML = `<p class="m-error">Pick a file or paste the rows first.</p>`; return; }
    box.innerHTML = `<p class="m-busy">Reading…</p>`;
    const r = await postJson("/api/front-survey-import", { pin: Front.pin, ...body, preview: true });
    if (!r.ok) { box.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    const n = r.answers.length;
    box.innerHTML = `<p class="r-h">The columns</p>
      <ul class="sv-cols">${r.columns.map((c) => `<li><b>${esc(c.header || "(no heading)")}</b> → ${c.label ? esc(c.label) : c.as ? esc(AS[c.as]) : `<span class="m-note">not used</span>`}</li>`).join("")}</ul>
      <p>${r.found} survey${r.found === 1 ? "" : "s"} found.${r.already ? ` ${r.already} already imported.` : ""}${r.empty ? ` ${r.empty} empty row${r.empty === 1 ? "" : "s"} skipped.` : ""}${r.undated ? ` ${r.undated} without a date go on ${esc(dayName(body.date))}.` : ""}</p>
      ${r.unreadableCount ? `<p class="m-error">${r.unreadableCount} rating${r.unreadableCount === 1 ? "" : "s"} couldn't be read and will be left blank, e.g. ${r.unreadable.slice(0, 3).map((u) => `row ${u.row} “${esc(u.value)}” under ${esc(u.column)}`).join("; ")}.</p>` : ""}
      ${n ? `<button type="button" class="m-btn primary" data-act="survey-save">Import ${n} survey${n === 1 ? "" : "s"}</button>` : `<p class="m-note">Nothing new to import.</p>`}`;
  }
  async function save() {
    const body = input();
    busy("Import survey answers", "Importing…");
    const r = await postJson("/api/front-survey-import", { pin: Front.pin, ...body });
    if (!r.ok) return Front.result("Import survey answers", r);
    openSurvey(...(shown || []));
  }

  async function remove(batch) {
    if (!confirm("Take every answer from this import back out?")) return;
    await postJson("/api/front-survey-remove", { pin: Front.pin, batch });
    openSurvey(...(shown || []));
  }

  // ---- For the website: the summary /feedback is built from, as a file to
  // put into the website (src/_data/feedbackStats.json) and build.
  async function website() {
    const r = await postJson("/api/front-survey-website", { pin: Front.pin });
    if (!r.ok) return Front.result("For the website", r);
    const s = r.stats;
    const blob = new Blob([JSON.stringify(s, null, 2) + "\n"], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "feedbackStats.json" });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    screen({ title: "For the website", back: true,
      body: `<p class="m-result good">✓ feedbackStats.json saved: ${s.total} survey${s.total === 1 ? "" : "s"}${s.since ? ` since ${esc(dayName(s.since))}` : ""}, ${s.quotes.length} comment${s.quotes.length === 1 ? "" : "s"} customers said may be shared.</p>
        <p class="m-note">It holds counts only, plus those comments with a first name and initial at most. Put it in the website as <b>src/_data/feedbackStats.json</b> (replacing the old one), build and upload, and the /feedback page shows it.</p>`,
      buttons: [{ label: "Done", act: "close", kind: "primary" }] });
  }

  Front.tools.survey = () => openSurvey();
  Front.acts["survey-import"] = openImport;
  Front.acts["survey-preview"] = preview;
  Front.acts["survey-save"] = save;
  Front.acts["survey-website"] = website;
  // Take out carries its import on the button: found from the click itself.
  dialog.addEventListener("click", (e) => {
    const b = e.target.closest('[data-act="survey-remove"]');
    if (b) remove(b.dataset.batch);
  });
})();
