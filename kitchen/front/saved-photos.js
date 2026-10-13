// Manage -> Saved photos: what Photo post kept on the kitchen PC (its
// "Keep the photo on the kitchen PC for the website"), newest first, so
// test shots can be deleted. Loaded by front.html after its own script,
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
    if (!r.photos.length) return result(TITLE, { ok: true, message: "No photos are kept on the kitchen PC." });
    const date = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
    screen({ title: TITLE, back: true,
      body: `<p class="m-note">Tick the ones to delete (test shots, retakes), then Delete ticked. They go from the kitchen PC for good.
        Photos already on the website aren't touched.</p>
        <form id="m-saved" class="sp-grid">
          ${r.photos.map((p) => `<label class="sp-card">
            <img alt="" data-name="${esc(p.saved)}">
            <b>${esc(p.title || "(no name)")}</b>
            <small>${esc(date(p.date))}${p.special ? " · special" : ""}</small>
            <span class="check"><input type="checkbox" name="del" value="${esc(p.saved)}"><span>Delete</span></span>
          </label>`).join("")}
        </form>`,
      buttons: [{ label: "Delete ticked", submit: "m-saved", kind: "danger" }] });
    const form = document.getElementById("m-saved");
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

  Front.tools.saved = openSaved;
  Front.acts["saved-delete"] = runDelete;
})();
