// Manage -> Signs: the day's counter signs as letter pages, shown as they
// print (lib/signs.js): today's special sides, the special & soup, and the
// dessert fridge. Nothing is typed here: the plate, sides and soup are the
// day's in Specials, the desserts are Square's as Desserts has them. Tick
// which pages to print and which desserts are in the fridge, then Print.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;
  const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const PAGES = [["sides", "Special sides"], ["day", "Special & soup"], ["fridge", "Dessert fridge"]];

  // Which pages to print and black & white for the colour one, remembered
  // on this device.
  const KEY = "signs-print";
  let prefs = { sides: true, day: true, fridge: true, bw: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

  let shown = null; // the last answer from the kitchen PC

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

  function draw(r) {
    shown = r;
    const dayPick = r.days.length > 1 ? `<div class="r-quick" id="sg-days">${r.days.map((d) =>
      `<button type="button" data-date="${d}"${d === r.date ? ' class="on"' : ""}>${d === r.today ? "Today" : esc(short(d))}</button>`).join("")}</div>` : "";
    const which = PAGES.map(([page, name]) => `<label class="check"><input type="checkbox" data-page="${page}"${prefs[page] && r.has[page] ? " checked" : ""}${r.has[page] ? "" : " disabled"}><span>${name}</span></label>`).join("");
    const fridge = r.fridge.length ? `<details class="m-how sg-fridge" id="sg-fridge"><summary>What's in the dessert fridge (${r.fridge.filter((f) => f.on).length} on the sign)</summary>
        <p class="m-note">Tick what's in the fridge. Square's count decides until you tick or untick one; that one then stays as you left it.</p>
        <div class="sg-fridge-rows">${r.fridge.map((f) => `<label class="check"><input type="checkbox" data-key="${esc(f.key)}"${f.on ? " checked" : ""}><span>${esc(f.name)}${f.price == null ? "" : ` <small>$${f.price.toFixed(2)}</small>`}${f.out ? " <small>· Square says 0</small>" : ""}</span></label>`).join("")}</div>
      </details>` : "";
    screen({ title: "Signs", back: true,
      body: `${dayPick}
        <div class="sg-which" id="sg-which">${which}
          <label class="check"><input type="checkbox" id="sg-bw"${prefs.bw ? " checked" : ""}><span>Special &amp; soup in black &amp; white</span></label></div>
        ${fridge}
        ${r.notes.map((n) => `<p class="m-note">${esc(n)}</p>`).join("")}
        ${r.html ? `<iframe class="pr-frame" id="sg-frame" title="The signs, as they print"></iframe>` : ""}
        <p class="m-note">Letter paper, a sign a page. A wrong plate, side or soup is fixed in Specials; a dessert's name or price in Desserts.</p>`,
      buttons: r.html ? [{ label: "Print", act: "sg-print", kind: "primary" }] : [] });
    const frame = document.getElementById("sg-frame");
    if (frame) {
      frame.addEventListener("load", paint);
      frame.srcdoc = r.html;
    }
    const days = document.getElementById("sg-days");
    if (days) days.addEventListener("click", (e) => {
      const b = e.target.closest("[data-date]");
      if (b) open(b.dataset.date);
    });
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
      const next = await postJson("/api/front-signs", { pin: Front.pin, date: r.date, fridge: on });
      if (!document.getElementById("sg-which")) return; // closed meanwhile
      if (!next.ok) return result("Signs", next);
      draw(next);
      const again = document.getElementById("sg-fridge");
      if (again) again.open = true;
    });
  }

  async function open(date) {
    busy("Signs", "Making the signs…");
    const r = await postJson("/api/front-signs", { pin: Front.pin, date });
    if (!r.ok) return result("Signs", r);
    draw(r);
  }

  Front.acts["sg-print"] = () => {
    const frame = document.getElementById("sg-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  Front.tools.signs = () => open();
})();
