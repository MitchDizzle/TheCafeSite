// Manage -> Tax exempt: the counter sales rung with the tax taken off (a
// veteran's exemption; Mitch 2026-11-23), each with its exemption number,
// for any range of days, with each number's total, a CSV and a printed list
// for the sales tax return (lib/tax-exempt.js). The board finds the sales
// itself; one it can't (rung before 2026-11-23, or not in Square) is added
// by hand. Loaded by front.html after reports.js, whose date ranges it shares.
(() => {
  const { esc, postJson, screen, dialog } = Front;

  const money = (n) => `$${(n || 0).toFixed(2)}`;
  const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  let shown = null; // { from, to, report } on screen
  function open(from, to) {
    const ranges = { Today: [ymd(new Date()), ymd(new Date())], ...Front.ranges() };
    if (!from) [from, to] = ranges["This month"];
    shown = { from, to, report: null };
    screen({ title: "Tax exempt", back: true,
      body: `<p class="m-note">Sales rung at the counter with the tax taken off show here by themselves. Type the exemption number on each; one that wasn't an exemption can be left off.</p>
        <form class="r-range" id="tx-range">
          <label class="m-field">From<input type="date" id="tx-from" value="${from}" required></label>
          <label class="m-field">To<input type="date" id="tx-to" value="${to}" required></label>
        </form>
        <div class="r-quick">${Object.entries(ranges).map(([name, [a, b]]) =>
          `<button type="button" data-from="${a}" data-to="${b}"${a === from && b === to ? ' class="on"' : ""}>${name}</button>`).join("")}</div>
        <div id="tx-out"><p class="m-busy">Reading…</p></div>`,
      buttons: [{ label: "Add a sale by hand", act: "tx-add" }, { label: "CSV", act: "tx-csv" }, { label: "Print", act: "tx-print", kind: "primary" }] });
    document.getElementById("tx-range").addEventListener("change", () => {
      const a = document.getElementById("tx-from").value, b = document.getElementById("tx-to").value;
      if (a && b) open(a, b);
    });
    dialog.querySelector(".r-quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-from]");
      if (b) open(b.dataset.from, b.dataset.to);
    });
    load();
  }

  async function load() {
    const { from, to } = shown;
    const r = await postJson("/api/front-tax-exempt", { pin: Front.pin, from, to });
    const out = document.getElementById("tx-out");
    if (!out || !shown || shown.from !== from || shown.to !== to) return;
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    shown.report = r;
    const cell = (b, label) => `<div class="stat"><b>${b}</b><span>${label}</span></div>`;
    const row = (s) => `<li class="tx-sale${s.notExempt ? " off" : !s.number ? " todo" : ""}" data-id="${esc(s.id)}">
        <div class="tx-what">
          <b>${esc(dayName(s.date))}${s.at ? ` · ${esc(timeOf(s.at))}` : ""} · ${money(s.amount)}</b>
          <small>${s.receipt ? `Receipt ${esc(s.receipt)} · ` : ""}${s.byHand ? "added by hand" : esc(s.items.join(", ") || "")}</small>
        </div>
        ${s.notExempt ? `<p class="tx-off">Not an exemption <button type="button" class="m-mini" data-tx="back">Put back</button></p>` : `
        <div class="tx-fields">
          <label class="m-field">Exemption number<input type="text" data-f="number" value="${esc(s.number)}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
          <label class="m-field">Name <small>(if you like)</small><input type="text" data-f="name" value="${esc(s.name)}" autocomplete="off"></label>
        </div>
        <p class="tx-acts">
          <button type="button" class="m-mini" data-tx="save">Save</button>
          ${s.byHand ? `<button type="button" class="m-mini" data-tx="remove">Take out</button>` : `<button type="button" class="m-mini" data-tx="not">Not an exemption</button>`}
          <span class="tx-msg" role="status"></span>
        </p>`}
      </li>`;
    out.innerHTML = `
      <div class="r-stats">
        ${cell(r.sales, `exempt sale${r.sales === 1 ? "" : "s"}`)}
        ${cell(money(r.total), "sold tax-free (before tax)")}
        ${cell(r.toDo, r.toDo === 1 ? "needs a number" : "need a number")}
      </div>
      ${r.rows.length ? `<p class="r-h">Sales</p><ul class="tx-list">${r.rows.map(row).join("")}</ul>`
        : `<p class="m-note">No tax-free sales in these days. The board finds them from November 23, 2026 on; an earlier one can be added by hand.</p>`}
      ${r.byNumber.length ? `<p class="r-h">By exemption number</p>
        <div class="r-table-wrap"><table class="r-table"><thead><tr><th>Number</th><th>Name</th><th>Sales</th><th>Before tax</th></tr></thead>
        <tbody>${r.byNumber.map((n) => `<tr><td>${esc(n.number)}</td><td>${esc(n.name)}</td><td>${n.sales}</td><td>${money(n.amount)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }

  async function act(b) {
    const li = b.closest("[data-id]");
    const id = li.dataset.id;
    const msg = li.querySelector(".tx-msg");
    const what = b.dataset.tx;
    let r;
    if (what === "save") {
      const number = li.querySelector('[data-f="number"]').value;
      const name = li.querySelector('[data-f="name"]').value;
      r = await postJson("/api/front-tax-exempt-save", { pin: Front.pin, id, number, name });
    } else if (what === "not") r = await postJson("/api/front-tax-exempt-not", { pin: Front.pin, id, on: true });
    else if (what === "back") r = await postJson("/api/front-tax-exempt-not", { pin: Front.pin, id, on: false });
    else if (what === "remove") {
      if (!confirm("Take this sale off the list?")) return;
      r = await postJson("/api/front-tax-exempt-remove", { pin: Front.pin, id });
    }
    if (r && !r.ok) { if (msg) { msg.textContent = r.message || "Couldn't save that."; msg.className = "tx-msg m-error"; } return; }
    Front.rerender(); // the front page's reminder line
    load();
  }
  dialog.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tx]");
    if (b && b.closest(".tx-list")) act(b);
  });
  // Enter in a number saves that sale.
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.closest(".tx-fields")) return;
    e.preventDefault();
    const save = e.target.closest("[data-id]").querySelector('[data-tx="save"]');
    if (save) act(save);
  });

  // ---- A sale the board can't find: rung before it kept the tax (Nov 23,
  // 2026), or written down on paper.
  function openAdd(message) {
    screen({ title: "Add a tax-free sale", back: true,
      body: `<form id="tx-add" class="tx-add">
          <label class="m-field">Day<input type="date" id="ta-date" value="${ymd(new Date())}" max="${ymd(new Date())}" required></label>
          <label class="m-field">Time <small>(if known)</small><input type="time" id="ta-time"></label>
          <label class="m-field">Amount before tax<input type="text" id="ta-amount" inputmode="decimal" placeholder="12.50" required></label>
          <label class="m-field">Receipt <small>(if known)</small><input type="text" id="ta-receipt" autocomplete="off"></label>
          <label class="m-field">Exemption number<input type="text" id="ta-number" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
          <label class="m-field">Name <small>(if you like)</small><input type="text" id="ta-name" autocomplete="off"></label>
        </form>
        <p class="m-error" ${message ? "" : "hidden"}>${esc(message || "")}</p>`,
      buttons: [{ label: "Add", submit: "tx-add", kind: "primary" }] });
    document.getElementById("tx-add").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => document.getElementById(id).value;
      const r = await postJson("/api/front-tax-exempt-add", { pin: Front.pin, date: v("ta-date"), time: v("ta-time"), amount: v("ta-amount"),
        receipt: v("ta-receipt"), number: v("ta-number"), name: v("ta-name") });
      if (!r.ok) return openAdd(r.message);
      const back = shown && v("ta-date") >= shown.from && v("ta-date") <= shown.to ? [shown.from, shown.to] : [];
      open(...back);
    });
  }

  // ---- The list, for the tax return: a CSV, or printed.
  const exemptRows = (r) => r.rows.filter((s) => s.number && !s.notExempt);
  function csv() {
    const r = shown && shown.report;
    if (!r) return;
    const cellText = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const rows = [["date", "time", "receipt", "amount_before_tax", "exemption_number", "name"],
      ...exemptRows(r).map((s) => [s.date, timeOf(s.at), s.receipt || "", s.amount.toFixed(2), s.number, s.name])];
    const blob = new Blob([rows.map((x) => x.map(cellText).join(",")).join("\r\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `tax-exempt-${r.from}-to-${r.to}.csv` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function print() {
    const r = shown && shown.report;
    if (!r) return;
    const range = r.from === r.to ? dayName(r.from) : `${dayName(r.from)} to ${dayName(r.to)}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tax-exempt sales</title><style>
      body { font: 11pt/1.35 Lato, Arial, sans-serif; color: #000; margin: 0.6in; }
      h1 { font: 700 18pt Georgia, serif; margin: 0 0 0.1in; }
      p { margin: 0 0 0.15in; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 0.25in; }
      th, td { text-align: left; padding: 0.04in 0.08in; border-bottom: 1px solid #999; }
      th { border-bottom: 1.5px solid #000; }
      td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
      tfoot td { font-weight: 700; border-bottom: 0; }
      h2 { font-size: 12pt; margin: 0.2in 0 0.05in; }
    </style></head><body>
      <h1>The Café: tax-exempt sales</h1>
      <p>${esc(range)} · ${r.sales} sale${r.sales === 1 ? "" : "s"} · ${money(r.total)} before tax${r.toDo ? ` · ${r.toDo} still without a number, not included` : ""}</p>
      <table><thead><tr><th>Date</th><th>Time</th><th>Receipt</th><th>Exemption number</th><th>Name</th><th class="n">Before tax</th></tr></thead>
        <tbody>${exemptRows(r).map((s) => `<tr><td>${esc(dayName(s.date))}</td><td>${esc(timeOf(s.at))}</td><td>${esc(s.receipt || "")}</td><td>${esc(s.number)}</td><td>${esc(s.name)}</td><td class="n">${money(s.amount)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="5">Total</td><td class="n">${money(r.total)}</td></tr></tfoot></table>
      ${r.byNumber.length > 1 ? `<h2>By exemption number</h2><table><thead><tr><th>Number</th><th>Name</th><th class="n">Sales</th><th class="n">Before tax</th></tr></thead>
        <tbody>${r.byNumber.map((n) => `<tr><td>${esc(n.number)}</td><td>${esc(n.name)}</td><td class="n">${n.sales}</td><td class="n">${money(n.amount)}</td></tr>`).join("")}</tbody></table>` : ""}
    </body></html>`;
    let frame = document.getElementById("tx-print");
    if (!frame) {
      frame = Object.assign(document.createElement("iframe"), { id: "tx-print", title: "Tax-exempt sales" });
      frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(frame);
    }
    frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
    frame.srcdoc = html;
  }

  Front.tools["tax-exempt"] = () => open();
  Front.acts["tx-add"] = () => openAdd();
  Front.acts["tx-csv"] = csv;
  Front.acts["tx-print"] = print;
})();
