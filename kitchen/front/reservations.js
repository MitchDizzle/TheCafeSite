// Manage -> Reservations: the book of tables, the website's requests to
// accept or decline, and a new one taken by phone. Loaded by front.html
// after its own script, which shares its helpers as window.Front (see
// "Manage" there). The kitchen program's side is lib/reservations.js.
(() => {
  const { esc, postJson, screen, busy, result } = Front;
  const TITLE = "Reservations";
  let view = null; // the last answer from the PC: the list and its settings

  const dayWords = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const longDay = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  function timeWords(t) {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  }
  const people = (n) => `${n} ${n === 1 ? "person" : "people"}`;
  const digits = (p) => String(p || "").replace(/[^\d+]/g, "");

  // The words for a text from the cafe's phone (or Google Voice), the same
  // news as the emails Google sends.
  function textFor(r, kind) {
    const first = String(r.name).split(" ")[0];
    const when = `${dayWords(r.date)} at ${timeWords(r.time)}`;
    const hold = `We'll hold it ${view.holdMinutes} minutes; check in at the counter when you arrive.`;
    const phone = view.cafePhone ? ` ${view.cafePhone}` : "";
    return {
      confirm: `Hi ${first}, this is The Café. You're all set: a table for ${people(r.party)} on ${when}. ${hold} Questions? Call us at${phone}.`,
      change: `Hi ${first}, this is The Café. Your table is now for ${people(r.party)} on ${when}. ${hold}`,
      decline: `Hi ${first}, this is The Café. Sorry, we can't take a table for ${people(r.party)} on ${when}. Please call us at${phone} and we'll find another time.`,
      cancel: `Hi ${first}, this is The Café. Your table for ${people(r.party)} on ${when} is canceled. Call us at${phone} if you'd like another time.`,
    }[kind];
  }

  // Call and text buttons for one customer, with the message ready to send.
  // sms: opens the device's own messages app; Copy is for Google Voice.
  function contactHtml(r, kind) {
    if (!r.phone) return "";
    const text = kind ? textFor(r, kind) : "";
    return `<div class="rv-contact">
      <a class="m-btn" href="tel:${esc(digits(r.phone))}">Call ${esc(r.phone)}</a>
      ${text ? `<a class="m-btn" href="sms:${esc(digits(r.phone))}?&body=${encodeURIComponent(text)}">Text them</a>
      <button type="button" class="m-btn" data-r-copy>Copy the text</button>
      <textarea class="rv-text" readonly rows="3" aria-label="The text message">${esc(text)}</textarea>` : ""}
    </div>`;
  }

  async function load(path, body) {
    const r = await postJson(path, { pin: Front.pin, ...body });
    if (r.ok) view = r;
    return r;
  }

  // ---- The book
  async function open() {
    busy(TITLE, "Checking for new requests…");
    const r = await load("/api/front-reservations", {});
    if (!r.ok) return result(TITLE, r);
    showBook();
  }

  function showBook() {
    const { list, today } = view;
    const requests = list.filter((r) => r.status === "request" && r.date >= today);
    const ahead = list.filter((r) => r.status !== "request" && r.date >= today);
    const earlier = list.filter((r) => r.date < today).reverse();
    const stale = list.filter((r) => r.status === "request" && r.date < today);
    const byDay = new Map();
    for (const r of ahead) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);

    const google = !view.google
      ? `<p class="m-note">Google isn't set up yet, so the website's requests don't come in and nobody is emailed. Reservations typed in here are kept on the kitchen PC.</p>`
      : view.googleError ? `<p class="m-error">Can't reach Google right now (${esc(view.googleError)}). New website requests and emails wait until it can.</p>`
      : view.stillChecking ? `<p class="m-note">Google is slow to answer. Any new website request shows up here and on the front page by itself within a couple of minutes.</p>` : "";

    screen({ title: TITLE, back: true,
      body: `${google}
        ${requests.length ? `<h3 class="m-group">To answer: ${requests.length} request${requests.length === 1 ? "" : "s"} from the website</h3>
          ${requests.map(requestCard).join("")}` : ""}
        <h3 class="m-group">Coming up</h3>
        ${byDay.size ? [...byDay].map(([date, rs]) => `<div class="rv-day${date === today ? " today" : ""}">
            <p class="rv-date">${date === today ? "Today" : esc(longDay(date))} <small>${rs.filter((r) => r.status === "booked" || r.status === "seated").reduce((n, r) => n + r.party, 0)} people booked</small></p>
            ${rs.map(row).join("")}</div>`).join("")
          : `<p class="m-note">No tables booked.</p>`}
        ${earlier.length || stale.length ? `<details class="rv-earlier"><summary>The last 7 days</summary>
          ${[...stale, ...earlier].map(row).join("")}</details>` : ""}`,
      buttons: [{ label: "+ New reservation", act: "rv-new", kind: "primary" }] });
  }

  function requestCard(r) {
    return `<section class="m-card rv-req" data-id="${esc(r.id)}">
      <h3>${esc(r.name)} · ${people(r.party)}</h3>
      <p class="rv-when">${esc(longDay(r.date))} at ${timeWords(r.time)}</p>
      ${r.notes ? `<p class="rv-notes">${esc(r.notes)}</p>` : ""}
      <p class="m-note">${esc(r.phone)}${r.email ? ` · ${esc(r.email)}` : " · no email: call or text to confirm"}</p>
      ${r.email ? `<label class="check"><input type="checkbox" data-r-email checked><span>Email them the answer</span></label>` : ""}
      <div class="rv-acts">
        <button type="button" class="m-btn primary" data-r="accept">Accept</button>
        <button type="button" class="m-btn" data-r="decline">Decline</button>
        <button type="button" class="m-btn" data-r="edit">Edit</button>
      </div>
    </section>`;
  }

  const STATUS = { seated: "Seated", canceled: "Canceled", declined: "Declined", request: "Not answered" };
  function row(r) {
    const live = r.status === "booked" || r.status === "seated";
    const acts = r.status === "booked"
      ? `${r.date === view.today ? `<button type="button" class="rv-link" data-r="seated">Seated</button>` : ""}
         <button type="button" class="rv-link" data-r="edit">Edit</button>
         <button type="button" class="rv-link" data-r="cancel-ask">Cancel</button>`
      : r.status === "seated" ? `<button type="button" class="rv-link" data-r="unseat">Not seated yet</button>`
      : r.status === "request" ? `<button type="button" class="rv-link" data-r="remove">Remove</button>`
      : `<button type="button" class="rv-link" data-r="restore">Book again</button><button type="button" class="rv-link" data-r="remove">Remove</button>`;
    return `<div class="rv-row${live ? "" : " off"}" data-id="${esc(r.id)}">
      <span class="rv-time">${timeWords(r.time)}${r.date < view.today ? `<small>${esc(dayWords(r.date))}</small>` : ""}</span>
      <span class="rv-who"><b>${esc(r.name)}</b> · ${people(r.party)}${STATUS[r.status] ? ` <span class="rv-tag">${STATUS[r.status]}</span>` : ""}${r.waiting ? ` <span class="rv-tag wait" title="Not in the Google sheet yet; the PC keeps trying">Not sent yet</span>` : ""}
        ${r.notes ? `<small>${esc(r.notes)}</small>` : ""}
        <small>${r.phone ? `<a href="tel:${esc(digits(r.phone))}">${esc(r.phone)}</a>` : ""}${r.email ? ` · ${esc(r.email)}` : ""}${r.source === "web" ? " · from the website" : ""}</small></span>
      <span class="rv-row-acts">${r.date >= view.today ? acts : ""}</span>
    </div>`;
  }

  // ---- A new reservation, or changes to one
  function showForm(r, isNew = !r) {
    r = r || { name: "", phone: "", email: "", date: view.today, time: "11:30", party: "", notes: "" };
    const field = (label, input, wide) => `<label class="m-field${wide ? " rv-wide" : ""}"><span>${label}</span>${input}</label>`;
    screen({ title: isNew ? "New reservation" : "Change reservation", back: true,
      body: `<form id="rv-form" class="rv-form" novalidate>
        ${field("Name", `<input name="name" required maxlength="60" value="${esc(r.name)}" autocomplete="off">`)}
        ${field("How many people", `<input name="party" type="number" min="1" max="200" inputmode="numeric" required value="${esc(r.party)}">`)}
        ${field("Date", `<input name="date" type="date" required value="${esc(r.date)}">`)}
        ${field("Time", `<input name="time" type="time" step="900" required value="${esc(r.time)}">`)}
        ${field("Phone", `<input name="phone" type="tel" maxlength="30" value="${esc(r.phone)}" autocomplete="off">`)}
        ${field("Email <small>(optional)</small>", `<input name="email" type="email" maxlength="100" value="${esc(r.email)}" autocomplete="off">`)}
        ${field("Notes <small>(high chair, birthday, separate checks…)</small>", `<textarea name="notes" rows="2" maxlength="400">${esc(r.notes)}</textarea>`, true)}
        ${isNew || r.status === "booked" ? `<label class="check rv-wide"><input type="checkbox" name="emailIt" checked>
          <span>${isNew ? "Email them a confirmation" : "If the day, time or party size changed, email them"} (when there's an email)</span></label>` : ""}
        <p class="m-error rv-wide" id="rv-msg" hidden></p>
      </form>`,
      buttons: [{ label: "Back", act: "rv-book" }, { label: isNew ? "Book it" : "Save", submit: "rv-form", kind: "primary" }] });
    const form = document.getElementById("rv-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const msg = document.getElementById("rv-msg");
      const day = new Date(`${data.date}T12:00:00`).getDay();
      if (data.date && !view.openDays.includes(day) && !form.dataset.closedOk) {
        form.dataset.closedOk = "1";
        msg.hidden = false;
        msg.textContent = `${longDay(data.date)} is a day the cafe is closed. Press ${isNew ? "Book it" : "Save"} again to keep it anyway.`;
        return;
      }
      busy(TITLE, "Saving…");
      const res = await load("/api/front-reservation-save", { reservation: { ...data, id: isNew ? undefined : r.id }, email: !!data.emailIt });
      if (!res.ok) {
        showForm({ ...r, ...data }, isNew);
        const m = document.getElementById("rv-msg");
        m.hidden = false;
        m.textContent = res.message;
        return;
      }
      const saved = view.list.find((x) => x.id === res.id) || { ...r, ...data, party: Number(data.party) };
      const moved = !isNew && (r.date !== data.date || r.time !== data.time || Number(r.party) !== Number(data.party));
      done(res.message, saved, isNew ? "confirm" : moved && r.status === "booked" ? "change" : "");
    });
  }

  // What happened, then a way to call or text them when it matters.
  function done(message, r, kind) {
    screen({ title: TITLE, back: true,
      body: `<p class="m-result good">✓ ${esc(message)}</p>
        ${r && kind && r.phone ? `<p class="m-note">${r.email ? "To tell them by phone too:" : "No email, so call or text them:"}</p>${contactHtml(r, kind)}` : ""}`,
      buttons: [{ label: "Back to Reservations", act: "rv-book", kind: "primary" }] });
  }

  async function act(id, what, email) {
    const r = view.list.find((x) => x.id === id);
    busy(TITLE, what === "accept" && email ? "Booking and emailing…" : "Saving…");
    const res = await load("/api/front-reservation-act", { id, act: what, email });
    if (!res.ok) return result(TITLE, res);
    const kind = { accept: "confirm", restore: "confirm", decline: "decline", cancel: "cancel" }[what];
    if (kind) return done(res.message, r, kind);
    Front.rerender();
    showBook();
  }

  function askCancel(r) {
    screen({ title: "Cancel this table?", back: true,
      body: `<p><b>${esc(r.name)}</b>, ${people(r.party)}, ${esc(longDay(r.date))} at ${timeWords(r.time)}.</p>
        ${r.email ? `<label class="check m-check"><input type="checkbox" id="rv-cancel-email" checked><span>Email them that it's canceled</span></label>` : ""}`,
      buttons: [{ label: "Keep it", act: "rv-book" }, { label: "Cancel the table", act: "rv-cancel", kind: "danger" }] });
    Front.acts["rv-cancel"] = () => act(r.id, "cancel", !!document.getElementById("rv-cancel-email")?.checked);
  }

  // The buttons inside the screens (the footer's go through Front.acts).
  Front.dialog.addEventListener("click", (e) => {
    if (!view) return;
    const copy = e.target.closest("[data-r-copy]");
    if (copy) {
      const box = copy.parentElement.querySelector(".rv-text");
      box.select();
      // The page isn't https, so the clipboard API is off; this still works.
      try { document.execCommand("copy"); copy.textContent = "✓ Copied"; } catch { copy.textContent = "Select the text and copy it"; }
      return;
    }
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const id = b.closest("[data-id]")?.dataset.id;
    const r = view.list.find((x) => x.id === id);
    if (!r) return;
    const what = b.dataset.r;
    if (what === "edit") return showForm(r);
    if (what === "cancel-ask") return askCancel(r);
    const email = !!b.closest("[data-id]").querySelector("[data-r-email]")?.checked;
    act(id, what, email);
  });

  Front.tools.reservations = open;
  Front.acts["rv-new"] = () => showForm(null);
  Front.acts["rv-book"] = () => (view ? showBook() : open());
})();
