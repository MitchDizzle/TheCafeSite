// Manage -> Numbers -> Print a report: a day, a week or any dates
// (lib/report.js), shown as the page it prints and printed on one letter
// page. Loaded by front.html after its own script, which shares its helpers
// as window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, dialog } = Front;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  let lastDay = null; // the last day with orders before today, from the kitchen PC
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
        <div id="pr-out"><p class="m-busy">Making the report…</p></div>`,
      buttons: [{ label: "Print", act: "pr-print", kind: "primary" }] });
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

  async function show(from, to) {
    const r = await postJson("/api/front-print-report", { pin: Front.pin, from, to });
    const out = document.getElementById("pr-out");
    if (!out) return; // closed meanwhile
    if (r.lastDay !== undefined && r.lastDay !== lastDay) {
      lastDay = r.lastDay;
      return open(from, to); // with its "Last day open" button
    }
    if (!r.ok) { out.innerHTML = `<p class="m-error">${esc(r.message)}</p>`; return; }
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

  // Opens on today, or the last day open when today has no orders yet.
  Front.tools["print-report"] = async () => {
    busy("Print a report", "Making the report…");
    const today = ymd(new Date());
    const r = await postJson("/api/front-print-report", { pin: Front.pin, from: today, to: today });
    lastDay = r.lastDay || null;
    if (!r.ok && lastDay) return open(lastDay, lastDay);
    open(today, today);
  };
})();
