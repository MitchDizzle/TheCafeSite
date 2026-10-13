// Manage -> Specials: today's specials and the days ahead.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, fmtTime, postJson, screen, busy, result, listWords } = Front;

  // ---- Specials: today and the days ahead, on one screen (it was two,
  // Today's specials and Plan the week, until 2026-10-09). Each morning the
  // kitchen PC puts that day's into Square by itself; saving today puts it in
  // straight away. Days the website lists fill in by themselves, and a day
  // changed here is kept as typed: the website no longer changes it. Today's
  // names are read from Square as it is now, so a change made in the
  // Dashboard isn't saved over by an old plan. The words for the photo are
  // kept apart from the day, so writing them doesn't stop the website
  // updating it.
  async function openPlan() {
    busy("Specials", "Reading the specials and Square…");
    const r = await postJson("/api/front-plan", { pin: Front.pin });
    if (!r.ok) return result("Specials", r);
    const words = (date, opts) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", opts);
    // The plate's item (Lunch Special): the one its sides go with.
    const isPlate = (key) => /special/i.test(key) && !/soup|salad/i.test(key);
    // Salad of the Day is decided on the day, so it's only on today (and on
    // any later day that already has one).
    const isSalad = (key) => /salad/i.test(key);
    // What Photo post says under the photo when nothing's been written.
    const photoWords = (plan) => plan && plan.anySide ? "With choice of side"
      : plan && plan.sides && plan.sides.length ? `Served with ${listWords(plan.sides.map((x) => x.toLowerCase()))}` : "";
    // One line for the folded row: "Meatloaf with mashed potatoes · Baked Potato Soup".
    const summary = (plan) => plan ? r.items.map((it) => {
      const text = plan.items[it.key] && plan.items[it.key].today;
      if (!text || !isPlate(it.key)) return text;
      if (plan.anySide) return `${text} with choice of side`;
      return plan.sides && plan.sides.length ? `${text} with ${plan.sides.join(", ")}` : text;
    }).filter(Boolean).join(" · ") : "";
    const status = (d) => {
      if (d.date !== r.today) return "";
      if (d.applied && d.applied.at && d.applied.sig !== "clear") return `<p class="d-status good">✓ In Square since ${fmtTime(d.applied.at)}</p>`;
      if (d.applied && d.applied.error) return `<p class="d-status bad">Not in Square yet: ${esc(d.applied.error)}. The board tries again every few minutes.</p>`;
      return d.plan ? `<p class="d-status">Going into Square now.</p>` : "";
    };
    const sidesHtml = (plan, date) => {
      const any = !!(plan && plan.anySide);
      return `<fieldset class="d-sides">
        <legend>Comes with</legend>
        <label class="check"><input type="radio" name="sides-${date}" value="any"${any ? " checked" : ""}><span>Choice of side</span></label>
        <label class="check"><input type="radio" name="sides-${date}" value="set"${any ? "" : " checked"}><span>These sides (commas between)</span></label>
        <input type="text" data-field="sides" aria-label="The sides" value="${esc(((plan && plan.sides) || []).join(", "))}" maxlength="160" autocomplete="off"
          placeholder="e.g. Mashed potatoes & gravy, green beans"${any ? " disabled" : ""}>
      </fieldset>`;
    };
    const dayHtml = (d) => {
      const plan = d.plan;
      const isToday = d.date === r.today;
      const tag = plan ? (plan.from === "site" ? `<span class="d-tag site">From the website</span>` : `<span class="d-tag front">Set here</span>`) : "";
      const what = summary(plan);
      const shown = r.items.filter((it) => !isSalad(it.key) || isToday || (plan && plan.items[it.key]));
      const planned = (it) => (plan && plan.items[it.key]) || { today: "", prices: {} };
      return `<details class="m-day${isToday ? " today" : ""}" data-date="${d.date}"${isToday ? " open" : ""}>
        <summary>
          <span class="d-date">${isToday ? '<span class="d-tag now">Today</span> ' : ""}${esc(words(d.date, { weekday: "short", month: "short", day: "numeric" }))}${tag}</span>
          <span class="d-what${what ? "" : " none"}">${esc(what || "Nothing planned")}</span>
        </summary>
        <div class="d-body">
          ${status(d)}
          ${shown.map((it) => {
            // Today: what Square has now, when it has a name in it.
            const name = isToday && r.live && r.live[it.key] ? r.live[it.key] : planned(it).today || "";
            return `<div class="d-item" data-key="${esc(it.key)}">
              <label class="m-field">${esc(it.name)}
                <input type="text" data-field="today" value="${esc(name)}" maxlength="60" autocomplete="off"
                  placeholder="${/soup/i.test(it.key) ? "e.g. Chicken Dumpling" : isSalad(it.key) ? "e.g. Cobb" : "e.g. Meatloaf"}"></label>
              ${isPlate(it.key) ? sidesHtml(plan, d.date) : ""}
            </div>`;
          }).join("")}
          <label class="m-field">Words under the photo, for Photo post
            <textarea data-field="desc" rows="2" maxlength="200" placeholder="${esc(photoWords(plan) || "e.g. Served with mashed potatoes & gravy")}">${esc((d.note && d.note.description) || "")}</textarea></label>
          <details class="d-prices">
            <summary>Prices <small>blank keeps the price Square has</small></summary>
            ${shown.map((it) => `<div class="d-price-item" data-key="${esc(it.key)}">
              <p class="d-price-name">${esc(it.name)}</p>
              <div class="m-prices">${it.sizes.map((sz) => `<label class="m-price" data-size="${esc(sz.size)}">
                <span>${esc(sz.size || "Price")}</span>
                <span class="m-money">$<input type="text" inputmode="decimal" data-field="price" value="${esc((planned(it).prices || {})[sz.size] || "")}"
                  placeholder="${esc(sz.price || "at the till")}" aria-label="${esc(`${it.name} ${sz.size || ""} price`)}"></span>
              </label>`).join("")}</div>
            </div>`).join("")}
          </details>
          <button type="button" class="d-clear" data-clear>Clear this day</button>
        </div>
      </details>`;
    };
    const site = r.site.url ? (r.site.error
      ? `<p class="m-site m-error">Couldn't read the website's specials (${esc(r.site.error)}). Days already here are kept.</p>`
      : `<p class="m-site m-note">The website's specials were read at ${fmtTime(r.site.checkedAt)}.</p>`) : "";
    screen({ title: "Specials", back: true,
      body: `<p class="m-note">Each morning the kitchen PC puts that day's specials into Square by itself. Saving today puts it in now.
        Days the website lists fill in on their own; a day changed here stays as you typed it.</p>
        <p class="m-note">Comes with sets Side 1 and Side 2 on Lunch Special too: each side is picked for the counter already and can be swapped for a deli salad. Choice of side, or two sides with "or" between ("tossed salad or cooked broccoli"), picks Chef's Choice.</p>
        ${site}
        ${r.missing.length ? `<p class="m-error">Not found in Square under these names: ${esc(r.missing.join(", "))}.</p>` : ""}
        <form id="m-plan">${r.days.map(dayHtml).join("")}</form>`,
      buttons: [{ label: "Save", submit: "m-plan", kind: "primary" }] });
    const form = document.getElementById("m-plan");
    // What each day held when opened, so only the days changed are sent: a
    // day from the website that nobody touched stays the website's. The
    // photo's words are compared on their own, and saved on their own.
    const read = (day) => {
      const items = {};
      for (const el of day.querySelectorAll(".d-item")) {
        items[el.dataset.key] = { today: el.querySelector('[data-field="today"]').value.trim(), prices: {} };
      }
      for (const el of day.querySelectorAll(".d-price-item")) {
        const it = items[el.dataset.key] || (items[el.dataset.key] = { today: "", prices: {} });
        for (const row of el.querySelectorAll("[data-size]")) it.prices[row.dataset.size] = row.querySelector("input").value.trim();
      }
      const any = !!(day.querySelector('input[type="radio"][value="any"]:checked'));
      const sidesBox = day.querySelector('[data-field="sides"]');
      const sides = any || !sidesBox ? [] : sidesBox.value.split(",").map((x) => x.trim()).filter(Boolean);
      return { items, sides, anySide: any };
    };
    const readWords = (day) => (day.querySelector('[data-field="desc"]').value || "").trim();
    const before = new Map([...form.querySelectorAll(".m-day")].map((day) => [day.dataset.date, JSON.stringify(read(day))]));
    const beforeWords = new Map([...form.querySelectorAll(".m-day")].map((day) => [day.dataset.date, readWords(day)]));
    const mark = (day) => day.classList.toggle("edited",
      JSON.stringify(read(day)) !== before.get(day.dataset.date) || readWords(day) !== beforeWords.get(day.dataset.date));
    form.addEventListener("input", (e) => mark(e.target.closest(".m-day")));
    form.addEventListener("change", (e) => {
      if (e.target.type !== "radio") return;
      const day = e.target.closest(".m-day");
      day.querySelector('[data-field="sides"]').disabled = e.target.value === "any";
      mark(day);
    });
    form.addEventListener("click", (e) => {
      if (!e.target.closest("[data-clear]")) return;
      const day = e.target.closest(".m-day");
      for (const input of day.querySelectorAll('input[type="text"], textarea')) input.value = "";
      const set = day.querySelector('input[type="radio"][value="set"]');
      if (set) { set.checked = true; day.querySelector('[data-field="sides"]').disabled = false; }
      mark(day);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const days = {};
      const notes = {};
      for (const day of form.querySelectorAll(".m-day")) {
        const now = read(day);
        if (JSON.stringify(now) !== before.get(day.dataset.date)) days[day.dataset.date] = now;
        const text = readWords(day);
        if (text !== beforeWords.get(day.dataset.date)) notes[day.dataset.date] = { description: text };
      }
      busy("Specials", "Saving…");
      result("Specials", await postJson("/api/front-plan-save", { pin: Front.pin, days, notes }));
    });
  }

  Front.tools.plan = openPlan;
})();
