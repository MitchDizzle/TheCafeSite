// Manage -> Photo post: the Facebook dish post, drawn on the phone.
// Loaded by front.html after its own script, which shares its helpers as
// window.Front (see "Manage" there).
(() => {
  const { esc, postJson, screen, busy, result, dialog, listWords } = Front;

  // ---- Photo post: the Facebook dish post (1080 x 1250) drawn on this phone
  // from a photo it just took. Nothing is sent
  // anywhere to make it: the words come from today's plan or Square's menu,
  // anything can be typed over, and the picture is drawn here. The kitchen PC
  // only keeps the photo and the post afterwards, for the website.
  //
  // This is the only dish post now. The website's /studio/ version (fb-dish,
  // the same design in HTML and CSS) was archived on 2026-10-09 and is in
  // archive/site-src/ as a reference. The look: photo in the top 1080 square,
  // the name over a teal fade at the top, and a band under the photo with the
  // words, the wordmark, the phone and the web address.
  // Phone, web address, menu and order links, hours: the website's
  // src/_data/site.json, sent by the kitchen PC when the screen opens
  // (siteDetails in lib/photo-post.js).
  let SITE = null;
  const INK = { cream: "#FAF7F2", teal: "#2C5E70", tealDark: "#1F4552", mint: "#8ED9D4", accent: "#C0392F", coral: "#EB5E64" };
  const SERIF = '"Playfair Display", Georgia, serif';
  const SANS = 'Lato, "Segoe UI", Arial, sans-serif';

  // The post's own fonts, from Google Fonts like the website. Loaded only for
  // this screen (the rest of the page needs nothing from the internet); if
  // they can't load, the picture falls back to Georgia and says so.
  let fontsReady = null;
  function loadFonts() {
    if (fontsReady) return fontsReady;
    fontsReady = new Promise((resolve) => {
      const link = Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,400;1,900&family=Lato:wght@400;700&display=block",
      });
      const fail = () => { fontsReady = null; resolve(false); };
      link.onload = () => Promise.all(['italic 900 60px "Playfair Display"', 'italic 400 28px "Playfair Display"', "400 30px Lato", "700 24px Lato"]
        .map((f) => document.fonts.load(f))).then((list) => resolve(list.every((l) => l.length)), fail);
      link.onerror = fail;
      setTimeout(fail, 8000);
      document.head.appendChild(link);
    });
    return fontsReady;
  }

  // The wordmark twice: its coral offset, and the cream letters with the
  // teal outline (the website's .wordmark--light.wordmark--hero).
  let marks = null;
  async function loadMarks() {
    if (marks) return marks;
    const svg = await (await fetch("/front-wordmark.svg")).text();
    const img = (fill, stroke) => new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace('fill="FILL"', `fill="${fill}"`).replace('stroke="STROKE"', `stroke="${stroke}"`));
    });
    marks = await Promise.all([img(INK.coral, INK.coral), img(INK.cream, INK.tealDark)]);
    return marks;
  }

  // Words over as many lines as they need, each no wider than maxW.
  function wrapText(ctx, text, maxW) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  // Letter-spaced capitals, centred on x (canvas letterSpacing isn't on
  // every phone yet).
  function spacedText(ctx, text, x, y, spacing) {
    const chars = [...text];
    const w = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let at = x - w / 2;
    ctx.textAlign = "left";
    for (const c of chars) { ctx.fillText(c, at, y); at += ctx.measureText(c).width + spacing; }
  }

  function drawPost(canvas, pp) {
    const ctx = canvas.getContext("2d");
    const W = 1080, PHOTO = 1080, BAND = 1088, H = 1250;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK.tealDark;
    ctx.fillRect(0, 0, W, H);

    // The photo, filling the square, moved and zoomed as dragged.
    if (pp.img) {
      const { width: w, height: h } = pp.img;
      const sc = (PHOTO / Math.min(w, h)) * pp.zoom;
      const dw = w * sc, dh = h * sc;
      const x = Math.min(0, Math.max(PHOTO - dw, PHOTO / 2 - pp.cx * dw));
      const y = Math.min(0, Math.max(PHOTO - dh, PHOTO / 2 - pp.cy * dh));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, PHOTO, PHOTO);
      ctx.clip();
      ctx.drawImage(pp.img, x, y, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = INK.teal;
      ctx.fillRect(0, 0, PHOTO, PHOTO);
      ctx.fillStyle = INK.mint;
      ctx.font = `700 44px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("Take or choose a photo", W / 2, 600);
    }

    // The name on one line, sized by the archived fb-dish's rule (Playfair
    // Black Italic runs about 0.56em a letter across the 960px measure), then
    // made smaller only if this phone's fonts still run wider than that.
    const title = pp.title || "Name";
    let size = Math.min(104, Math.floor(960 / (title.length * 0.56)));
    const titleFont = (n) => `italic 900 ${n}px ${SERIF}`;
    ctx.font = titleFont(size);
    while (size > 30 && ctx.measureText(title).width > 960) ctx.font = titleFont((size -= 2));
    const kickerH = 29;
    const titleTop = 38 + kickerH + 6;
    const headH = titleTop + size * 1.08 + 70;
    const fade = ctx.createLinearGradient(0, 0, 0, headH);
    fade.addColorStop(0, "rgba(31, 69, 82, 0.98)");
    fade.addColorStop(0.58, "rgba(31, 69, 82, 0.72)");
    fade.addColorStop(1, "rgba(31, 69, 82, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, headH);

    if (pp.kicker) {
      ctx.font = `700 24px ${SANS}`;
      ctx.fillStyle = INK.mint;
      spacedText(ctx, pp.kicker.toUpperCase(), W / 2, 38 + 23, 24 * 0.18);
    }

    // Cream letters, teal outline under them, coral offset: the website's
    // .dish-title (text-stroke 0.07em, drop-shadow 0.03em 0.045em).
    ctx.font = titleFont(size);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.07;
    const base = titleTop + size * 0.84;
    ctx.fillStyle = ctx.strokeStyle = INK.coral;
    ctx.strokeText(title, W / 2 + size * 0.03, base + size * 0.045);
    ctx.fillText(title, W / 2 + size * 0.03, base + size * 0.045);
    ctx.strokeStyle = INK.tealDark;
    ctx.strokeText(title, W / 2, base);
    ctx.fillStyle = INK.cream;
    ctx.fillText(title, W / 2, base);

    // The band: red rule, teal gradient.
    ctx.fillStyle = INK.accent;
    ctx.fillRect(0, PHOTO, W, BAND - PHOTO);
    const band = ctx.createLinearGradient(0, BAND, W, H);
    band.addColorStop(0, INK.tealDark);
    band.addColorStop(1, INK.teal);
    ctx.fillStyle = band;
    ctx.fillRect(0, BAND, W, H - BAND);

    // Right: wordmark (200px across its letters) over the phone and address.
    const markW = 200, unit = markW / 132.5;
    const markH = 40.7 * unit;
    const callLines = [SITE.phone, SITE.website];
    ctx.font = `400 24px ${SANS}`;
    const signW = Math.max(markW, ...callLines.map((l) => ctx.measureText(l).width));
    const signH = markH + 8 + callLines.length * 31;
    const signTop = BAND + (H - BAND - signH) / 2;
    if (marks) {
      const mx = 1020 - markW - 2 * unit;
      ctx.drawImage(marks[0], mx + markW * 0.00626, signTop + markW * 0.00903, 136.5 * unit, markH);
      ctx.drawImage(marks[1], mx, signTop, 136.5 * unit, markH);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(250, 247, 242, 0.9)";
    callLines.forEach((l, i) => ctx.fillText(l, 1020, signTop + markH + 8 + 24 + i * 31));

    // Left: the words, then "Drink included", centred in the band.
    const infoW = 1020 - 40 - signW - 60;
    let descSize = 30;
    ctx.font = `400 ${descSize}px ${SANS}`;
    let lines = wrapText(ctx, pp.desc || "", infoW);
    if (lines.length > 3) { descSize = 26; ctx.font = `400 ${descSize}px ${SANS}`; lines = wrapText(ctx, pp.desc, infoW).slice(0, 4); }
    const lh = descSize * 1.3;
    const extra = pp.special && pp.drink ? "Drink included" : "";
    const infoH = lines.length * lh + (extra ? 6 + 36 : 0);
    let y = BAND + (H - BAND - infoH) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = INK.cream;
    for (const l of lines) { ctx.fillText(l, 60, y + descSize * 0.95); y += lh; }
    if (extra) {
      ctx.font = `italic 400 28px ${SERIF}`;
      ctx.fillStyle = INK.mint;
      ctx.fillText(extra, 60, y + 6 + 28);
    }
  }

  // The caption: the dish, then one line for when and where. Kept short on
  // purpose (client 2026-10-08): it's read on a phone, and the details are
  // explained at the counter.
  function photoCaption(pp) {
    const desc = (pp.desc || "").trim().replace(/\.$/, "");
    const lines = [];
    if (pp.special) {
      const what = desc ? `${pp.title}, ${desc.charAt(0).toLowerCase()}${desc.slice(1)}` : pp.title;
      lines.push(`Today's special: ${what}.${pp.drink ? " A drink is included." : ""}`);
    } else {
      const price = pp.price != null ? ` ${pp.sizes ? "From " : ""}$${pp.price.toFixed(2)}` : "";
      lines.push(`${pp.title}${desc ? `: ${desc}` : ""}.${price}`);
    }
    lines.push(`Open ${SITE.hours} · Order online at ${SITE.order} · Menu: ${SITE.menu}`);
    return lines.join("\n\n");
  }

  let pp = null; // the post being made: photo, framing and words

  async function openPhoto() {
    busy("Photo post", "Getting ready…");
    const [r, fontsOk] = await Promise.all([
      postJson("/api/front-photo", { pin: Front.pin }),
      loadFonts(),
      loadMarks().catch(() => null),
    ]);
    if (!r.ok) return result("Photo post", r);
    SITE = r.site;
    pp = { setup: r, fontsOk, img: null, photo: null, zoom: 1, cx: 0.5, cy: 0.5, keep: true, choice: "", title: "", kicker: "", desc: "", drink: false, special: false, price: null, sizes: false, item: null };
    const t = r.today;
    choosePhotoSubject(t.special ? "special" : t.soup ? "soup" : "other");
    showPhotoEditor();
  }

  // Fill the words from what the photo is of. Anything typed afterwards wins.
  function choosePhotoSubject(choice) {
    const t = pp.setup.today;
    Object.assign(pp, { choice, special: false, drink: false, price: null, sizes: false, item: null });
    if (choice === "special") {
      // The day's words for the photo from Specials, if written; otherwise
      // what the plate comes with.
      Object.assign(pp, { special: true, drink: true, kicker: "Daily Special", title: t.special,
        desc: t.description || (t.anySide ? "With choice of side"
          : t.sides && t.sides.length ? `Served with ${listWords(t.sides.map((x) => x.toLowerCase()))}` : "") });
    } else if (choice === "soup") {
      Object.assign(pp, { special: true, kicker: "Soup of the Day", title: t.soup, desc: "A cup or a bowl, from 11am" });
    } else if (choice === "other") {
      Object.assign(pp, { special: true, drink: true, kicker: "Daily Special", title: "", desc: "" });
    } else {
      const it = pp.setup.items[Number(choice.slice(5))];
      Object.assign(pp, { kicker: it.category || "", title: it.name, desc: it.description.replace(/\.$/, ""), price: it.price, sizes: it.sizes, item: it.name });
    }
  }

  function showPhotoEditor() {
    const t = pp.setup.today;
    const opt = (v, label) => `<option value="${esc(v)}"${pp.choice === v ? " selected" : ""}>${esc(label)}</option>`;
    const groups = new Map();
    pp.setup.items.forEach((it, i) => {
      const g = it.category || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(opt(`item:${i}`, it.name));
    });
    screen({ title: "Photo post", back: true,
      body: `<div class="pp">
        <label class="pp-photo-btn">${pp.img ? "Take or choose another photo" : "📷 Take or choose a photo"}<input type="file" accept="image/*" id="pp-file"></label>
        <canvas id="pp-canvas" class="pp-canvas" width="1080" height="1250" aria-label="The post as it will look"></canvas>
        ${pp.img ? `<label class="m-field">Zoom (drag the picture to move it)<input type="range" id="pp-zoom" min="1" max="3" step="0.01" value="${pp.zoom}"></label>` : ""}
        ${pp.fontsOk ? "" : `<p class="m-error">The post's fonts didn't load (is the internet down?), so this uses plain ones. Open Photo post again once it's back.</p>`}
        <label class="m-field">What's in the photo
          <select id="pp-what">
            ${t.special ? opt("special", `Today's special: ${t.special}`) : ""}
            ${t.soup ? opt("soup", `Today's soup: ${t.soup}`) : ""}
            ${opt("other", "A special (type its name below)")}
            ${[...groups].map(([g, o]) => `<optgroup label="${esc(g)}">${o.join("")}</optgroup>`).join("")}
          </select></label>
        <label class="m-field">Name<input type="text" id="pp-title" value="${esc(pp.title)}" maxlength="60"></label>
        <label class="m-field">Line above the name<input type="text" id="pp-kicker" value="${esc(pp.kicker)}" maxlength="40"></label>
        <label class="m-field">Words under the photo<textarea id="pp-desc" rows="2" maxlength="200">${esc(pp.desc)}</textarea></label>
        ${pp.special ? `<label class="check"><input type="checkbox" id="pp-drink"${pp.drink ? " checked" : ""}><span>Drink included</span></label>` : ""}
        <label class="check"><input type="checkbox" id="pp-keep"${pp.keep ? " checked" : ""}><span>Keep the photo on the kitchen PC for the website</span></label>
      </div>`,
      buttons: [{ label: "Make the picture", act: "pp-make", kind: "primary" }] });
    const canvas = document.getElementById("pp-canvas");
    const redraw = () => drawPost(canvas, pp);
    redraw();
    const box = dialog.querySelector(".pp");
    box.addEventListener("input", (e) => {
      const id = e.target.id;
      if (id === "pp-title") pp.title = e.target.value;
      else if (id === "pp-kicker") pp.kicker = e.target.value;
      else if (id === "pp-desc") pp.desc = e.target.value;
      else if (id === "pp-zoom") pp.zoom = Number(e.target.value);
      else return;
      redraw();
    });
    box.addEventListener("change", async (e) => {
      const id = e.target.id;
      if (id === "pp-drink") { pp.drink = e.target.checked; redraw(); }
      else if (id === "pp-keep") pp.keep = e.target.checked;
      else if (id === "pp-what") { choosePhotoSubject(e.target.value); showPhotoEditor(); }
      else if (id === "pp-file" && e.target.files[0]) {
        const label = e.target.closest("label");
        label.firstChild.textContent = "Reading the photo…";
        try {
          await readPhoto(e.target.files[0]);
          showPhotoEditor();
        } catch {
          label.firstChild.textContent = "Couldn't read that photo. Try another.";
        }
      }
    });
    // Drag to move the photo: the drag in screen pixels, scaled to the canvas.
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (!pp.img) return;
      drag = { x: e.clientX, y: e.clientY, cx: pp.cx, cy: pp.cy };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const k = canvas.width / canvas.clientWidth;
      const sc = (1080 / Math.min(pp.img.width, pp.img.height)) * pp.zoom;
      const clamp = (v, size) => { const half = 540 / (size * sc); return Math.min(1 - half, Math.max(half, v)); };
      pp.cx = clamp(drag.cx - ((e.clientX - drag.x) * k) / (pp.img.width * sc), pp.img.width);
      pp.cy = clamp(drag.cy - ((e.clientY - drag.y) * k) / (pp.img.height * sc), pp.img.height);
      redraw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  // The photo, turned upright and re-drawn: what's drawn into the post, and
  // the copy kept for the website (2000px, re-drawn, so no GPS location).
  async function readPhoto(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
    pp.img = c;
    pp.photo = c.toDataURL("image/jpeg", 0.85);
    Object.assign(pp, { zoom: 1, cx: 0.5, cy: 0.5 });
  }

  async function makePhotoPost() {
    if (!pp.img) return alert("Take or choose a photo first.");
    if (!pp.title.trim()) return alert("The post needs a name.");
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1250;
    drawPost(canvas, pp);
    let post;
    try {
      post = canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      // An older phone that won't let a drawn SVG out of a canvas: make it
      // again without the wordmark rather than not at all.
      marks = null;
      drawPost(canvas, pp);
      post = canvas.toDataURL("image/jpeg", 0.92);
    }
    const file = `${pp.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-post.jpg`;
    screen({ title: "Photo post", back: true,
      body: `<div class="pp-result">
        <img src="${post}" alt="The finished post">
        <p class="m-note">Press and hold the picture to save it to your photos, or use Download.</p>
        <label class="m-field">Caption<textarea class="pp-caption" id="pp-caption" rows="7">${esc(photoCaption(pp))}</textarea></label>
        <p class="m-note" id="pp-kept">${pp.keep ? "Keeping the photo on the kitchen PC…" : "Not kept on the kitchen PC."}</p>
      </div>`,
      buttons: [{ label: "Change it", act: "pp-edit" }, { label: "Copy caption", act: "pp-copy" }, { label: "Download", act: "pp-download", kind: "primary" }] });
    dialog.querySelector('[data-act="pp-copy"]').addEventListener("click", (e) => {
      // http, so no clipboard API: select the text and copy it the old way.
      const ta = document.getElementById("pp-caption");
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand && document.execCommand("copy");
      e.target.textContent = ok ? "Copied" : "Press and hold to copy";
    });
    dialog.querySelector('[data-act="pp-download"]').addEventListener("click", () => {
      const a = Object.assign(document.createElement("a"), { href: post, download: file });
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    if (pp.keep && !pp.keptPost) {
      pp.keptPost = post;
      const r = await postJson("/api/front-photo-save", { pin: Front.pin, photo: pp.photo, post,
        meta: { title: pp.title, item: pp.item, special: pp.special, includesDrink: pp.special && pp.drink, description: pp.desc, kicker: pp.kicker } });
      const el = document.getElementById("pp-kept");
      if (el) { el.textContent = r.ok ? `✓ ${r.message}` : r.message; el.className = r.ok ? "m-note" : "m-error"; }
      if (!r.ok) pp.keptPost = null;
    }
  }

  Front.tools.photo = openPhoto;
  Front.acts["pp-edit"] = () => { pp.keptPost = null; showPhotoEditor(); };
  Front.acts["pp-make"] = makePhotoPost;
})();
