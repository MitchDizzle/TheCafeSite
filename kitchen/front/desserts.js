// Manage -> Desserts: flavors on or off, and the photo online ordering shows.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;

  // ---- Desserts: each dessert item's photo and its options (flavors).
  // Unticking an option hides it from online ordering (Square's own "hidden
  // online"); it stays in Square and comes back with one tick. Square only
  // lets the iPad itself mark something sold out at the till.
  async function openDesserts() {
    busy("Desserts", "Reading from Square…");
    const r = await postJson("/api/front-desserts", { pin: Front.pin });
    if (!r.ok) return result("Desserts", r);
    const optHtml = (o) => `<label class="check${o.off ? " off" : ""}"><input type="checkbox" data-opt="${esc(o.id)}"${o.off ? "" : " checked"}><span>${esc(o.name)}</span></label>`;
    const itemHtml = (it) => it.missing
      ? `<section class="m-card"><h3>${esc(it.name)}</h3><p class="m-error">Not found in Square under this name.</p></section>`
      : `<section class="m-card m-dessert" data-item="${esc(it.id)}">
        <div class="m-photo">
          ${it.photo ? `<img src="${esc(it.photo)}" alt="${esc(it.name)}">` : `<div class="m-nophoto">No photo</div>`}
          <label>${it.photo ? "Change photo" : "Add photo"}<input type="file" accept="image/*" data-photo="${esc(it.id)}"></label>
          <span class="m-photo-msg" hidden></span>
        </div>
        <div>
          <h3>${esc(it.name)}</h3>
          ${it.lists.length ? it.lists.map((l) => `<div class="m-list" data-list="${esc(l.id)}">
            <p class="m-list-name">${esc(l.name)}</p>
            <div class="m-opts">${l.options.map(optHtml).join("")}</div>
            <div class="m-add"><input type="text" placeholder="New option, e.g. Turtle" maxlength="60" aria-label="New option for ${esc(l.name)}"><button type="button" data-add>Add</button></div>
          </div>`).join("") : `<p class="m-note">No options in Square for this one.</p>`}
        </div>
      </section>`;
    screen({ title: "Desserts", back: true,
      body: `<p class="m-note">Unticked options are hidden from online ordering and come back with one tick.
        On the iPad, mark a flavor sold out from the iPad itself. A new photo goes to Square straight away.</p>
        <form id="m-desserts">${r.items.map(itemHtml).join("")}</form>`,
      buttons: [{ label: "Save to Square", submit: "m-desserts", kind: "primary" }] });
    const form = document.getElementById("m-desserts");
    form.addEventListener("change", (e) => {
      const opt = e.target.closest("[data-opt]");
      if (opt) opt.closest(".check").classList.toggle("off", !opt.checked);
      const file = e.target.closest("[data-photo]");
      if (file && file.files[0]) uploadPhoto(file, file.files[0]);
    });
    // Add puts the new option in the list, ticked; it's saved with the rest.
    form.addEventListener("click", (e) => {
      if (!e.target.closest("[data-add]")) return;
      const box = e.target.closest(".m-list");
      const input = box.querySelector(".m-add input");
      const name = input.value.replace(/\s+/g, " ").trim();
      if (!name) return input.focus();
      box.querySelector(".m-opts").insertAdjacentHTML("beforeend",
        `<label class="check"><input type="checkbox" data-new="${esc(name)}" checked><span>${esc(name)} <small>(new)</small></span></label>`);
      input.value = "";
    });
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.closest(".m-add input")) { e.preventDefault(); e.target.closest(".m-add").querySelector("[data-add]").click(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const lists = [...form.querySelectorAll("[data-list]")].map((l) => ({
        id: l.dataset.list,
        options: [...l.querySelectorAll("[data-opt]")].map((x) => ({ id: x.dataset.opt, off: !x.checked })),
        add: [...l.querySelectorAll("[data-new]:checked")].map((x) => x.dataset.new),
      }));
      busy("Desserts", "Saving to Square…");
      result("Desserts", await postJson("/api/front-desserts-save", { pin: Front.pin, lists }));
    });
  }

  // A photo from the phone: shrunk to 1600px on the long side and re-drawn
  // as a JPEG here, before it leaves the phone. Re-drawing drops everything
  // but the picture, including the GPS location phones write into photos.
  async function uploadPhoto(input, file) {
    const card = input.closest(".m-photo");
    const msg = card.querySelector(".m-photo-msg");
    msg.hidden = false;
    msg.textContent = "Uploading…";
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL("image/jpeg", 0.85);
      const r = await postJson("/api/front-dessert-photo", { pin: Front.pin, itemId: input.dataset.photo, photo });
      msg.textContent = r.ok ? "✓ Saved" : r.message;
      if (r.ok) {
        const img = card.querySelector("img") || Object.assign(document.createElement("img"), { alt: "" });
        img.src = photo;
        card.querySelector(".m-nophoto")?.replaceWith(img);
      }
    } catch {
      msg.textContent = "Couldn't read that photo. Try another.";
    }
    input.value = "";
  }

  Front.tools.desserts = openDesserts;
})();
