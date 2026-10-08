# Kitchen order board

A full-screen order display for the kitchen mini PC. It reads orders from Square and shows them as big tickets the cooks can see at a glance. The kitchen printer keeps printing as before; this is the big-screen view alongside it.

Not part of the website. Nothing in this folder is built or uploaded.

## What shows up

- **Counter orders** rung up on Square POS today. Square marks these finished as soon as they're paid; the Restaurants app also marks their pickup step complete. Because of that, the board ignores Square's "completed" on counter orders, and they stay up until a cook presses **Done**. They appear once paid: a check that was sent but not charged yet can't be seen by the board, only by the kitchen printer.
- **Unpaid counter orders** (pay-later phone orders) go to the kitchen straight away like any other, tagged **NOT PAID**: cook it and keep it in the warmer. The tag goes away by itself once it's paid in Square. If it was a sale that fell through (a declined card, a payment canceled on the terminal), the front presses **Canceled** and it leaves both screens.
- **Online / pickup orders** due today, starting an hour before pickup time. They leave the board when a cook presses **Done** *or* when the front marks them ready or picked up in Square Order Manager.
- **What the kitchen skips** (drinks, chips) is left off: single items, or whole Square categories. Skipped items go on the front page's "Add from the front" list instead. An order made up only of those items doesn't show at all. The list is changed live from the front page: **Manage → What the kitchen skips**. A ticked category also covers items added to it in Square later.
- Every ticket says **TO GO** (solid tag) or **FOR HERE** (outlined), as rung on the POS ("To Go" is the POS default). Online orders are always to go.
- **What a ticket is called:** the customer's name if one was typed. A ticket name that is just a number is a **table number**: it shows as **Table 5** and counts as **FOR HERE**, even if the dining option was left on To Go. With no name, a paid order shows its receipt number (`#` and four letters, the start of the payment's id); compare one against a printed receipt before relying on it.
- A ticket named **TEST** (or starting with it) is marked TEST and left out of the day's numbers.
- Amounts typed on the POS keypad show too, under the note typed with them (or "Custom amount"), in case a special or an off-menu plate gets rung up that way.

Header colors:

| Color | Counter order | Pickup order |
|---|---|---|
| Teal | under 8 min | — |
| Gray | — | due more than 10 min from now |
| Amber | 8–15 min | due within 10 min |
| Red | over 15 min | past due |

**Done does not text the customer.** The front still marks online orders ready in Order Manager, which is what sends the text.

## Using it

Everything works from a number pad, with Num Lock on or off. The mouse is there for precision.

| Key | Does |
|---|---|
| **1–9** | Done on that ticket (the number in its corner). **A ticket keeps its number until it's done:** when 1 is cleared, 2 stays 2. A new order takes the lowest free number, so the numbers on screen aren't always in order, but they never change under a cook. |
| **Backspace** or **0** | Undo: brings back the last ticket cleared. Press again to go further back. Still works after a restart. |
| **+** / **−** | Scroll down / up |
| **Enter** | Check Square right now instead of waiting for the next check |

- With more than nine tickets up, the extras have no number until one frees up. Use the mouse for those, or clear some first.
- **Undo with the mouse:** click Undo for a list of everything cleared today (name, first item, how long ago) and click the one to bring back. Backspace / 0 still steps back one at a time.
- **A new order** flashes amber around the edge of the whole screen, and the ticket keeps an amber outline and a **NEW** tag for a minute. Without speakers, that's the only alert, so it lasts long enough to be noticed from the grill.
- **Allergy notes** (peanut, gluten, dairy and the like) show in red with a ⚠ sign, on the ticket or on the item.
- **The board checks Square every 5 seconds.** The refresh icon in the top right has a ring that empties as the next check approaches and refills when it runs. Tap it (or press **Enter**) to check right now. The ring turns amber when Square can't be reached.
- **The speaker icon** mutes and unmutes the chime and the alarm. Muted shows amber with a cross, and that screen remembers the setting until someone taps it again.
- **A two-tone chime** means a new order. **A low falling tone** plus an amber banner means the board lost Square or its own program. Tickets shown at that point might be out of date, and new ones might be missing, so go by the printer until it clears.
- **An amber "continues below" pointer** appears when a ticket runs off the bottom of the screen. Press **+** to see it.
- **The power button** in the top right opens the board menu. It works with the mouse only, so nothing on the number pad can open it or confirm anything in it.
  - **Settings & help:** the key guide, today's numbers (orders, breakfast / lunch, average time in the kitchen, most ordered), whether sound is on, and a link to the order check page. **Demo orders** adds practice tickets for training the staff (see below). **Reset for the day** clears the Undo list on both screens (so test or yesterday's tickets can't come back with a stray Backspace) and restarts today's stats from that moment. Tick **Also clear every order on the board** to empty both screens too: the morning after testing, before the doors open. The key guide also shows on the board when there are no orders.
  - **Check for updates:** looks for new board code. If there is any, it runs `start-kitchen.bat`, which installs it and restarts the board in about 10 seconds. If not, it says the board is up to date.
  - **Close the board:** back to Windows. Run `start-kitchen.bat` to bring it back.
  - **Restart the PC** and **Shut down the PC:** each asks first, then counts down from 5 with a big Cancel. Prefer Restart when working remotely: once the PC is off, someone has to press its power button.
  - In test mode (`KITCHEN_MOCK=1`) the power items only say what they would have done, so a laptop running the test board can't be shut down from it.
- **Sound needs speakers.** Make sure they're plugged in, set as the default output in Windows, and not muted.

## Setting up the mini PC (one time)

1. **Install Node.js** (the LTS version) from nodejs.org, and **Google Chrome** (Microsoft Edge also works). Use the default options.
2. **Copy this `kitchen` folder** onto the PC, for example `C:\KitchenBoard`. Nothing else from the repo is needed, and there's nothing to `npm install`.
3. **Get a Square access token.**
   1. Go to developer.squareup.com and sign in with the cafe's Square account.
   2. Create an application (call it "Kitchen Board") and open it.
   3. Switch to **Production**, open **Credentials**, and copy the **Production Access token**.

   Treat the token like a password. It never goes in git, an email, or a text message.
4. **Copy `config.example.json` to `config.json`** and paste in the token. `config.json` is gitignored, so updates never touch it. `skipItems` is only the starting skip list; once it's changed from the front page (Manage → What the kitchen skips), that list is kept on the PC and `skipItems` no longer matters. Keep only those two settings: every other setting has a built-in default, and a line in `config.json` pins that setting so updates can't improve it. The board lists any such line when it starts and on `/check`.
5. **Double-click `start-kitchen.bat`.** It first pulls the latest board code with git (if the internet is down, it starts the version already on the PC). Then a minimized window runs the board program, and Chrome opens full-screen on the board. Press **Alt+F4** to leave full-screen. A desktop shortcut to it is fine. Running it again replaces the board program and the board window, never stacks a second one, and leaves everything else on the PC alone.
6. **Start it automatically.** Press Win+R and type `shell:startup`, then put a shortcut to `start-kitchen.bat` in that folder. Also set:
   - Settings → System → Power: **screen and sleep to Never**.
   - Windows to sign in automatically after a restart (run `netplwiz` and uncheck "Users must enter a user name and password"). Do this only if the kitchen PC is used for nothing else.
   - Windows Update **active hours** to cover service, so the PC doesn't restart mid-lunch.

## Updating the board

Push the change to the `kitchen-board` branch from any computer, then restart the board on the kitchen PC: run `start-kitchen.bat` or restart the PC. Before starting, it fetches that branch, switches to it (so a copy cloned on `main` still ends up on the board's code), and fast-forwards. The branch is set at the top of `start-kitchen.bat` (`BOARD_BRANCH`); change it to `main` once the board is merged. If git isn't installed or the update fails, it says so on screen and starts the version already there. `config.json` and `state.json` (cleared tickets) are never changed by an update.

## Training: demo orders

**Settings → Demo orders** adds a small lunch rush of practice tickets from the real menu: counter orders of different ages (so the amber and red show), two online pickups, a peanut-allergy note, a ketchup packet and drinks for the front, then a new order every minute for six minutes (so the NEW tag, the edge flash and the chime can be shown).

- They show on the board **and** the front page, dashed and tagged **DEMO**, with a purple banner on both.
- **Real orders keep showing** alongside them. A real order during training is never hidden.
- Done, Undo and Handed off all work on them, but nothing about them is saved and they never count in the stats.
- They stop by themselves after **30 minutes**, or press **End demo** in Settings.

## The front page (counter laptop or tablet)

The same orders for the counter, on any laptop, tablet or phone on the cafe wifi: `http://<kitchen PC name>:8090/front`. The board program prints the exact address when it starts, and `/check` shows it too. Bookmark it by the PC's name, not its IP address, because the router can change the address.

- **Not paid:** an order with no payment on it has a red band with how much is due, and a **Canceled** button next to Handed off. Canceled takes it off the kitchen board too; Undo in the top bar brings it back to both.
- **Ready** (green, on top): the kitchen pressed Done, so the food is coming out. It chimes once the laptop's **Sound** button is on.
- **Cooking:** still on the kitchen board. A pickup counts down to its pickup time; a counter order counts up from when it was rung.
- **Add from the front:** the order's skip-list items (drinks, chips) and any condiment packets: what the counter puts in the bag. A Square modifier with **"packet"** in its name ("Ketchup packet") is moved off the kitchen ticket and onto this list, totalled across the order. Tap a line to tick it off while bagging. Ticks are kept on that device only.
- **Online orders** say whether they've been marked ready in Square Order Manager. That step is still what texts the customer, and an order marked ready there stays on the front page until it's handed off.
- **An online order of only drinks or chips** shows on the front page only, as Ready: there's nothing for the kitchen to make. A counter sale of only those doesn't show anywhere, because it's handed over as it's rung up.
- **Handed off** clears an order from the front page only; it never touches the kitchen board. **Undo** in the top bar lists today's hand-offs; click one to bring it back.
- **Ready orders clear themselves** after 10 minutes if nobody presses Handed off (`autoHandoffMinutes`; the Ready heading says so). They go on Undo, marked "cleared by itself", and one brought back stays until it's handed off by hand. Two kinds never clear themselves: a **not paid** order, and an **online order not yet marked ready in Square** (that step texts the customer).
- **Today**, under the orders: how many orders so far, breakfast vs lunch (before or after 11am, by when it was rung up or due), counter vs online, average and longest time in the kitchen (counter orders, rung up to Done; if a ticket is undone and Done again, the time it sat cleared doesn't count), and the most ordered items. Canceled orders and unpaid open checks aren't counted.

Only the front page, its Handed off and Undo, and the PIN-protected Manage actions answer other devices. The kitchen board, `/check`, Done, the power menu and updates answer the kitchen PC alone.

### On a phone, like an app

The front page works on a phone on the cafe wifi: the orders stack in one column, and Manage opens full screen.

- **Put it on the home screen.** iPhone: open the front page in Safari, tap Share, then **Add to Home Screen**. Android: open it in Chrome, tap ⋮, then **Add to Home screen**. The icon is a cream C on teal, named "Café Front". On an iPhone it opens full screen, with no address bar. Android may open it in an ordinary Chrome tab, because the kitchen PC isn't on https; it works the same.
- **If the phone can't find the PC by name** (`http://kitchen-pc:8090/front`), try the name with `.local` on the end (`http://kitchen-pc.local:8090/front`). Phones often don't know Windows names without it.
- **Remember on this device**, under the PIN, keeps the PIN on that phone, so Manage opens straight to its menu. Use it on your own phone only. **Forget the PIN here** at the foot of the Manage menu removes it, and a phone forgets it by itself if the PIN is changed in `config.json`.
- **Only on the cafe wifi.** The kitchen PC isn't on the internet, on purpose, so the page doesn't open from home or on mobile data.

### A fixed address for the front page (for the iPad's bookmark)

The router hands out addresses and can give the kitchen PC a different one after a restart, which breaks a bookmark made by address. The fix is a **DHCP reservation** in the router: it tells the router to always give the kitchen PC the same address.

1. **Find the PC's address and hardware address.** Start the board: its program window prints `or by address: http://192.168.1.117:8090/front (Ethernet, hardware address 70:85:c2:…)`, and **http://localhost:8090/check** shows the same. Use the line for the connection the PC actually uses (Wi-Fi or Ethernet).
2. **On Wi-Fi only: turn off random hardware addresses**, or the PC shows the router a different one now and then: Settings → Network & internet → Wi-Fi → the cafe network → **Random hardware addresses: Off**. Then restart the board and read the hardware address again. A cable (Ethernet) to the router avoids this and is steadier for the kitchen anyway.
3. **In the router's admin page** (its address and password are usually on a sticker on the router, often http://192.168.1.1), find **DHCP reservation**, "Address reservation" or "Static lease" (under LAN or DHCP settings). Add the kitchen PC by its hardware address, with the address it has now. Save.
4. **Bookmark it on the iPad:** `http://<that address>:8090/front` in Safari, then Share → **Add to Home Screen**.

If the router has a **local DNS / hostname** setting, a name like `kitchen` pointing at that address works too (`http://kitchen:8090/front`); many home and ISP routers don't have one, and the reservation is what matters either way. Without router access, the PC can be given a fixed address itself (Settings → Network → the connection → IP assignment → Edit → Manual), but pick one outside the router's DHCP range or two devices can end up with the same address; ask whoever manages the router first.

### Setting it up (one time, on the kitchen PC)

1. **Allow it through Windows Firewall.** In PowerShell **as administrator**:
   ```powershell
   New-NetFirewallRule -DisplayName "Kitchen board front page" -Direction Inbound -Program (Get-Command node).Source -Protocol TCP -LocalPort 8090 -Action Allow -Profile Private
   ```
   Do this before the board next starts. Otherwise Windows pops up its own firewall question over the full-screen board.
2. **Set the cafe wifi to Private** on the kitchen PC: Settings → Network & Internet → the wifi or Ethernet connection → Network profile: **Private**. On a Public network the rule above doesn't apply, and the front page won't load from other devices.
3. **Restart the board** (Check for updates, or restart the PC). The program window then says `Front page for the counter: http://…/front`. Open that address on the laptop.

Settings in `config.json`, both optional:

| Setting | Default | What it does |
|---|---|---|
| `frontOnNetwork` | `true` | `false` keeps everything on the kitchen PC; `/front` then works only there. |
| `frontKey` | none | If set, other devices must open `/front?key=<the key>`. Bookmark the full address. Worth setting if customers ever share the staff wifi. |
| `autoHandoffMinutes` | `10` | Ready orders leave the front page by themselves after this long (see above). `0` turns it off. |
| `specialsUrl` | `https://lvcafetogo.com/specials.json` | Where **Plan the week** reads the website's specials from. `""` turns that off. |
| `openDays` | `[1, 2, 3, 4, 5]` | The days Plan the week lists (0 is Sunday, 6 Saturday). |
| `updatePin` | none | Turns on **Manage** on the front page: enter the PIN once, then pick a job from the menu (Back returns to it; closing the panel forgets the PIN, unless **Remember on this device** was ticked). With this PIN it can **Plan the week** (see below), change the **Desserts** (see below), set **Today's specials** (the prices of the items in `dailyItems`, saved straight into Square; see below), change **What the kitchen skips** (every Square category with its items; tick an item, or a whole category), **Check for updates** (the board's own update; it restarts in about 10 seconds if there's anything new) or **Reset for the day** (same as the board's, including the clear-the-board option), or see **Reports** (see below). Five wrong PINs in 10 minutes locks it for 10 minutes. Without it, Manage says it isn't set up. Example: `"updatePin": "2468"`. |

## When an order doesn't show up

Open **http://localhost:8090/check** in a normal Chrome window. Alt+Tab out of the board, or press Alt+F4 and reopen it with `start-kitchen.bat` afterwards. The page lists every order Square sent on its last check. For each one it says whether it's on the board, and if not, why: cleared with Done, every item on the skip list, pickup still more than an hour away, and so on. It also shows the current skip list and whether the Square catalog (needed to skip whole categories) could be read.

- **A ticket says TO GO when it should say FOR HERE, or the other way round:** the "Board type" column says which the board decided, and "From Square" shows what it was decided from. The POS records "To Go" as a PICKUP fulfillment; an order with no fulfillment, or any other kind, counts as for here.

- **If the order is missing from the list entirely**, Square didn't return it. Check the location shown at the top of the page, and check that the token belongs to the cafe's Square account.
- The minimized **"Kitchen board program"** window logs every new order it sees the same way, along with any errors from Square.

## Trying it without Square

From a command prompt in this folder:

```
set KITCHEN_MOCK=1
start-kitchen.bat
```

This shows fake orders and adds a new one every 45 seconds, so you can hear the chime. Bumps in test mode go to `state-mock.json` and never mix with real ones.

To test without sound (on another computer, say), also run `set KITCHEN_MUTE=1` before `start-kitchen.bat`, or just tap the speaker icon. A muted speaker shows amber, so a silent board can't go unnoticed. To silence the kitchen PC for good, add `"sound": false` to `config.json`, but the chime is how a new order gets noticed, so leave it on there.

## Files

| File | What it is |
|---|---|
| `server.js` | Polls Square every 5 s and serves the board on `http://localhost:8090`. It only listens on the PC itself, not the network, and the power menu and update check only answer the board page itself. |
| `board.html` | The kitchen screen. |
| `front.html` | The front page for the counter (`/front`). |
| `config.json` | The token and settings. Only on the kitchen PC; gitignored. |
| `state.json` | Which orders have been cleared. Created automatically; gitignored. |
| `photos\` | Photo post: the photos and finished posts kept for the website, with `photos.json`. Gitignored. |
| `wordmark.svg` | The Café wordmark drawn into Photo post's pictures. |
| `stats-history.json` | Every day's orders and numbers, for Reports. Created automatically; gitignored; never deleted. |
| `specials-plan.json` | Plan the week: the days ahead and which are in Square already. Created automatically; gitignored. |
| `icon-*.png` | The front page's home-screen icon. |
| `start-kitchen.bat` | Pulls updates, starts the program (restarting it if it ever stops), and opens Chrome in kiosk mode. Replaces any copy already running. |
| `focus-board.ps1` | Run by `start-kitchen.bat` after Chrome opens: brings the board window to the front so the number pad types into it, not into a console window. Tries for 20 seconds; if it can't, click the board once. |

## Today's specials (Manage on the front page)

Sets the day's prices in Square from the front page, with the PIN: the items named in `dailyItems` in `config.json` (default: Lunch Special, Soup of the Day, Salad of the Day; names exactly as in Square). Each item has **What it is today** and a price box per size; leave a price blank to have the till ask for it. What it is today is added to the item's size names in Square, so it prints on the kitchen ticket and the receipt after the item name: Lunch Special's one size becomes "BBQ Ribs", and the soup's sizes become "Cup · Chicken Dumpling" and "Bowl · Chicken Dumpling". Clearing the box puts the plain names back. The item's own name never changes. On a day nothing changes, nobody needs to open it.

This is the **only thing the board writes to Square**. It changes nothing but those items' prices and size names, reads each item fresh before saving, and if someone changed the item in the Dashboard a moment before, Square refuses the save and the front is asked to open it again, so nothing is overwritten. A mistyped price saves nothing at all.

## Plan the week (Manage on the front page)

The specials for today and the next two weeks, set ahead of time. **Each morning the board puts that day's specials into Square by itself**, as soon as it starts (or, if it was left on overnight, within a minute of midnight). Nothing has to be opened on the day. It's the same write as Today's specials below: the "what it is today" name, and a price only if one is planned.

- **One row per day the cafe is open.** Tap a day to open it: the special and the soup (every item in `dailyItems`), each with its price boxes, and **Comes with** under the special: its sides, with commas between ("Mashed potatoes & gravy, green beans"). Days from the website bring their sides with them. The sides don't go into Square (the ticket names the plate); Photo post words the special with them ("Served with mashed potatoes & gravy and green beans"). **A blank price keeps whatever Square has** (shown faintly; "till" means the till asks for one). Type a price only when it changes that day.
- **Days come in from the website by themselves.** Every half hour the board reads the specials the website publishes (`specialsUrl`, built from the site's `src/_data/specials.json`, the same days as the /menu box and the Facebook post). The plate goes into Lunch Special and the soup into Soup of the Day. They're tagged **From the website**.
- **The website never overwrites:**
  - **today**, once it's in Square (and no earlier day);
  - **a day changed here**, tagged **Set here**. From then on the website's copy of that day is ignored.
  
  So putting next week on the website mid-week changes nothing for this week. A day the website still lists can't be blanked here (clearing it lets the website's copy back in on the next read); change it on the website instead, or type something else here.
- **Today** shows whether it's in Square yet. Saving today puts it in straight away. If Square refuses (no internet, say), it says so and the board tries again every 5 minutes.
- **A day with nothing planned** puts the plain names back ("Regular", "Cup", "Bowl") that morning, so yesterday's plate never prints on today's tickets. Prices are left alone. A board that has never had a plan leaves Square alone.
- **Today's specials** (below) still works for a change during the day. It edits Square directly and isn't undone by the plan; the plan only writes again if today's plan is changed.
- The plan is kept in `specials-plan.json` on the kitchen PC (gitignored). The program window logs every day it reads from the website and every write to Square.

## Photo post (Manage on the front page)

Makes the Facebook dish post (the same 1080 × 1250 picture as the website's `/studio/` dish posts) on the phone, from a photo taken there and then. Nothing is generated anywhere else and nothing costs anything: the phone draws it.

1. **Take or choose a photo.** The phone's camera or photo library.
2. **What's in the photo:** today's special or soup (from Plan the week, with the website's sides), "A special" to type one in, or any item in Square (its category, name and description come from Square).
3. **Change any of the words:** the name, the line above it, the words under the photo, and **Drink included** for a special. The picture redraws as you type.
4. **Frame it:** drag the picture to move it, and zoom with the slider. The post shows a square of it.
5. **Make the picture.** Press and hold it to save it to the phone's photos (or Download), and **Copy caption**: worded like the website's dish posts, with the order link, hours and menu link.

**Keep the photo on the kitchen PC for the website** (ticked by default) saves the photo (2000px, re-drawn on the phone so its GPS location is gone) and the finished post in `photos\` on the kitchen PC, listed in `photos\photos.json` in the same shape as the website's `src/_data/photos.json`. To put them on the website, copy that folder off the PC and move the entries over (or ask Claude to); each needs its `alt` text written then.

- The post's fonts load from Google Fonts on the phone, like the website's. Without internet the picture uses plain fonts and the screen says so.
- The phone number, web address, hours and order link in the picture and caption are set near the top of the Photo post code in `front.html` (`SITE`). Change them there along with the website's `site.json`.

## Reports and the daily history (Manage on the front page)

**Every day's numbers are kept for good** in `stats-history.json` on the kitchen PC, one entry per day, saved as the day goes (every 30 seconds while orders come in), so nothing depends on the board being closed properly at night. Each day keeps every order that counted: when, breakfast or lunch, counter or online, to go or for here, paid, its total in Square, the items (with the size or "what it is today", so a report can tell which specials sold), and its time in the kitchen. No customer names. Test, demo and canceled orders never get in, and a **Reset for the day** restarts that day's history the same as Today's numbers.

**Manage → Reports** shows any range of days: This week, Last week, This month, Last month, Last 30 days, or any two dates. For the range: orders (and a day's average), sales, breakfast / lunch, counter / online, to go / for here, average and longest time in the kitchen, a line per day, and every item ordered. Two downloads for a report made elsewhere (a spreadsheet opens them):

- **Days (CSV):** one row per day.
- **Every order (CSV):** one row per order, with its items.

A day the board never ran is missing; Square's own reports still have its sales. Sales are each order's total in Square, tax included. To keep a copy off the PC, copy `stats-history.json` somewhere now and then: it's the only place the kitchen times exist.

## Desserts (Manage on the front page)

For the items in `dessertItems` in `config.json` (default: Cheesecake, Dessert Bar; names exactly as in Square): the item's photo and the options in its modifier lists, such as the cheesecake flavors. Works on a phone on the cafe wifi.

- **Untick an option** to hide it from online ordering (Square's "hidden online"). It stays in Square, and ticking it again brings it back. Square doesn't let other programs mark something sold out at the till; do that on the iPad.
- **Add** puts a new option on the list, at no extra charge; it's created in Square when you press Save.
- **Change photo** opens the phone's camera or photo library. The phone shrinks the picture and re-draws it before uploading, which also strips the GPS location phones save in photos. It becomes the item's main picture in Square, the one online ordering shows.

Like Today's specials, every save reads fresh from Square first, so a change made in the Dashboard meanwhile is never overwritten.
