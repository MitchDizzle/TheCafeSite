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
  const hourName = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

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
    const b4 = r.before;
    // A number beside the same stretch before ("▲ 421 the week before"): the
    // arrow says up or down, its colour whether that's good (a shorter
    // kitchen time is).
    const vs = (now, then, fmt = String, lowerIsBetter) => {
      if (!b4 || then == null || now == null) return "";
      const arrow = now === then ? "=" : now > then ? "▲" : "▼";
      const good = now === then ? "" : (now > then) !== !!lowerIsBetter ? " good" : " bad";
      return `<small class="r-vs${good}">${arrow} ${fmt(then)} ${esc(b4.label)}</small>`;
    };
    // A stat with more behind it opens it on a tap, or on a hover with a mouse.
    const cell = (b, label, more, extra = "") => more
      ? `<button type="button" class="stat r-more-btn" data-more="${more}"><b>${b}</b><span>${label}</span>${extra}<em>more ›</em></button>`
      : `<div class="stat"><b>${b}</b><span>${label}</span>${extra}</div>`;
    const when = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const orderLine = (o) => `<li><b>${minsText(Math.round(o.kitchenMinutes))}</b> · ${esc(when(o.at))} · ${esc(o.where)}${o.toGo ? " · to go" : ""}${o.kitchenItems != null ? ` · ${o.kitchenItems} item${o.kitchenItems === 1 ? "" : "s"}` : ""}${o.receipt ? ` · receipt #${esc(o.receipt)}` : ""}
      <span>${esc(o.items.join(", "))}</span></li>`;
    const more = {
      slow: t.slowest.length ? `<p class="r-h">Slowest orders</p><ol class="r-orders">${t.slowest.map(orderLine).join("")}</ol>
        <p class="m-note">Time in the kitchen, from going on the board to Done. A big order takes longer: see "by order size" below.</p>` : "",
      online: t.handoff ? `<p class="r-h">Online and DoorDash</p>
        <div class="r-table-wrap"><table class="r-table"><thead><tr><th></th><th>Orders</th><th>In the kitchen</th><th>Then waited</th></tr></thead><tbody>
        ${[["Online pickup", t.handoff.online], ["DoorDash", t.handoff.doordash]].map(([name, h]) => `<tr><td>${name}</td><td>${h.orders}</td><td>${minsText(h.kitchenMinutes)}</td>
          <td>${h.waitMinutes != null ? `${minsText(h.waitMinutes)} <small>(${h.waited})</small>` : "–"}</td></tr>`).join("")}</tbody></table></div>
        <p class="m-note">Middle times (half were quicker). Waited is Done until Handed off was pressed at the front, for the orders it was pressed on: the customer, or for DoorDash the Dasher. Counted from Nov 2, 2026; online orders before that don't say which they were.</p>`
        : `<p class="m-note">Online and DoorDash times are counted from Nov 2, 2026: none in this range yet.</p>`,
    };
    if (!r.days.length) {
      out.innerHTML = `<p class="m-note">No days saved in this range.${r.first ? ` The history starts ${esc(dayName(r.first))}.` : " The history starts with the first day the board runs with this update."}</p>`;
      return;
    }
    const n = r.days.length;
    out.innerHTML = `
      <div class="r-stats">
        ${cell(t.orders, `orders (${n} day${n === 1 ? "" : "s"})`, null, vs(t.orders, b4 && b4.orders))}
        ${cell(Math.round(t.orders / n), "a day on average", null, vs(Math.round(t.orders / n), b4 && Math.round(b4.orders / b4.days)))}
        ${cell(money(t.sales), "net sales", null, vs(t.sales, b4 && b4.sales, money))}
        ${cell(money(t.tips), `tips (${t.tipped} order${t.tipped === 1 ? "" : "s"})`, null, vs(t.tips, b4 && b4.tips, money))}
        ${cell(money(t.collected), "collected, tax and tips in")}
        ${cell(`${t.breakfast} / ${t.lunch}`, "breakfast / lunch")}
        ${cell(`${t.counter} / ${t.online}`, "counter / online", "online")}
        ${cell(`${t.toGo} / ${t.forHere}`, "to go / for here")}
        ${cell(minsText(t.avgMinutes), "avg in the kitchen", t.slowest.length ? "slow" : null, vs(t.avgMinutes, b4 && b4.avgMinutes, minsText, true))}
        ${cell(minsText(t.longestMinutes), "longest", t.slowest.length ? "slow" : null)}
      </div>
      <div class="r-more" id="r-more" hidden></div>
      ${b4 ? `<p class="m-note r-vs-note">▲ ▼ compare with ${esc(b4.label)} (${esc(dayName(b4.from))} – ${esc(dayName(b4.to))}, ${b4.days} day${b4.days === 1 ? "" : "s"} saved).</p>` : ""}
      <p class="r-h">By day</p>
      <div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Day</th><th>Orders</th><th>Sales</th><th>Tips</th><th>Bkfst</th><th>Lunch</th><th>Online</th><th>Avg</th></tr></thead>
        <tbody>${r.days.map((d) => `<tr><td>${esc(dayName(d.date))}</td><td>${d.orders}</td><td>${money(d.sales)}</td><td>${money(d.tips)}</td>
          <td>${d.breakfast}</td><td>${d.lunch}</td><td>${d.online}</td><td>${minsText(d.avgMinutes)}</td></tr>`).join("")}</tbody>
      </table></div>
      ${t.bySize ? `<p class="r-h">Time in the kitchen by order size</p>
      <div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Size</th><th>Orders</th><th>Middle</th><th>Avg</th>${r.lead ? "<th>Starts ahead</th>" : ""}</tr></thead>
        <tbody>${t.bySize.map((s, i) => `<tr><td>${esc(s.label)}</td><td>${s.orders}</td><td>${minsText(s.medianMinutes)}</td><td>${minsText(s.avgMinutes)}</td>
          ${r.lead ? `<td>${minsText(r.lead[i].ahead)}</td>` : ""}</tr>`).join("")}</tbody>
      </table></div>
      <p class="m-note">Items are what the kitchen makes (5 wraps is 5). Middle is the median: half the orders were quicker. Starts ahead is how long before it's due a pickup or a phone order with a time goes on the board now, from the last 8 weeks.</p>` : ""}
      ${t.hours && t.hours.length ? `<p class="r-h">By hour <span class="r-h-note">tap an hour for its orders</span></p>
      <div class="r-table-wrap"><table class="r-table r-hours">
        <thead><tr><th>Hour</th><th>Orders</th><th>A day</th><th>Avg in the kitchen</th></tr></thead>
        <tbody>${t.hours.map((h) => `<tr data-hour="${h.hour}" tabindex="0"><td>${hourName(h.hour)}</td><td>${h.orders}</td><td>${Math.round((h.orders / n) * 10) / 10}</td><td>${minsText(h.avgMinutes)}</td></tr>
          <tr class="r-hour-orders" data-for="${h.hour}" hidden><td colspan="4"></td></tr>`).join("")}</tbody>
      </table></div>` : ""}
      ${t.dishes && t.dishes.length ? `<p class="r-h">Slowest dishes</p>
      <div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Dish</th><th>Orders</th><th>Middle</th></tr></thead>
        <tbody>${t.dishes.map((d) => `<tr><td>${esc(d.name)}</td><td>${d.orders}</td><td>${minsText(d.medianMinutes)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="m-note">The kitchen time of the orders each dish was in (middle: half were quicker), for dishes in 3 or more timed orders; everything in the range takes ${minsText(t.avgMinutes)} on average. An order with a slow dish and a big one together counts for both.</p>` : ""}
      ${r.specials && (r.specials.plates.length || r.specials.soups.length) ? `<p class="r-h">Specials sold</p>
      ${r.specials.plates.length ? `<div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Lunch Special</th><th>Days</th><th>Sold</th><th>A day</th></tr></thead>
        <tbody>${r.specials.plates.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.days}</td><td>${p.qty}</td><td>${p.perDay}</td></tr>`).join("")}</tbody>
      </table></div>` : ""}
      ${r.specials.soups.length ? `<div class="r-table-wrap"><table class="r-table">
        <thead><tr><th>Soup of the Day</th><th>Days</th><th>Cups</th><th>Bowls</th><th>A day</th></tr></thead>
        <tbody>${r.specials.soups.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.days}</td><td>${p.cups}</td><td>${p.bowls}</td><td>${p.perDay}</td></tr>`).join("")}</tbody>
      </table></div>` : ""}
      <p class="m-note">Best sellers first, by how many sold a day it was on. Named as rung up in Square that day.</p>` : ""}
      <p class="r-h">Items ordered</p>
      <ol class="r-items">${t.items.slice(0, 30).map((i) => `<li>${esc(i.name)} ×${i.qty}</li>`).join("")}</ol>
      ${t.items.length > 30 ? `<p class="m-note">And ${t.items.length - 30} more: they're all in the CSV.</p>` : ""}
      <p class="m-note">Sales are Square's Net sales: what the items sold for after discounts, without tax or tips, as on Square's Dashboard. Square counts a sale on the day it was paid and the board on the day it was made, so a pickup paid the night before can land on a different day, and a refund isn't taken off here. Test orders, demo orders and canceled sales aren't counted.</p>`;

    // The stat's detail: a tap keeps it open (another tap closes it); a
    // mouse hovering shows it while it's over the stat.
    const panel = document.getElementById("r-more");
    let pinned = null;
    const show = (key) => {
      panel.innerHTML = key ? more[key] : "";
      panel.hidden = !key;
      out.querySelectorAll("[data-more]").forEach((c) => c.classList.toggle("on", c.dataset.more === key));
    };
    const hover = matchMedia("(hover: hover)").matches;
    out.querySelectorAll("[data-more]").forEach((c) => {
      c.addEventListener("click", () => { pinned = pinned === c.dataset.more ? null : c.dataset.more; show(pinned); });
      if (hover) {
        c.addEventListener("mouseenter", () => { if (!pinned) show(c.dataset.more); });
        c.addEventListener("mouseleave", () => { if (!pinned) show(null); });
      }
    });
    // An hour's orders, from the same list as the CSV, fetched on the first tap.
    const hours = out.querySelector(".r-hours");
    if (hours) {
      const openHour = async (row) => {
        const slot = hours.querySelector(`[data-for="${row.dataset.hour}"]`);
        if (!slot.hidden) { slot.hidden = true; return; }
        slot.hidden = false;
        slot.firstElementChild.innerHTML = `<p class="m-busy">Reading…</p>`;
        const all = await allOrders();
        const list = (all || []).filter((o) => new Date(o.at).getHours() === Number(row.dataset.hour))
          .sort((a, b) => (b.kitchenMinutes ?? -1) - (a.kitchenMinutes ?? -1));
        slot.firstElementChild.innerHTML = all ? `<ol class="r-orders">${list.map((o) => `<li><b>${o.kitchenMinutes != null ? minsText(Math.round(o.kitchenMinutes)) : "untimed"}</b> · ${esc(when(o.at))} · ${o.doordash ? "DoorDash" : o.online ? "Online" : "Counter"}${o.receipt ? ` · receipt #${esc(o.receipt)}` : ""}
          <span>${esc(o.items.map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${i.name}${i.variation ? ` (${i.variation})` : ""}`).join(", "))}</span></li>`).join("")}</ol>`
          : `<p class="m-error">Couldn't read the orders.</p>`;
      };
      hours.addEventListener("click", (e) => { const row = e.target.closest("[data-hour]"); if (row) openHour(row); });
      hours.addEventListener("keydown", (e) => { const row = e.target.closest("[data-hour]"); if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openHour(row); } });
    }
  }

  // Every order in the report's range, once per report (for an hour's list).
  async function allOrders() {
    if (!report) return null;
    if (report.orderList) return report.orderList;
    const r = await postJson("/api/front-report", { pin: Front.pin, from: report.from, to: report.to, orders: true });
    return r.ok ? (report.orderList = r.orders) : null;
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
        ["date", "orders", "net_sales", "tips", "collected", "breakfast", "lunch", "counter", "online", "to_go", "for_here", "kitchen_done", "avg_kitchen_min", "longest_kitchen_min", "top_items"],
        ...report.days.map((d) => [d.date, d.orders, d.sales.toFixed(2), d.tips.toFixed(2), d.collected.toFixed(2), d.breakfast, d.lunch, d.counter, d.online, d.toGo, d.forHere,
          d.kitchenDone, d.avgMinutes, d.longestMinutes, d.topItems.map((i) => `${i.name} x${i.qty}`).join("; ")]),
      ]);
      return;
    }
    const r = await postJson("/api/front-report", { pin: Front.pin, from, to, orders: true });
    if (!r.ok) return;
    saveCsv(`cafe-orders-${from}-to-${to}.csv`, [
      ["date", "time", "receipt", "meal", "where", "to_go", "paid", "net_sales", "tip", "collected", "kitchen_items", "kitchen_min", "wait_min", "items"],
      ...r.orders.map((o) => [o.date, new Date(o.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), o.receipt || "", o.meal,
        o.doordash ? "doordash" : o.online ? "online" : "counter", o.toGo ? "yes" : "no", o.paid ? "yes" : "no", o.net != null ? o.net.toFixed(2) : "", o.tip != null ? o.tip.toFixed(2) : "", o.sales != null ? o.sales.toFixed(2) : "",
        o.kitchenItems, o.kitchenMinutes, o.waitMinutes, o.items.map((i) => `${i.qty} ${i.name}${i.variation ? ` (${i.variation})` : ""}`).join("; ")]),
    ]);
  }

  Front.ranges = ranges; // Survey offers the same
  Front.tools.report = () => openReport();
  Front.acts["csv-days"] = () => csv("days");
  Front.acts["csv-orders"] = () => csv("orders");
})();
