// Dates and words used all over the board.

// Midnight today, on this PC's clock.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// The kitchen PC's own calendar date, "2026-10-08". The PC is on the cafe's
// time, so this is Central time.
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "Thu Oct 8", for messages.
const dayWords = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const cleanText = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
const PRICE = /^\d{1,3}(\.\d{1,2})?$/;

module.exports = { startOfToday, localDate, dayWords, cleanText, PRICE };
