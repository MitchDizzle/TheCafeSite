// Manage -> Reports: any range of days from the kitchen PC's history, and CSV downloads.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, dialog } = Front;

  // ---- Reports: the daily history the kitchen PC keeps (stats-history.json),
  // for any range of days, with CSV downloads to make a report elsewhere.
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function ranges() {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    return {
      "This week": [ymd(monday), ymd(now)],
      "Last week": [ymd(addDays(monday, -7)), ymd(addDays(monday, -1))],
      "This month": [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)],
      "Last month": [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))],
      "Last 30 days": [ymd(addDays(now, -29)), ymd(now)],
    };
  }
  const money = (n) => `$${(n || 0).toFixed(2)}`;
  const minsText = (n) => (n != null ? `${n} min` : "–");
  const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  function openReport(from, to) {
    if (!from) [from, to] = ranges()["This week"];
    screen({ title: "Reports", back: true,
      body: `<form class="r-range" id="r-range">
          <label class="m-field">From<input type="date" id="r-from" value="${from}" required></label>
          <label class="m-field">To<input type="date" id="r-to" value="${to}" required></label>
        </form>
        <div class="r-quick">${Object.entries(ranges()).map(([name, [a, b]]) =>
          `<button type="button" data-from="${a}" data-to="${b}"${a === from && b === to ? ' class="on"' : ""}>${name}</button>`).join("")}</div>
        <div id="r-out"><p class="m-busy">Reading…</p></div>`,
      buttons: [{ label: "Days (CSV)", act: "csv-days" }, { label: "Every order (CSV)", act: "csv-orders" }] });
    document.getElementById("r-range").addEventListener("change", () => {
      const a = document.getElementById("r-from").value, b = document.getElementById("r-to").value;
      if (a && b) openReport(a, b);
    });
    dialog.querySelector(".r-quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-from]");
      if (b) openReport(b.dataset.from, b.dataset.to);
    });
    report = null;
    loadReport(from, to);
  }

  let report = null;
  async function loadReport(from, to) {
    const r = await postJson("/api/front-report", { pin: Front.pin, from, to });
    const out = document.getElementById("r-out");
    if (!out) return; // closed meanwhile
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    report = r;
    const t = r.total;
    const cell = (b, label) => `<div class="stat"><b>${b}</b><span>${label}</span></div>`;
    if (!r.days.length) {
      out.innerHTML = `<p class="m-note">No days saved in this range.${r.first ? ` The history starts ${esc(dayName(r.first))}.` : " The history starts with the first day the board runs with this update."}</p>`;
      return;
    }
    const n = r.days.length;
    out.innerHTML = `
      <div class="r-stats">
        ${cell(t.orders, `orders (${n} day${n === 1 ? "" : "s"})`)}
        ${cell(Math.round(t.orders / n), "a day on average")}
        ${cell(money(t.sales), "net sales")}
        ${cell(money(t.collected), "collected, tax and tips in")}
        ${cell(`${t.breakfast} / ${t.lunch}`, "breakfast / lunch")}
        ${cell(`${t.counter} / ${t.online}`, "counter / online")}
        ${cell(`${t.toGo} / ${t.forHere}`, "to go / for here")}
        ${cell(minsText(t.avgMinutes), "avg in the kitchen")}
        ${cell(minsText(t.longestMinutes), "longest")}
      </div>
      <p class="r-h">By day</p>
      <div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Day</th><th>Orders</th><th>Sales</th><th>Bkfst</th><th>Lunch</th><th>Online</th><th>Avg</th></tr></thead>
        <tbody>${r.days.map((d) => `<tr><td>${esc(dayName(d.date))}</td><td>${d.orders}</td><td>${money(d.sales)}</td>
          <td>${d.breakfast}</td><td>${d.lunch}</td><td>${d.online}</td><td>${minsText(d.avgMinutes)}</td></tr>`).join("")}</tbody>
      </table></div>
      ${t.bySize ? `<p class="r-h">Time in the kitchen by order size</p>
      <div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Size</th><th>Orders</th><th>Middle</th><th>Avg</th>${r.lead ? "<th>Starts ahead</th>" : ""}</tr></thead>
        <tbody>${t.bySize.map((s, i) => `<tr><td>${esc(s.label)}</td><td>${s.orders}</td><td>${minsText(s.medianMinutes)}</td><td>${minsText(s.avgMinutes)}</td>
          ${r.lead ? `<td>${minsText(r.lead[i].ahead)}</td>` : ""}</tr>`).join("")}</tbody>
      </table></div>
      <p class="m-note">Items are what the kitchen makes (5 wraps is 5). Middle is the median: half the orders were quicker. Starts ahead is how long before it's due a pickup or a phone order with a time goes on the board now, from the last 8 weeks.</p>` : ""}
      <p class="r-h">Items ordered</p>
      <ol class="r-items">${t.items.slice(0, 30).map((i) => `<li>${esc(i.name)} ×${i.qty}</li>`).join("")}</ol>
      ${t.items.length > 30 ? `<p class="m-note">And ${t.items.length - 30} more: they're all in the CSV.</p>` : ""}
      <p class="m-note">Sales are Square's Net sales: what the items sold for after discounts, without tax or tips, as on Square's Dashboard. Square counts a sale on the day it was paid and the board on the day it was made, so a pickup paid the night before can land on a different day, and a refund isn't taken off here. Test orders, demo orders and canceled sales aren't counted.</p>`;
  }

  // A CSV made on this device and saved through the browser's download.
  function saveCsv(name, rows) {
    const cellText = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const blob = new Blob([rows.map((r) => r.map(cellText).join(",")).join("\r\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function csv(kind) {
    if (!report) return;
    const { from, to } = report;
    if (kind === "days") {
      saveCsv(`cafe-days-${from}-to-${to}.csv`, [
        ["date", "orders", "net_sales", "collected", "breakfast", "lunch", "counter", "online", "to_go", "for_here", "kitchen_done", "avg_kitchen_min", "longest_kitchen_min", "top_items"],
        ...report.days.map((d) => [d.date, d.orders, d.sales.toFixed(2), d.collected.toFixed(2), d.breakfast, d.lunch, d.counter, d.online, d.toGo, d.forHere,
          d.kitchenDone, d.avgMinutes, d.longestMinutes, d.topItems.map((i) => `${i.name} x${i.qty}`).join("; ")]),
      ]);
      return;
    }
    const r = await postJson("/api/front-report", { pin: Front.pin, from, to, orders: true });
    if (!r.ok) return;
    saveCsv(`cafe-orders-${from}-to-${to}.csv`, [
      ["date", "time", "meal", "where", "to_go", "paid", "net_sales", "collected", "kitchen_items", "kitchen_min", "items"],
      ...r.orders.map((o) => [o.date, new Date(o.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), o.meal,
        o.online ? "online" : "counter", o.toGo ? "yes" : "no", o.paid ? "yes" : "no", o.net != null ? o.net.toFixed(2) : "", o.sales != null ? o.sales.toFixed(2) : "",
        o.kitchenItems, o.kitchenMinutes, o.items.map((i) => `${i.qty} ${i.name}${i.variation ? ` (${i.variation})` : ""}`).join("; ")]),
    ]);
  }

  Front.tools.report = () => openReport();
  Front.acts["csv-days"] = () => csv("days");
  Front.acts["csv-orders"] = () => csv("orders");
})();
