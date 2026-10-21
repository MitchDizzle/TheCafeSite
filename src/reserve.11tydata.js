// /reserve's time picker: every quarter hour from the first seating to the
// last, from site.json's reservations block, as { value: "11:30", label: "11:30 am" }.
const { reservations } = require("./_data/site.json");

const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const pad = (n) => String(n).padStart(2, "0");

const slots = [];
for (let t = minutes(reservations.firstSeating); t <= minutes(reservations.lastSeating); t += 15) {
  const h = Math.floor(t / 60);
  const m = t % 60;
  slots.push({ value: `${pad(h)}:${pad(m)}`, label: `${h % 12 || 12}:${pad(m)} ${h < 12 ? "am" : "pm"}` });
}

module.exports = { slots };
