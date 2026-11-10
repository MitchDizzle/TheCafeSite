// Manage -> Numbers -> Print a report: a day, a week or any dates
// (lib/report.js), shown as the page it prints and printed on one letter
// page; Email it sends the one shown, and "Emailed every day" says when the
// day's goes by itself and to whom (lib/report-mail.js). Loaded by front.html after its own script, which shares its helpers
// as window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, dialog } = Front;
  const at = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  let lastDay = null; // the last day with orders before today, from the kitchen PC
  let mail = null; // the emailed report's settings and last sends, from the kitchen PC
  let shown = null; // the dates of the report on screen, for Email it
  // Black & white (Mitch 2026-11-09: save the colour ink), remembered on this
  // device. It sets html.bw on the page (lib/report.js has its styles).
  let bw = false;
  try { bw = localStorage.getItem("report-bw") === "1"; } catch {}
  function paintBw() {
    const frame = document.getElementById("pr-frame");
    const doc = frame && frame.contentDocument;
    if (doc && doc.documentElement) doc.documentElement.classList.toggle("bw", bw);
  }
  function picks() {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    const today = ymd(now);
    return [
      ["Today", today, today],
      lastDay && lastDay !== today ? [`Last day open (${short(lastDay)})`, lastDay, lastDay] : null,
      ["This week", ymd(monday), today],
      ["Last week", ymd(addDays(monday, -7)), ymd(addDays(monday, -1))],
      ["This month", ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today],
      ["Last month", ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))],
    ].filter(Boolean);
  }

  function open(from, to) {
    screen({ title: "Print a report", back: true,
      body: `<div class="r-quick" id="pr-picks">${picks().map(([name, a, b]) =>
          `<button type="button" data-from="${a}" data-to="${b}"${a === from && b === to ? ' class="on"' : ""}>${esc(name)}</button>`).join("")}</div>
        <form class="pr-dates" id="pr-dates">
          <label class="m-field">From<input type="date" id="pr-from" value="${esc(from)}" required></label>
          <label class="m-field">To<input type="date" id="pr-to" value="${esc(to)}" required></label>
        </form>
        <label class="check m-check pr-bw"><input type="checkbox" id="pr-bw"${bw ? " checked" : ""}><span>Black &amp; white (saves the colour ink)</span></label>
        <p class="m-result" id="pr-msg" hidden></p>
        <div id="pr-out"><p class="m-busy">Making the report…</p></div>
        <details class="m-how pr-mail" id="pr-mail"><summary>Emailed every day</summary><div id="pr-mail-body">${mailHtml()}</div></details>`,
      buttons: [{ label: "Email it", act: "pr-email" }, { label: "Print", act: "pr-print", kind: "primary" }] });
    wireMail();
    dialog.querySelector("#pr-picks").addEventListener("click", (e) => {
      const b = e.target.closest("[data-from]");
      if (b) open(b.dataset.from, b.dataset.to);
    });
    dialog.querySelector("#pr-dates").addEventListener("change", () => {
      const a = document.getElementById("pr-from").value, b = document.getElementById("pr-to").value;
      if (a && b) open(a <= b ? a : b, a <= b ? b : a);
    });
    dialog.querySelector("#pr-bw").addEventListener("change", (e) => {
      bw = e.target.checked;
      try { localStorage.setItem("report-bw", bw ? "1" : "0"); } catch {}
      paintBw();
    });
    show(from, to);
  }

  // "Emailed every day": what goes when, to whom, and the form to change it.
  function mailHtml() {
    if (!mail) return `<p class="m-busy">Reading…</p>`;
    if (!mail.ok) return `<p class="m-error">${esc(mail.message)}</p>`;
    const s = mail.settings;
    const to = [mail.cafeEmail || "the cafe's email", ...s.to].map(esc).join(", ");
    let note;
    if (mail.mock) note = "Test mode: the report is never emailed.";
    else if (!mail.google) note = "<b>Not emailed yet:</b> it goes through the reservations Google script, and the kitchen PC has no reservationsKey. Print works without it.";
    else if (!mail.timeWords || (!s.daily && !s.weekly)) note = "<b>Not emailed by itself</b> (switched off below).";
    else note = `${[s.daily && `<b>The day's report</b> at ${esc(mail.timeWords)} on every day with orders`, s.weekly && `<b>the week's</b> on ${esc(mail.weekDay)} at the same time`].filter(Boolean).join(", and ")}, to ${to}, with the page attached as a PDF to print.${mail.dev ? " (Not by itself from this development copy: only the kitchen PC sends it.)" : ""}`;
    return `<p class="m-note">${note}</p>
      ${mail.google && !mail.chrome ? `<p class="m-note">No Chrome on the kitchen PC, so it goes as a page to open in a browser and print, not a PDF.</p>` : ""}
      ${mail.lastDay || mail.lastWeek ? `<p class="m-note">Last sent: ${[mail.lastDay && `${esc(short(mail.lastDay.date))}'s, ${esc(at(mail.lastDay.at))}`, mail.lastWeek && `the week of ${esc(short(mail.lastWeek.from))}, ${esc(at(mail.lastWeek.at))}`].filter(Boolean).join(" · ")}</p>` : ""}
      ${mail.error ? `<p class="m-error">Didn't go: ${esc(mail.error)} It's tried again every 10 minutes.</p>` : ""}
      <form id="pr-mail-form" class="pr-mail-form">
        <label class="check"><input type="checkbox" id="pm-daily"${s.daily ? " checked" : ""}><span>The day's report, every day with orders</span></label>
        <label class="check"><input type="checkbox" id="pm-weekly"${s.weekly ? " checked" : ""}><span>The week's report too, on ${esc(mail.weekDay)}</span></label>
        <label class="check"><input type="checkbox" id="pm-bw"${s.bw ? " checked" : ""}><span>Black &amp; white PDF (saves the colour ink)</span></label>
        <label class="m-field">At<input type="time" id="pm-time" value="${esc(s.time)}"></label>
        <label class="m-field">Also send to (one address a line, up to 5)<textarea id="pm-to" rows="3" autocomplete="off" spellcheck="false">${esc(s.to.join("\n"))}</textarea></label>
        <p class="m-note">It always goes to ${esc(mail.cafeEmail || "the cafe's email")} too.</p>
        <p class="m-error" id="pm-msg" hidden></p>
        <button type="submit" class="m-btn">Save</button>
      </form>`;
  }
  function wireMail() {
    const form = document.getElementById("pr-mail-form");
    if (form) form.addEventListener("submit", saveMail);
  }
  async function loadMail() {
    mail = await postJson("/api/front-mail-report", { pin: Front.pin });
    const body = document.getElementById("pr-mail-body");
    if (body) { body.innerHTML = mailHtml(); wireMail(); }
  }
  async function saveMail(e) {
    e.preventDefault();
    const msg = document.getElementById("pm-msg");
    const r = await postJson("/api/front-mail-report-save", { pin: Front.pin, settings: {
      daily: document.getElementById("pm-daily").checked,
      weekly: document.getElementById("pm-weekly").checked,
      bw: document.getElementById("pm-bw").checked,
      time: document.getElementById("pm-time").value,
      to: document.getElementById("pm-to").value,
    } });
    if (!r.ok) { msg.hidden = false; msg.textContent = r.message; return; }
    mail = r;
    const body = document.getElementById("pr-mail-body");
    if (body) { body.innerHTML = mailHtml() + `<p class="m-result good">✓ Saved.</p>`; wireMail(); }
  }

  async function show(from, to) {
    shown = null;
    const r = await postJson("/api/front-print-report", { pin: Front.pin, from, to });
    const out = document.getElementById("pr-out");
    if (!out) return; // closed meanwhile
    if (r.lastDay !== undefined && r.lastDay !== lastDay) {
      lastDay = r.lastDay;
      return open(from, to); // with its "Last day open" button
    }
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    shown = { from, to, title: r.title };
    out.innerHTML = `<iframe class="pr-frame" id="pr-frame" title="${esc(r.title)}"></iframe>`;
    const frame = document.getElementById("pr-frame");
    frame.addEventListener("load", paintBw);
    frame.srcdoc = r.html;
  }

  Front.acts["pr-print"] = () => {
    const frame = document.getElementById("pr-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  Front.acts["pr-email"] = async () => {
    const msg = document.getElementById("pr-msg");
    if (!msg) return;
    msg.hidden = false;
    msg.scrollIntoView({ block: "nearest" });
    if (!shown) { msg.className = "m-result bad"; msg.textContent = "No report shown to email."; return; }
    msg.className = "m-result";
    msg.textContent = `Emailing ${shown.title}…`;
    const r = await postJson("/api/front-mail-report-send", { pin: Front.pin, from: shown.from, to: shown.to });
    msg.className = `m-result ${r.ok ? "good" : "bad"}`;
    msg.textContent = `${r.ok ? "✓ " : ""}${r.message || (r.ok ? "Emailed." : "Didn't go.")}`;
  };

  // Opens on today, or the last day open when today has no orders yet.
  Front.tools["print-report"] = async () => {
    busy("Print a report", "Making the report…");
    mail = null;
    loadMail();
    const today = ymd(new Date());
    const r = await postJson("/api/front-print-report", { pin: Front.pin, from: today, to: today });
    lastDay = r.lastDay || null;
    if (!r.ok && lastDay) return open(lastDay, lastDay);
    open(today, today);
  };
})();
