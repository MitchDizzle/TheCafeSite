// Manage -> Numbers -> Emailed report: the day's and the week's report
// (lib/report.js), shown here to read or print, emailed now, and when it's
// emailed by itself and to whom. Loaded by front.html after its own script,
// which shares its helpers as window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result, dialog } = Front;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const at = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

  let kind = "day";
  let date = ymd(new Date());

  function statusHtml(s) {
    const set = s.settings;
    const to = [s.cafeEmail || "the cafe's email", ...set.to].map(esc).join(", ");
    const when = !s.timeWords || (!set.daily && !set.weekly) ? "<b>Not emailed by itself</b> (switched off below)."
      : `${[set.daily && "<b>The day's report</b> at " + esc(s.timeWords) + " on every day with orders", set.weekly && `<b>the week's</b> on ${esc(s.weekDay)} at the same time`].filter(Boolean).join(", and ")}, to ${to}.`;
    if (s.mock) return `<p class="m-note">Test mode: the report is made from the test history and never emailed.</p>`;
    if (!s.google) return `<p class="m-note"><b>Not emailed yet:</b> emailing goes through the reservations Google script, and the kitchen PC has no reservationsKey. The report can still be shown and printed here.</p>`;
    return `<p class="m-note">${when}${s.dev ? " (Not from this development copy: only the kitchen PC sends it by itself.)" : ""}</p>
      ${s.lastDay || s.lastWeek ? `<p class="m-note">Last sent: ${[s.lastDay && `${esc(dayName(s.lastDay.date))}'s, ${esc(at(s.lastDay.at))}`, s.lastWeek && `the week of ${esc(dayName(s.lastWeek.from))}, ${esc(at(s.lastWeek.at))}`].filter(Boolean).join(" · ")}</p>` : ""}
      ${s.error ? `<p class="m-error">Didn't go: ${esc(s.error)} It's tried again every 10 minutes.</p>` : ""}`;
  }

  async function open() {
    busy("Emailed report", "Reading…");
    const s = await postJson("/api/front-mail-report", { pin: Front.pin });
    if (!s.ok) return result("Emailed report", s);
    const set = s.settings;
    screen({ title: "Emailed report", back: true,
      body: `${statusHtml(s)}
        <div class="r-quick" id="mr-kind">
          <button type="button" data-kind="day"${kind === "day" ? ' class="on"' : ""}>The day</button>
          <button type="button" data-kind="week"${kind === "week" ? ' class="on"' : ""}>The week</button>
        </div>
        <label class="m-field mr-date">${kind === "week" ? "A day in the week" : "Day"}<input type="date" id="mr-date" value="${esc(date)}" max="${esc(s.today)}"></label>
        <div id="mr-out"><p class="m-busy">Making the report…</p></div>
        <details class="m-how mr-set">
          <summary>When it's emailed, and to whom</summary>
          <form id="mr-form" class="mr-form">
            <label class="check"><input type="checkbox" id="mr-daily"${set.daily ? " checked" : ""}><span>The day's report, every day with orders</span></label>
            <label class="check"><input type="checkbox" id="mr-weekly"${set.weekly ? " checked" : ""}><span>The week's report, on ${esc(s.weekDay)} (the week's last open day)</span></label>
            <label class="m-field">At<input type="time" id="mr-time" value="${esc(set.time)}"></label>
            <label class="m-field">Also send to (one address a line, up to 5)<textarea id="mr-to" rows="3" autocomplete="off" spellcheck="false">${esc(set.to.join("\n"))}</textarea></label>
            <p class="m-note">It always goes to ${esc(s.cafeEmail || "the cafe's email")} too.</p>
            <p class="m-error" id="mr-msg" hidden></p>
            <button type="submit" class="m-btn">Save</button>
          </form>
        </details>`,
      buttons: [{ label: "Print", act: "mr-print" }, { label: "Email it now", act: "mr-send", kind: "primary" }] });
    dialog.querySelector("#mr-kind").addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]");
      if (!b || b.dataset.kind === kind) return;
      kind = b.dataset.kind;
      open();
    });
    dialog.querySelector("#mr-date").addEventListener("change", (e) => {
      if (!e.target.value) return;
      date = e.target.value;
      show();
    });
    dialog.querySelector("#mr-form").addEventListener("submit", save);
    show();
  }

  async function show() {
    const out = document.getElementById("mr-out");
    if (!out) return;
    out.innerHTML = `<p class="m-busy">Making the report…</p>`;
    const r = await postJson("/api/front-mail-report-doc", { pin: Front.pin, kind, date });
    if (!document.getElementById("mr-out")) return; // closed meanwhile
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
    out.innerHTML = `<iframe class="mr-frame" id="mr-frame" title="${esc(r.subject)}"></iframe>`;
    document.getElementById("mr-frame").srcdoc = r.html;
  }

  async function save(e) {
    e.preventDefault();
    const msg = document.getElementById("mr-msg");
    const r = await postJson("/api/front-mail-report-save", { pin: Front.pin, settings: {
      daily: document.getElementById("mr-daily").checked,
      weekly: document.getElementById("mr-weekly").checked,
      time: document.getElementById("mr-time").value,
      to: document.getElementById("mr-to").value,
    } });
    if (!r.ok) { msg.hidden = false; msg.textContent = r.message; return; }
    open();
  }

  Front.acts["mr-print"] = () => {
    const frame = document.getElementById("mr-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  Front.acts["mr-send"] = async () => {
    const what = kind === "week" ? `the week of ${dayName(date)}` : `${dayName(date)}'s report`;
    busy("Emailed report", `Emailing ${what}…`);
    const r = await postJson("/api/front-mail-report-send", { pin: Front.pin, kind, date });
    result("Emailed report", r);
  };

  Front.tools["mail-report"] = () => { date = ymd(new Date()); open(); };
})();
