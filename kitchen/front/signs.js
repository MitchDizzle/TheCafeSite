// Manage -> Signs: the day's counter signs as letter pages, shown as they
// print (lib/signs.js): today's special sides, the special & soup, and the
// dessert fridge. Nothing is typed here: the plate, sides and soup are the
// day's in Specials, the desserts are Square's as Desserts has them. First
// pick the day and which signs (Mitch 2026-11-18: only those are made, so
// there's no wait for ones not needed), then Make signs; there, tick which
// desserts are in the fridge, then Print.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;
  const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const PAGES = [["sides", "Special sides"], ["day", "Special & soup"], ["fridge", "Dessert fridge"], ["week", "Week's specials, two to a page"]];

  // Which pages to print and black & white for the colour one, remembered
  // on this device.
  const KEY = "signs-print";
  // week: the week's specials handout (Mitch 2026-11-18), for "this" or "next" week.
  let prefs = { sides: true, day: true, fridge: true, week: false, whichWeek: "next", bw: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

  let shown = null; // the last answer from the kitchen PC
  let days = null;  // { date, today, days } for the pick screen

  // The ticks, put on the pages in the frame: a page not ticked is hidden,
  // there and in print.
  function paint() {
    const frame = document.getElementById("sg-frame");
    const doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    const html = doc.documentElement.classList;
    for (const [page] of PAGES) html.toggle(`no-${page}`, !prefs[page]);
    html.toggle("bw", prefs.bw);
    // A page shown again is measured again, so it still fits its sheet.
    if (frame.contentWindow && frame.contentWindow.fitSigns) frame.contentWindow.fitSigns();
  }

  // The pick screen: the day, which signs, black & white. Nothing is read
  // from Square until Make signs.
  function pick() {
    const r = days;
    const dayPick = r.days.length > 1 ? `<div class="r-quick" id="sg-days">${r.days.map((d) =>
      `<button type="button" data-date="${d}"${d === r.date ? ' class="on"' : ""}>${d === r.today ? "Today" : esc(short(d))}</button>`).join("")}</div>` : "";
    const which = PAGES.map(([page, name]) => `<label class="check"><input type="checkbox" data-page="${page}"${prefs[page] ? " checked" : ""}><span>${name}</span></label>`).join("");
    screen({ title: "Signs", back: true,
      body: `${dayPick}
        <p class="m-note">Which signs to make?</p>
        <div class="sg-which" id="sg-which">${which}
          <label class="check"><input type="checkbox" id="sg-bw"${prefs.bw ? " checked" : ""}><span>Special &amp; soup in black &amp; white</span></label></div>
        <div class="r-quick" id="sg-week"${prefs.week ? "" : " hidden"}><span class="m-note">Week's specials for:</span>
          ${[["this", "This week"], ["next", "Next week"]].map(([v, n]) => `<button type="button" data-week="${v}"${prefs.whichWeek === v ? ' class="on"' : ""}>${n}</button>`).join("")}</div>`,
      buttons: [{ label: "Make signs", act: "sg-make", kind: "primary" }] });
    document.getElementById("sg-week").addEventListener("click", (e) => {
      const b = e.target.closest("[data-week]");
      if (!b) return;
      prefs.whichWeek = b.dataset.week;
      keep();
      for (const x of e.currentTarget.querySelectorAll("[data-week]")) x.classList.toggle("on", x === b);
    });
    document.getElementById("sg-days")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-date]");
      if (b) { days.date = b.dataset.date; pick(); }
    });
    document.getElementById("sg-which").addEventListener("change", (e) => {
      if (e.target.dataset.page) prefs[e.target.dataset.page] = e.target.checked;
      else prefs.bw = e.target.checked;
      keep();
      document.getElementById("sg-week").hidden = !prefs.week;
    });
  }

  async function make() {
    const pages = PAGES.map(([p]) => p).filter((p) => prefs[p]);
    if (!pages.length) return result("Signs", { ok: false, message: "Tick at least one sign to make." });
    busy("Signs", "Making the signs…");
    const r = await postJson("/api/front-signs", { pin: Front.pin, date: days.date, pages, week: prefs.whichWeek });
    if (!r.ok) return result("Signs", r);
    draw(r);
  }

  function draw(r) {
    shown = r;
    const made = PAGES.filter(([page]) => r.made.includes(page));
    const which = made.map(([page, name]) => `<label class="check"><input type="checkbox" data-page="${page}"${prefs[page] && r.has[page] ? " checked" : ""}${r.has[page] ? "" : " disabled"}><span>${name}</span></label>`).join("");
    const fridge = r.fridge.length ? `<details class="m-how sg-fridge" id="sg-fridge"><summary>What's in the dessert fridge (${r.fridge.filter((f) => f.on).length} on the sign)</summary>
        <p class="m-note">Tick what's in the fridge. Square's count decides; a tick or untick here is for today only, and tomorrow the sign follows Square again. To change it for good, set the count in Desserts.</p>
        <div class="sg-fridge-rows">${r.fridge.map((f) => `<label class="check"><input type="checkbox" data-key="${esc(f.key)}"${f.on ? " checked" : ""}><span>${esc(f.name)}${f.price == null ? "" : ` <small>$${f.price.toFixed(2)}</small>`}${f.out ? " <small>· Square says 0</small>" : ""}</span></label>`).join("")}</div>
      </details>` : "";
    screen({ title: "Signs", back: true,
      body: `<p class="m-note">${r.date === r.today ? "Today" : esc(short(r.date))}</p>
        <div class="sg-which" id="sg-which">${which}
          <label class="check"><input type="checkbox" id="sg-bw"${prefs.bw ? " checked" : ""}><span>Special &amp; soup in black &amp; white</span></label></div>
        ${fridge}
        ${r.notes.map((n) => `<p class="m-note">${esc(n)}</p>`).join("")}
        ${r.html ? `<iframe class="pr-frame" id="sg-frame" title="The signs, as they print"></iframe>` : ""}
        <p class="m-note">Letter paper, a sign a page. A wrong plate, side or soup is fixed in Specials; a dessert's name or price in Desserts.</p>`,
      buttons: [{ label: "Change signs", act: "sg-pick" }, ...(r.html ? [{ label: "Print", act: "sg-print", kind: "primary" }] : [])] });
    const frame = document.getElementById("sg-frame");
    if (frame) {
      frame.addEventListener("load", paint);
      frame.srcdoc = r.html;
    }
    document.getElementById("sg-which").addEventListener("change", (e) => {
      if (e.target.dataset.page) prefs[e.target.dataset.page] = e.target.checked;
      else prefs.bw = e.target.checked;
      keep();
      paint();
    });
    const box = document.getElementById("sg-fridge");
    if (box) box.addEventListener("change", async () => {
      // The ticks as they stand; the kitchen PC keeps them and remakes the page.
      const on = [...box.querySelectorAll("[data-key]:checked")].map((i) => i.dataset.key);
      for (const i of box.querySelectorAll("input")) i.disabled = true;
      const next = await postJson("/api/front-signs", { pin: Front.pin, date: r.date, fridge: on, pages: r.made, week: r.week });
      if (!document.getElementById("sg-which")) return; // closed meanwhile
      if (!next.ok) return result("Signs", next);
      draw(next);
      const again = document.getElementById("sg-fridge");
      if (again) again.open = true;
    });
  }

  // Just the days to pick from (no pages, so nothing from Square: quick).
  async function open() {
    busy("Signs", "One moment…");
    const r = await postJson("/api/front-signs", { pin: Front.pin, pages: [] });
    if (!r.ok) return result("Signs", r);
    days = { date: r.date, today: r.today, days: r.days };
    pick();
  }

  Front.acts["sg-make"] = make;
  Front.acts["sg-pick"] = () => (days ? pick() : open());

  Front.acts["sg-print"] = () => {
    const frame = document.getElementById("sg-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  Front.tools.signs = () => open();
})();
