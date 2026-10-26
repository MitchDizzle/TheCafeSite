// Manage -> Saved photos: what Photo post kept on the kitchen PC (its
// "Keep the photo on the kitchen PC for the website"), newest first, so
// test shots can be deleted, and the rest moved off the PC to the GitHub
// backup. Below them, every other photo the board can use for a special or
// a menu item (the website's, the GitHub backup's), to look at only, and a
// search over all of them by name (Mitch 2026-10-26). Loaded by front.html after its own script,
// which shares its helpers as window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;

  const TITLE = "Saved photos";
  let urls = []; // the thumbnails' object URLs, let go when the list closes

  function forgetThumbs() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  // One picture at a time, by POST (the PIN goes in the body, never in an
  // address), into its card.
  async function loadThumbs(photos) {
    for (const p of photos) {
      const img = Front.dialog.querySelector(`img[data-name="${CSS.escape(p.saved)}"]`);
      if (!img) return; // the screen was left
      try {
        const res = await fetch(Front.api("/api/front-saved-photo"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: Front.pin, name: p.saved }),
        });
        if (!res.ok || !/image/.test(res.headers.get("Content-Type") || "")) throw new Error();
        const u = URL.createObjectURL(await res.blob());
        urls.push(u);
        img.src = u;
      } catch {
        img.replaceWith(Object.assign(document.createElement("div"), { className: "m-nophoto", textContent: "No picture" }));
      }
    }
  }

  async function openSaved() {
    forgetThumbs();
    busy(TITLE, "Reading the kitchen PC's photos…");
    const r = await postJson("/api/front-saved-photos", { pin: Front.pin });
    if (!r.ok) return result(TITLE, r);
    const others = r.others || [];
    if (!r.photos.length && !others.length) return result(TITLE, { ok: true, message: "No photos are kept on the kitchen PC." });
    const date = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
    const kind = (p) => (p.special ? "special" : p.item ? "menu" : "");
    const where = { website: "On the website", github: "In the GitHub backup" };
    const groups = ["website", "github"].map((from) => ({ from, list: others.filter((p) => p.from === from) })).filter((g) => g.list.length);
    screen({ title: TITLE, back: true,
      body: `<label class="m-field">Find a photo
          <input type="search" id="m-saved-find" placeholder="e.g. ribs" autocomplete="off"></label>
        <p class="m-note" id="m-saved-none" hidden>No photo by that name.</p>
        <form id="m-saved">
          ${r.photos.length ? `<section class="sp-group">
            <h3>Kept by Photo post</h3>
            <p class="m-note">Tick the ones to delete (test shots, retakes), then Delete ticked. They go from the kitchen PC for good.
              Photos already on the website aren't touched.</p>
            <div class="sp-grid">${r.photos.map((p) => `<label class="sp-card" data-find="${esc((p.title || "").toLowerCase())}">
              <img alt="" data-name="${esc(p.saved)}">
              <b>${esc(p.title || "(no name)")}</b>
              <small>${esc(date(p.date))}${p.special ? " · special" : ""}</small>
              <span class="check"><input type="checkbox" name="del" value="${esc(p.saved)}"><span>Delete</span></span>
            </label>`).join("")}</div>
          </section>` : ""}
          ${groups.map((g) => `<section class="sp-group">
            <h3>${where[g.from]} <small>${g.list.length}</small></h3>
            <div class="sp-grid">${g.list.map((p) => `<div class="sp-card sp-card--view" data-find="${esc(`${p.title} ${p.item || ""}`.toLowerCase())}">
              <img alt="" data-photo="${esc(p.id)}">
              <b>${esc(p.title)}</b>
              <small>${esc(date(p.date))}${kind(p) ? ` · ${kind(p)}` : ""}</small>
            </div>`).join("")}</div>
          </section>`).join("")}
        </form>`,
      buttons: [r.backup && r.photos.length ? { label: "Move all to GitHub", act: "saved-move" } : null,
        r.photos.length ? { label: "Delete ticked", submit: "m-saved", kind: "danger" } : null].filter(Boolean) });
    const form = document.getElementById("m-saved");
    // Find: every card whose name has the words typed, in any order.
    document.getElementById("m-saved-find").addEventListener("input", (e) => {
      const words = e.target.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const card of form.querySelectorAll(".sp-card")) {
        const hit = words.every((w) => card.dataset.find.includes(w));
        card.hidden = !hit;
        if (hit) shown++;
      }
      for (const sec of form.querySelectorAll(".sp-group")) sec.hidden = !sec.querySelector(".sp-card:not([hidden])");
      document.getElementById("m-saved-none").hidden = shown > 0;
    });
    Front.photoThumbs(form);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const names = [...form.querySelectorAll("input[name=del]:checked")].map((x) => x.value);
      if (!names.length) return;
      confirmDelete(names, r.photos);
    });
    loadThumbs(r.photos);
  }

  // Its own screen, because it can't be undone.
  let pending = [];
  function confirmDelete(names, photos) {
    pending = names;
    const titles = photos.filter((p) => names.includes(p.saved)).map((p) => p.title || p.saved);
    forgetThumbs();
    screen({ title: TITLE, back: true,
      body: `<p>Delete ${names.length} photo${names.length === 1 ? "" : "s"} from the kitchen PC? This can't be undone.</p>
        <ul>${titles.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`,
      buttons: [{ label: "Cancel", act: "saved" }, { label: `Delete ${names.length}`, act: "saved-delete", kind: "danger" }] });
  }

  async function runDelete() {
    busy(TITLE, "Deleting…");
    const r = await postJson("/api/front-saved-photos-delete", { pin: Front.pin, names: pending });
    pending = [];
    result(TITLE, r);
  }

  // Move all to GitHub: its own screen, as the photos leave this PC.
  function confirmMove() {
    forgetThumbs();
    screen({ title: TITLE, back: true,
      body: `<p>Back up now, then take every photo the backup reached off the kitchen PC. They stay in the GitHub backup
        (its photos folder), ready for the website. Delete test shots first, or they go to GitHub too.</p>`,
      buttons: [{ label: "Cancel", act: "saved" }, { label: "Move all to GitHub", act: "saved-move-go", kind: "primary" }] });
  }

  async function runMove() {
    busy(TITLE, "Backing up, then moving…");
    result(TITLE, await postJson("/api/front-saved-photos-clear", { pin: Front.pin }));
  }

  Front.tools.saved = openSaved;
  Front.acts["saved-delete"] = runDelete;
  Front.acts["saved-move"] = confirmMove;
  Front.acts["saved-move-go"] = runMove;
})();
