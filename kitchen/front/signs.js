// Manage -> Signs: the day's counter signs as letter pages, shown as they
// print (lib/signs.js): today's special sides, the special & soup, and the
// dessert fridge; and for this week or next, the week's specials handout,
// the colour counter sign and the Facebook post, which Picture for Facebook
// also makes as its picture to save and post, with its caption to copy
// (Mitch 2026-11-20). Nothing is typed here: the plate, sides and soup are the
// day's in Specials, the desserts are Square's as Desserts has them. First
// pick the day and which signs (Mitch 2026-11-18: only those are made, so
// there's no wait for ones not needed), then Make signs; there, tick which
// desserts are in the fridge, then Print. Square is read once and kept
// (Mitch 2026-11-23); Refresh from Square reads it again, after a change on
// the POS.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;
  const short = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const PAGES = [["sides", "Special sides"], ["day", "Special & soup"], ["fridge", "Dessert fridge"],
    ["week", "Week's specials, two to a page"], ["counter", "Week's specials, colour counter sign"], ["post", "Facebook post"]];
  // The pages made for a week rather than a day.
  const WEEKLY = ["week", "counter", "post"];
  const weekly = () => WEEKLY.some((p) => prefs[p]);

  // Which pages to print and black & white for the colour one, remembered
  // on this device.
  const KEY = "signs-print";
  // week: the week's specials handout (Mitch 2026-11-18); counter: the
  // colour counter sign and post: the Facebook post (Mitch 2026-11-20); all
  // three for "this" or "next" week.
  let prefs = { sides: true, day: true, fridge: true, week: false, counter: false, post: false, whichWeek: "next", bw: false };
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
        <div class="r-quick" id="sg-week"${weekly() ? "" : " hidden"}><span class="m-note">Week's specials for:</span>
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
      document.getElementById("sg-week").hidden = !weekly();
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

  // When the pages were read from Square, for the note by Refresh.
  const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // A row of the fridge's ticks: a dessert kind or a drink.
  const tick = (f) => `<label class="check"><input type="checkbox" data-key="${esc(f.key)}"${f.on ? " checked" : ""}><span>${esc(f.name)}${f.price == null ? "" : ` <small>$${f.price.toFixed(2)}</small>`}${f.out ? " <small>· Square says 0</small>" : ""}</span></label>`;

  function draw(r) {
    shown = r;
    const made = PAGES.filter(([page]) => r.made.includes(page));
    const which = made.map(([page, name]) => `<label class="check"><input type="checkbox" data-page="${page}"${prefs[page] && r.has[page] ? " checked" : ""}${r.has[page] ? "" : " disabled"}><span>${name}</span></label>`).join("");
    const fridge = r.fridge.length ? `<details class="m-how sg-fridge" id="sg-fridge"><summary>What's in the dessert fridge (${r.fridge.filter((f) => f.on).length} on the sign)</summary>
        <p class="m-note">Tick what's in the fridge. Square's count decides; a tick or untick here is for today only, and tomorrow the sign follows Square again. To change it for good, set the count in Desserts.</p>
        <div class="sg-fridge-rows">${r.fridge.filter((f) => !f.drink).map(tick).join("")}</div>
        ${r.fridge.some((f) => f.drink) ? `<p class="m-note"><b>Drinks</b> go under Drinks at the foot of the sign, at Square's price. A drink stays ticked until you untick it.</p>
        <div class="sg-fridge-rows">${r.fridge.filter((f) => f.drink).map(tick).join("")}</div>` : ""}
      </details>` : "";
    // The Facebook post's caption to copy, and its picture to save.
    const post = r.has.post ? `<div class="sg-post">
        <p class="m-note"><b>Facebook post:</b> Picture for Facebook makes it as a picture to save and post (a few seconds). Its caption is here to copy.</p>
        <textarea class="pp-caption" id="sg-caption" rows="6" aria-label="The post's caption">${esc(r.caption || "")}</textarea>
        <div class="sg-post-btns"><button type="button" class="m-btn" data-act="sg-copy">Copy caption</button><button type="button" class="m-btn primary" data-act="sg-picture">Picture for Facebook</button></div>
      </div>` : "";
    const forDay = r.made.some((p) => !WEEKLY.includes(p));
    const forWeek = r.made.some((p) => WEEKLY.includes(p));
    const when = [forDay ? (r.date === r.today ? "Today" : short(r.date)) : "", forWeek ? `${r.week === "this" ? "This" : "Next"} week's specials` : ""].filter(Boolean).join(" · ");
    screen({ title: "Signs", back: true,
      body: `<p class="m-note">${esc(when)}</p>
        <div class="sg-which" id="sg-which">${which}
          ${r.made.includes("day") ? `<label class="check"><input type="checkbox" id="sg-bw"${prefs.bw ? " checked" : ""}><span>Special &amp; soup in black &amp; white</span></label>` : ""}</div>
        ${fridge}
        ${post}
        ${r.notes.map((n) => `<p class="m-note">${esc(n)}</p>`).join("")}
        ${r.html ? `<iframe class="pr-frame" id="sg-frame" title="The signs, as they print"></iframe>` : ""}
        <p class="m-note">Letter paper, a sign a page. A wrong plate, side or soup is fixed in Specials; a dessert's name or price in Desserts.</p>
        ${r.squareAt ? `<p class="m-note">From Square at ${esc(clock(r.squareAt))}. Changed something on the POS since? Refresh from Square.</p>` : ""}`,
      buttons: [{ label: "Change signs", act: "sg-pick" }, ...(r.squareAt ? [{ label: "Refresh from Square", act: "sg-refresh" }] : []),
        ...(r.html ? [{ label: "Print", act: "sg-print", kind: "primary" }] : [])] });
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
    if (box) box.addEventListener("change", () => {
      // The ticks never lock (Mitch 2026-11-23: one at a time was slow):
      // tick as many as you like, and a moment after the last the kitchen
      // PC keeps them and remakes the pages, from what it read from Square.
      box.querySelector("summary").textContent = `What's in the dessert fridge (${box.querySelectorAll("[data-key]:checked").length} on the sign)`;
      clearTimeout(fridgeTimer);
      fridgeTimer = setTimeout(sendFridge, 600);
    });
  }

  // The fridge's ticks to the kitchen PC, one request at a time: ticks made
  // while one is on its way go in the next, and only the last answer is
  // shown. The pages are swapped in place, so the list stays as it is.
  let fridgeTimer = null;
  let fridgeSending = false;
  let fridgeAgain = false;
  async function sendFridge() {
    if (fridgeSending) { fridgeAgain = true; return; }
    const box = document.getElementById("sg-fridge");
    if (!box || !shown) return;
    const r = shown;
    fridgeSending = true;
    const on = [...box.querySelectorAll("[data-key]:checked")].map((i) => i.dataset.key);
    const next = await postJson("/api/front-signs", { pin: Front.pin, date: r.date, fridge: on, pages: r.made, week: r.week });
    fridgeSending = false;
    if (document.getElementById("sg-fridge") !== box) return; // closed or remade meanwhile
    if (fridgeAgain) { fridgeAgain = false; return sendFridge(); }
    if (!next.ok) return result("Signs", next);
    const frame = document.getElementById("sg-frame");
    if (frame && next.html && next.has.fridge === r.has.fridge) {
      shown = next;
      frame.srcdoc = next.html;
      return;
    }
    // The fridge page came or went: the whole screen, list open.
    draw(next);
    const again = document.getElementById("sg-fridge");
    if (again) again.open = true;
  }

  async function refresh() {
    if (!shown) return open();
    const r = shown;
    busy("Signs", "Reading Square again…");
    const next = await postJson("/api/front-signs", { pin: Front.pin, date: r.date, pages: r.made, week: r.week, fresh: true });
    if (!next.ok) return result("Signs", next);
    draw(next);
  }

  // Just the days to pick from (no pages, so nothing from Square: quick).
  async function open() {
    busy("Signs", "One moment…");
    const r = await postJson("/api/front-signs", { pin: Front.pin, pages: [] });
    if (!r.ok) return result("Signs", r);
    days = { date: r.date, today: r.today, days: r.days };
    pick();
  }

  // The post as its picture, made by the kitchen PC, with its caption: to
  // save to the phone's photos (press and hold) or download, and post.
  let picture = null;
  async function showPicture() {
    if (!shown) return open();
    busy("Signs", "Making the picture…");
    const p = await postJson("/api/front-signs-post", { pin: Front.pin, week: shown.week });
    picture = p.ok ? p : null;
    screen({ title: "Facebook post", back: true,
      body: p.ok ? `<div class="pp-result">
          <img src="${p.png}" alt="The week's specials post">
          <p class="m-note">Press and hold the picture to save it to your photos, or use Download.</p>
          <label class="m-field">Caption<textarea class="pp-caption" id="sg-caption" rows="7">${esc(p.caption || "")}</textarea></label>
        </div>` : `<p class="m-result bad">${esc(p.message || "The picture couldn't be made.")}</p>`,
      buttons: [{ label: "Back to signs", act: "sg-back" }, ...(p.ok ? [{ label: "Copy caption", act: "sg-copy" }, { label: "Download", act: "sg-download", kind: "primary" }] : [])] });
  }

  Front.acts["sg-make"] = make;
  Front.acts["sg-refresh"] = refresh;
  Front.acts["sg-picture"] = showPicture;
  Front.acts["sg-back"] = () => (shown ? draw(shown) : open());
  Front.acts["sg-copy"] = () => {
    // http, so no clipboard API: select the text and copy it the old way.
    const ta = document.getElementById("sg-caption");
    if (!ta) return;
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand && document.execCommand("copy");
    for (const b of document.querySelectorAll('[data-act="sg-copy"]')) b.textContent = ok ? "Copied" : "Press and hold to copy";
  };
  Front.acts["sg-download"] = () => {
    if (!picture) return;
    const a = Object.assign(document.createElement("a"), { href: picture.png, download: picture.file });
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  Front.acts["sg-pick"] = () => (days ? pick() : open());

  Front.acts["sg-print"] = () => {
    const frame = document.getElementById("sg-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  Front.tools.signs = () => open();
})();
