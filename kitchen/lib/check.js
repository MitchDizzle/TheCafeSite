// The troubleshooting page (/check), and the front page's addresses on the
// wifi, which it shows and the program window prints at startup.
const os = require("os");
const { MOCK, cfg } = require("./config");
const { startOfToday } = require("./util");
const { locations } = require("./square");
const { catalog } = require("./catalog");
const { live } = require("./live");
const { skipSummary } = require("./state");
const { backupStatus } = require("./backup");
const { offsiteStatus, repoUrl } = require("./offsite");
const { reservationsLine } = require("./reservations");
const { itemName, hiddenReason, orderDetail } = require("./tickets");

const FRONT_URL = `http://${os.hostname().toLowerCase()}:${cfg.port}/front${cfg.frontKey ? "?key=" + encodeURIComponent(cfg.frontKey) : ""}`;
// The same page by this PC's address on the wifi, with the adapter it's on
// and that adapter's hardware (MAC) address: what a router needs to always
// give this PC the same address (a DHCP reservation), so an iPad bookmark
// to it keeps working. See "A fixed address for the front page" in README.md.
function frontAddresses() {
  const out = [];
  for (const [adapter, list] of Object.entries(os.networkInterfaces())) {
    // Virtual adapters (Hyper-V, VirtualBox, VMware) aren't the wifi.
    if (/vEthernet|VirtualBox|VMware|Loopback/i.test(adapter)) continue;
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      out.push({ adapter, mac: a.mac, url: FRONT_URL.replace(`//${os.hostname().toLowerCase()}:`, `//${a.address}:`) });
    }
  }
  return out;
}

const esc = (v) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// When data\ was last copied, here and to backupDir, in words.
function backupLine() {
  const when = (s) => !s ? "not yet" : s.error ? `<b style="color:#A02F26">failed: ${esc(s.error)}</b>` : esc(new Date(s.at).toLocaleString());
  if (MOCK) return "off in test mode.";
  const github = !cfg.backupRepo ? "not set up (backupRepo in config.json)"
    : offsiteStatus.error ? `<b style="color:#A02F26">failed: ${esc(offsiteStatus.error)}</b>`
    : offsiteStatus.at ? esc(new Date(offsiteStatus.at).toLocaleString()) : "not yet";
  const key = offsiteStatus.publicKey
    ? `<br>This PC's backup key (GitHub: the repo's Settings &rarr; Deploy keys &rarr; Add deploy key, tick Allow write access):<br><code style="user-select:all;word-break:break-all">${esc(offsiteStatus.publicKey)}</code>` : "";
  return `on this PC (data\\backups) ${when(backupStatus.local)}; ` +
    (cfg.backupDir ? `to ${esc(cfg.backupDir)} ${when(backupStatus.away)}; ` : "") +
    `to GitHub${cfg.backupRepo ? ` (${esc(repoUrl())})` : ""} ${github}.${key}`;
}

// A plain troubleshooting page: every order Square returned on the last poll
// and whether it's on the board, and if not, why. Open
// http://localhost:8090/check in a normal Chrome window.
function checkPage() {
  const now = Date.now();
  const rows = [
    ...live.all.map((t) => ({
      id: t.id,
      created: t.createdAt,
      kind: `${t.kind} · ${t.toGo ? "to go" : "for here"}${t.table ? ` · table ${t.table}` : ""}${t.unpaid ? " · NOT PAID" : ""}${t.test ? " · TEST" : ""}`,
      detail: t.detail,
      items: t.items.map((i) => `${i.qty}× ${i.name}${i.toGo ? " (TO GO)" : ""}`).join(", "),
      status: hiddenReason(t, now) || "ON THE BOARD",
    })),
    ...live.rejected.map(({ order: o, reason }) => ({
      id: o.id,
      created: o.created_at,
      kind: "—",
      detail: orderDetail(o),
      items: (o.line_items || [])
        .map((li) => `${li.quantity}× ${itemName(li)} [${li.item_type || "ITEM"}]`)
        .join(", "),
      status: reason,
    })),
  ].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  const status = live.lastError
    ? `<p style="color:#A02F26"><b>Square error:</b> ${esc(live.lastError)}</p>`
    : `<p>Last successful check with Square: ${live.lastOkAt ? esc(new Date(live.lastOkAt).toLocaleTimeString()) : "not yet"}</p>`;
  return `<!DOCTYPE html><meta charset="utf-8"><title>Kitchen board check</title>
<style>body{font:16px system-ui,sans-serif;margin:24px;color:#22323A}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#EEE}</style>
<p><a href="/" style="font-size:20px">&larr; Back to the board</a></p>
<h1>Kitchen board check</h1>
${MOCK ? "<p><b>TEST MODE</b> — fake orders, not Square.</p>" : ""}
<p>Front page for the counter: ${cfg.frontOnNetwork ? `<b>${esc(FRONT_URL)}</b>` : "this PC only (frontOnNetwork is false)"}</p>
${cfg.frontOnNetwork ? frontAddresses().map((a) => `<p>&nbsp;&nbsp;or by address: <b>${esc(a.url)}</b> (${esc(a.adapter)}, hardware address <code>${esc(a.mac)}</code>)</p>`).join("") : ""}
<p>Locations: ${esc(locations().join(", ") || "not looked up yet")} · Showing counter sales since
${esc(startOfToday().toLocaleString())} and pickups due within ${cfg.showAheadMinutes} min.</p>
${status}
<p>Kitchen skips: ${esc(skipSummary())}. Square catalog:
${catalog.error ? `<b style="color:#A02F26">${esc(catalog.error)}</b> (skipping whole categories needs it)` : catalog.loadedAt ? `${catalog.categories.length} categories, read at ${esc(new Date(catalog.loadedAt).toLocaleTimeString())}` : "not read yet"}.</p>
<p>Backup: ${backupLine()}</p>
<p>Reservations: ${esc(reservationsLine())}</p>
${cfg.notes.length ? `<h2>config.json</h2><ul>${cfg.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "<p>config.json: no problems found.</p>"}
<p>${rows.length} order(s) came back from Square. Refresh to update.</p>
<table><tr><th>Created</th><th>Order</th><th>Board type</th><th>From Square</th><th>Items</th><th>Board</th></tr>
${rows
  .map(
    (r) => `<tr><td>${esc(new Date(r.created).toLocaleTimeString())}</td><td>...${esc(r.id.slice(-6))}${live.rawOrders.has(r.id) ? ` <a href="/check/raw?id=${encodeURIComponent(r.id)}">raw</a>` : ""}</td>
<td>${esc(r.kind)}</td><td>${esc(r.detail)}</td><td>${esc(r.items)}</td><td>${esc(r.status)}</td></tr>`
  )
  .join("")}
</table>`;
}

module.exports = { FRONT_URL, frontAddresses, checkPage };
