# How to read the order history

The kitchen board saves every order it counts (the same ones as Manage →
Reports) and backs them up here. This page says where they are, how to read
them, and what each field means. The board rewrites this page with each
backup (it lives in TheCafeSite, `kitchen/backup-tools/`), so change it there.

## Where

| File | What's in it |
|---|---|
| `history/2026-11-02.json` | One day this month. One order a line, readable on GitHub. |
| `history/2026-10.json.gz` | A finished month, all its days, zipped. GitHub can't show it: use the script. |
| `tools/read-history.js` | Reads both. Needs Node (the kitchen PC and the owner's PC have it). |

No customer names are saved, only what was ordered and when.

## The script

From this folder (the clone of the backup repo):

```
node tools/read-history.js                         every day, summed up
node tools/read-history.js 2026-10                 October
node tools/read-history.js 2026-10-26 2026-11-01   a range of days
node tools/read-history.js 2026-10 --csv october.csv      one row per order, opens in Excel
node tools/read-history.js 2026-10 --items october-items.csv   one row per item
node tools/read-history.js --restore stats-history.json   everything, back into the board's file
```

The summary shows each day (orders, sales, breakfast/lunch, online, average
and longest kitchen time), then the range: totals, the three slowest orders,
orders by hour, the top ten items and the Lunch Specials sold.

**Putting the history back on the kitchen PC** (a new PC, or a lost file):
run `--restore`, close the board, copy the file to
`kitchen\data\stats-history.json`, and start the board again.

**Opening a zipped month by hand:** 7-Zip opens a `.gz` (right-click → 7-Zip →
Extract here). Inside is the same text as the day files, every day of the month.

## A day's file

```
{"savedAt":"2026-11-02T19:00:12.000Z","orders":[
{"id":"7wKf...","receipt":"K3FA","at":"2026-11-02T12:00:38.110Z","meal":"breakfast","online":false,"doordash":false,"toGo":true,"paid":true,"sales":20.25,"net":18.5,"tip":0,"items":[{"name":"Breakfast Sandwich","variation":null,"qty":3}],"done":true,"kitchenItems":3,"kitchenMinutes":7.6,"waitMinutes":null},
...
]}
```

`savedAt` is when the board last wrote the day. A finished month's file is
`{"days":{"2026-10-05":<that day, as above>, ...}}`.

## Each order

| Field | Means |
|---|---|
| `id` | Square's order id. Square's Dashboard can find the order by it. |
| `receipt` | The 4 letters on the receipt (as the board shows a ticket with no name). From Nov 2, 2026. |
| `at` | When it was rung up, or for a pickup, when it was due. **UTC**: Central time is 5 hours earlier (6 in winter). The script shows Central. |
| `meal` | `breakfast` before 11am, else `lunch`. |
| `online` | `true` for Square Online and DoorDash, `false` at the counter. |
| `doordash` | `true` for DoorDash. From Nov 2, 2026; older orders don't have it. |
| `toGo` | To go (or online), not for here. |
| `paid` | Paid in Square when last saved. |
| `sales` | What the customer paid, tax and tip in. |
| `net` | Square's Net sales: the items after discounts, no tax or tip. This is "Sales" in Reports. |
| `tip` | The tip. |
| `items` | What was ordered: `name`, `variation` (size, or for Lunch Special and Soup of the Day what it was that day: `"Meatloaf"`, `"Cup · Ham & Beans"`), `qty`. |
| `done` | The kitchen pressed Done. |
| `kitchenItems` | What the kitchen made (5 wraps is 5; drinks and chips aren't counted). |
| `kitchenMinutes` | Time on the kitchen board, from going on it to Done. `null` if it never got a Done. |
| `waitMinutes` | Online orders: Done until Handed off was pressed at the front (for DoorDash, the Dasher's wait). From Nov 2, 2026. |

Test orders, demo orders and canceled sales are never saved.
