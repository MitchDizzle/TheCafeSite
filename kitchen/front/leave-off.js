// Manage -> Leave off kitchen tickets: the skip list, by item or whole category.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;

  // ---- Leave off kitchen tickets (it was "What the kitchen skips")
  async function openSkip() {
    busy("Leave off kitchen tickets", "Reading Square's items…");
    const r = await postJson("/api/front-skip", { pin: Front.pin });
    if (!r.ok) return result("Leave off kitchen tickets", r);
    const lc = (x) => x.trim().toLowerCase();
    const cats = new Set(r.skip.categories.map(lc));
    const items = new Set(r.skip.items.map(lc));
    const known = new Set(r.categories.flatMap((c) => c.items).map(lc));
    // Names on the list that aren't Square items (renamed, deleted, or typed
    // into config.json): kept unless unticked.
    const other = r.skip.items.filter((n) => !known.has(lc(n)));
    const box = (attr, value, checked, text, disabled) =>
      `<label class="check"><input type="checkbox" ${attr}="${esc(value)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span>${esc(text)}</span></label>`;
    const catHtml = (c) => {
      const whole = cats.has(lc(c.name)) && c.name !== "(No category)";
      const picked = c.items.filter((n) => items.has(lc(n))).length;
      return `<details class="skip-cat" data-whole="${whole ? 1 : 0}"${whole || picked ? " open" : ""}>
        <summary>${c.name === "(No category)" ? `<span>${esc(c.name)}</span>` : box("data-cat", c.name, whole, `${c.name}: the whole category`)}
          <span class="count">${c.items.length} item${c.items.length === 1 ? "" : "s"}</span></summary>
        <div class="skip-items">${c.items.map((n) => box("data-item", n, whole || items.has(lc(n)), n, whole)).join("")}</div>
      </details>`;
    };
    screen({ title: "Leave off kitchen tickets", back: true,
      body: `<p class="m-note">Ticked items stay off the kitchen board and go on the front's "Add from the front" list.
        A ticked category also covers items added to it in Square later.</p>
        ${r.catalogError ? `<p class="m-error">Couldn't read Square's items (${esc(r.catalogError)}). Only the names already on the list are shown.</p>` : ""}
        <form id="m-skip">
          ${r.categories.map(catHtml).join("")}
          ${other.length ? `<details class="skip-cat" open><summary><span>Other names on the list</span></summary>
            <div class="skip-items">${other.map((n) => box("data-item", n, true, n, false)).join("")}</div></details>` : ""}
        </form>`,
      buttons: [{ label: "Save", submit: "m-skip", kind: "primary" }] });
    const form = document.getElementById("m-skip");
    // A whole category ticks and locks its items, so it reads as it acts.
    form.addEventListener("change", (e) => {
      const cat = e.target.closest("[data-cat]");
      if (!cat) return;
      const details = cat.closest(".skip-cat");
      details.dataset.whole = cat.checked ? "1" : "0";
      for (const it of details.querySelectorAll("[data-item]")) {
        it.disabled = cat.checked;
        if (cat.checked) it.checked = true;
      }
      if (cat.checked) details.open = true;
    });
    // The summary's checkbox must tick, not also fold the category.
    form.addEventListener("click", (e) => {
      if (e.target.closest("summary label")) e.stopPropagation();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const skip = {
        categories: [...form.querySelectorAll("[data-cat]:checked")].map((x) => x.dataset.cat),
        // Items inside a skipped category are covered by it; only the rest are listed.
        items: [...form.querySelectorAll("[data-item]:checked:not(:disabled)")].map((x) => x.dataset.item),
      };
      busy("Leave off kitchen tickets", "Saving…");
      const res = await postJson("/api/front-skip-save", { pin: Front.pin, skip });
      Front.rerender();
      result("Leave off kitchen tickets", res);
    });
  }

  Front.tools.skip = openSkip;
})();
