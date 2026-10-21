// Manage -> Desserts: what kinds are in, how many are left, the options
// (sauces) on or off, and the photo online ordering shows.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result } = Front;

  // ---- Desserts: each dessert item's photo, its kinds with how many are
  // left, and its options (the cheesecake's sauce). A count goes into
  // Square, which counts it down as it sells and shows the kind sold out
  // online at 0; blank stops counting it. Unticking an option hides it from
  // online ordering (Square's own "hidden online"); it comes back with one
  // tick. Only what was changed is sent, so a sale made while this screen
  // was open is never counted back in.
  async function openDesserts() {
    busy("Desserts", "Reading from Square…");
    const r = await postJson("/api/front-desserts", { pin: Front.pin });
    if (!r.ok) return result("Desserts", r);
    const money = (n) => (n == null ? "" : ` <small>$${n.toFixed(2)}</small>`);
    const left = (c) => (c === null ? "" : String(c));
    const countBox = (name, value) => `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${esc(value)}" placeholder="–" aria-label="${esc(name)}: how many left">`;
    const kindHtml = (k) => `<div class="m-kind${k.count === 0 ? " out" : ""}" data-kind="${esc(k.id)}" data-was="${left(k.count)}">
        <span class="m-kind-name">${esc(k.name)}</span>${countBox(k.name, left(k.count))}<button type="button" data-remove>Remove</button>
      </div>`;
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
          <h3>${esc(it.name)}${money(it.price)}</h3>
          <div class="m-kinds" data-kinds="${esc(it.id)}">
            <p class="m-kind-head"><span>Kind</span><span>Left</span></p>
            ${it.kinds.map(kindHtml).join("")}
            <div class="m-add m-add-kind"><input type="text" placeholder="New kind, e.g. Turtle" maxlength="60" aria-label="New kind of ${esc(it.name)}"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="Left" aria-label="How many of the new kind"><button type="button" data-add-kind>Add</button></div>
          </div>
          ${it.lists.map((l) => `<div class="m-list" data-list="${esc(l.id)}">
            <p class="m-list-name">${esc(l.name)}</p>
            <div class="m-opts">${l.options.map(optHtml).join("")}</div>
            <div class="m-add"><input type="text" placeholder="New option, e.g. Strawberry" maxlength="60" aria-label="New option for ${esc(l.name)}"><button type="button" data-add>Add</button></div>
          </div>`).join("")}
        </div>
      </section>`;
    screen({ title: "Desserts", back: true,
      body: `<p class="m-note"><b>Left</b> is how many are in the case. Square counts it down as they sell, at the till and online,
        and shows a kind sold out online at 0. Leave it blank not to count one.
        <b>Remove</b> a kind once it's gone for good; <b>Add</b> a new one at the same price.
        Unticked options are hidden from online ordering. A new photo goes to Square straight away.</p>
        <form id="m-desserts" novalidate>${r.items.map(itemHtml).join("")}</form>`,
      buttons: [{ label: "Save to Square", submit: "m-desserts", kind: "primary" }] });
    const form = document.getElementById("m-desserts");
    form.addEventListener("change", (e) => {
      const opt = e.target.closest("[data-opt]");
      if (opt) opt.closest(".check").classList.toggle("off", !opt.checked);
      const file = e.target.closest("[data-photo]");
      if (file && file.files[0]) uploadPhoto(file, file.files[0]);
    });
    form.addEventListener("input", (e) => {
      const row = e.target.closest(".m-kind");
      if (row) row.classList.toggle("out", e.target.value.trim() === "0");
    });
    form.addEventListener("click", (e) => {
      // Remove marks a kind to go on Save; pressed again, it stays.
      const rm = e.target.closest("[data-remove]");
      if (rm) {
        const row = rm.closest(".m-kind");
        const gone = row.classList.toggle("gone");
        rm.textContent = gone ? "Keep" : "Remove";
        row.querySelector("input").disabled = gone;
        return;
      }
      // A new kind goes on the list; it's made in Square on Save.
      if (e.target.closest("[data-add-kind]")) {
        const box = e.target.closest(".m-add-kind");
        const [nameIn, countIn] = box.querySelectorAll("input");
        const name = nameIn.value.replace(/\s+/g, " ").trim();
        if (!name) return nameIn.focus();
        const n = countIn.value.trim();
        box.insertAdjacentHTML("beforebegin", `<div class="m-kind new${n === "0" ? " out" : ""}" data-new="${esc(name)}">
          <span class="m-kind-name">${esc(name)} <small>(new)</small></span>${countBox(name, n)}<button type="button" data-drop>Remove</button></div>`);
        nameIn.value = countIn.value = "";
        return;
      }
      const drop = e.target.closest("[data-drop]");
      if (drop) return drop.closest(".m-kind").remove();
      // Add puts the new option in the list, ticked; it's saved with the rest.
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
      const add = e.key === "Enter" && e.target.closest(".m-add");
      if (add) { e.preventDefault(); add.querySelector("button").click(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const count = (row) => row.querySelector("input").value.trim();
      const bad = [...form.querySelectorAll(".m-kind:not(.gone)")].find((row) => !/^\d{0,3}$/.test(count(row)));
      if (bad) { bad.querySelector("input").focus(); return alert("Left is a number, or blank."); }
      const kinds = [...form.querySelectorAll("[data-kinds]")].map((box) => ({
        item: box.dataset.kinds,
        counts: [...box.querySelectorAll(".m-kind[data-kind]:not(.gone)")]
          .filter((row) => count(row) !== row.dataset.was)
          .map((row) => ({ id: row.dataset.kind, count: count(row) })),
        remove: [...box.querySelectorAll(".m-kind.gone")].map((row) => row.dataset.kind),
        add: [...box.querySelectorAll(".m-kind[data-new]")].map((row) => ({ name: row.dataset.new, count: count(row) })),
      }));
      const lists = [...form.querySelectorAll("[data-list]")].map((l) => ({
        id: l.dataset.list,
        options: [...l.querySelectorAll("[data-opt]")].map((x) => ({ id: x.dataset.opt, off: !x.checked })),
        add: [...l.querySelectorAll("[data-new]:checked")].map((x) => x.dataset.new),
      }));
      busy("Desserts", "Saving to Square…");
      result("Desserts", await postJson("/api/front-desserts-save", { pin: Front.pin, kinds, lists }));
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
