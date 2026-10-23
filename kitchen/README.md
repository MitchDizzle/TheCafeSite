# Kitchen order board

A full-screen order display for the kitchen mini PC. It reads orders from Square and shows them as big tickets the cooks can see at a glance. The kitchen printer keeps printing as before; this is the big-screen view alongside it.

Not part of the website. Nothing in this folder is built or uploaded.

## What shows up

- **Counter orders** rung up on Square POS today. Square marks these finished as soon as they're paid; the Restaurants app also marks their pickup step complete. Because of that, the board ignores Square's "completed" on counter orders, and they stay up until a cook presses **Done**. They appear once paid: a check that was sent but not charged yet can't be seen by the board, only by the kitchen printer.
- **Unpaid counter orders** (pay-later phone orders) go to the kitchen straight away like any other, tagged **NOT PAID**: cook it and keep it in the warmer. The tag goes away by itself once it's paid in Square. If it was a sale that fell through (a declined card, a payment canceled on the terminal), the front presses **Canceled** and it leaves both screens.
- **Online / pickup orders** due today, starting 15 minutes before pickup time (`showAheadMinutes`; an hour until 2026-10-21). From an hour before (`waitRowMinutes`) they wait in the **WAIT UNTIL** row along the bottom of the board: small and dim, with the time they come up and what's on them, no number key. The front page has them from then too. They leave the board when a cook presses **Done** *or* when the front marks them ready or picked up in Square Order Manager. Square Online orders come from Square named "Ordering Profile - Web" and show as **Online**.
- **DoorDash orders** show as **DoorDash**, timed to when the Dasher comes for them (seen 2026-10-12: Square sends them as a DoorDash-managed delivery, paid). Uber Eats and Grubhub would be treated the same way. **They wait for a Dasher** (client 2026-10-21): a DoorDash order goes on the kitchen board once a Dasher has taken it (DoorDash then writes "Courier Name" into the order) or 15 minutes after it came in, whichever is first (`dasherWaitMinutes`; 0 = at once). Until then it's in the WAIT UNTIL row, "1:15 or a Dasher". The front page shows it straight away, as "Waiting for a Dasher · kitchen by 1:15".
- **What the kitchen skips** (drinks, chips) is left off: single items, or whole Square categories. Skipped items go on the front page's "Add from the front" list instead, and a counter sale made up only of those items doesn't show at all. **Not for online and DoorDash orders:** the kitchen bags those whole, so their tickets list every item, drinks, chips and packets included, and the front has nothing to add. The list is changed live from the front page: **Manage → Leave off kitchen tickets**. A ticked category also covers items added to it in Square later.
- Every ticket says **TO GO** (solid tag) or **FOR HERE** (outlined), as rung on the POS ("To Go" is the POS default). Online orders are always to go.
- **Some items to go on a For Here ticket** (eating here, and a plate to take home): items set to To Go on the POS go **last** on the ticket, under a dashed line with a **TO GO** tag, so the plates come first and the to-go ones get boxed. Such a ticket takes **two Dones**: the first (its button says **Plates done**) is for the plates, and the ticket stays in its spot, grey and untimed, with only the to-go items, until a second Done. Its kitchen time in the stats stops at the plates, so a bag made later doesn't count against it. Undo steps back one Done at a time ("Undo Table 7 plates"). The front page shows the same, "+2 to go" next to For Here, and "Plates out 12:31 · to go cooking" in between. This is read from how the POS records a split order (a For Here and a To Go fulfillment, each listing its items), or a modifier named "To Go" on the item. **Not yet checked against a real split order:** ring one up, and if the items don't move, open `/check` and send the order's **raw** link (Square's own copy of the order) to whoever looks after the board.
- **What a ticket is called:** the customer's name if one was typed. A ticket name that is just a number is a **table number**: it shows as **Table 5** and counts as **FOR HERE**, even if the dining option was left on To Go. Two or more orders rung under the same table number within 15 minutes of each other (people sitting together, rung separately) are tagged **1 of 2**, **2 of 2** beside the name on both screens, so they go out together; the same number later in the day is a new table. With no name, a paid order shows its receipt number (`#` and four letters, the start of the payment's id); compare one against a printed receipt before relying on it.
- **A time in the ticket name** (a phone order for later: "Mike 1:00", "Sue 11:30am", "Bob 1pm") makes it due then, like an online pickup: the board shows **Due 1:00**, the front "Counter · due 1:00 PM", the ticket is called just **Mike**, and it goes on the board 15 minutes before (in the WAIT UNTIL row from an hour before). It needs a colon or am/pm ("Mike 2" is just a name). Without am/pm it's the next one after it was rung: "1:00" rung at 12:33 is 1pm.
- A ticket named **TEST** (or starting with it) is marked TEST and left out of the day's numbers.
- Amounts typed on the POS keypad show too, under the note typed with them (or "Custom amount"), in case a special or an off-menu plate gets rung up that way.

Header colors (amber and red mean time and nothing else on the board):

| Color | Counter order | Pickup or DoorDash order |
|---|---|---|
| Teal | under 8 min | — |
| Gray | — | due more than 10 min from now |
| Amber | 8–15 min | due within 10 min |
| Red | over 15 min | past due |

- **The timer:** a counter order counts up from when it was rung ("17:09 waiting"). A pickup or DoorDash order shows the time it's due, "Due 10:13", with "in 8 min" or "3 min late" under it, so the two never look alike.
- **The header names Online or DoorDash.** Counter, which is most tickets, isn't written. Every ticket says TO GO or FOR HERE.
- **Four tickets across** on the 1920-wide screen, kept large for the cooks who don't see well (client 2026-10-13), with a slim Done to fit more of each ticket. Five across fits nine tickets but smaller: `minmax(15rem, 1fr)` in `.board` in `board.html`.

### Square is told (online and DoorDash orders)

With `squareStatus` on (the default since 2026-10-12), nobody has to open these orders on the POS:

- **Done**, then **10 seconds without Undo** (`readyDelaySeconds`): the board marks the order **Ready** in Square. For a Square Online order that texts the customer; for DoorDash it tells DoorDash the food is waiting. **Undo within the 10 seconds and Square never hears of it.** Undo after that still brings the ticket back on the board, but Square stays Ready (the text has gone).
- **Handed off** on the front page (pressed by a person): 10 seconds later the board marks it **picked up** (Completed) in Square. Undo on the front page within those 10 seconds stops it. These orders never clear themselves off the front page, because clearing is what tells Square they were picked up.
- **Counter orders** are left alone: Square finishes them when they're paid.
- The program window logs each one ("order ...4F2A (Pat): ready in Square."). If Square refuses, it says why and tries again a minute later, five times at most; then do it on the POS. The tickets on both screens never wait for Square.
- **Still to see on a real order:** that the customer's text goes out when the board (not Order Manager) marks it ready. Watch the first online order after this update.

## Using it

Everything works from a number pad, with Num Lock on or off. The mouse is there for precision.

| Key | Does |
|---|---|
| **1–9** | Done on that ticket (the number in its corner). **A ticket keeps its number and its place until it's done:** when 2 is cleared, 1 and 3 don't move, and 2's spot stays empty (a faint dashed box). A new order takes the lowest free number and fills that spot, so the numbers on screen aren't always in order, but nothing moves under a cook. |
| **Backspace** or **0** | Undo: brings back the last ticket cleared. Press again to go further back. Still works after a restart. |
| **+** / **−** | Scroll down / up |
| **Enter** | Check Square right now instead of waiting for the next check |

- With more than nine tickets up, the extras have no number until one frees up, then the oldest of them takes that number and its spot. Use the mouse for those, or clear some first.
- **Undo with the mouse:** click Undo for a list of everything cleared today (name, first item, how long ago) and click the one to bring back. Backspace / 0 still steps back one at a time.
- **A new order** flashes mint around the edge of the whole screen, and the ticket keeps a mint outline and a mint **NEW** tag for a minute (mint, not amber, so new never looks like late). Without speakers, that's the only alert, so it lasts long enough to be noticed from the grill.
- **Allergy notes** (peanut, gluten, dairy and the like) show in red with a ⚠ sign, on the ticket or on the item.
- **More than one** of an item shows as a red **2×**.
- **The other meat** on a burger shows in a red block (**CHICKEN** not beef). The usual meat is the item's first variation in Square: Beef, except the Cordon Bleu Sandwich, which is Chicken first. Change the order of an item's variations in Square to change which is flagged.
- **The board checks Square every 5 seconds.** The refresh icon in the top right has a ring that empties as the next check approaches and refills when it runs. Tap it (or press **Enter**) to check right now. The ring turns light red when Square can't be reached.
- **The speaker icon** mutes and unmutes the chime and the alarm. Muted shows as a filled cream button with a cross, and that screen remembers the setting until someone taps it again.
- **A two-tone chime** means a new order. **A low falling tone** plus a red banner means the board lost Square or its own program. Tickets shown at that point might be out of date, and new ones might be missing, so go by the printer until it clears.
- **A cream "continues below" pointer** appears when a ticket runs off the bottom of the screen. Press **+** to see it.
- **The power button** in the top right opens the board menu. It works with the mouse only, so nothing on the number pad can open it or confirm anything in it.
  - **Settings & help:** the key guide, today's numbers (orders, breakfast / lunch, average time in the kitchen, most ordered), whether sound is on, and a link to the order check page. **Demo orders** adds practice tickets for training the staff (see below). **Reset for the day** clears the Undo list on both screens (so test or yesterday's tickets can't come back with a stray Backspace) and restarts today's stats from that moment. Tick **Also clear every order on the board** to empty both screens too: the morning after testing, before the doors open. The key guide also shows on the board when there are no orders.
  - **Check for updates:** looks for new board code. If there is any, it runs `start-kitchen.bat`, which installs it and restarts the board in about 10 seconds. If not, it says the board is up to date.
  - **Close the board:** closes the board window and the program window, back to Windows. Nothing reopens it until `start-kitchen.bat` is run (or the PC restarts). The front page is off too while it's closed.
  - **Restart the PC** and **Shut down the PC:** each asks first, then counts down from 5 with a big Cancel. Prefer Restart when working remotely: once the PC is off, someone has to press its power button.
  - In test mode (`KITCHEN_MOCK=1`) or on a development copy (`KITCHEN_DEV=1`) the power items only say what they would have done, so a laptop running the test board can't be shut down from it.
- **Sound needs speakers.** Make sure they're plugged in, set as the default output in Windows, and not muted.

## Setting up the mini PC (one time)

1. **Install Node.js** (the LTS version) from nodejs.org, and **Google Chrome** (Microsoft Edge also works). Use the default options.
2. **Copy this `kitchen` folder** onto the PC, for example `C:\KitchenBoard`. Nothing else from the repo is needed, and there's nothing to `npm install`.
3. **Get a Square access token.**
   1. Go to developer.squareup.com and sign in with the cafe's Square account.
   2. Create an application (call it "Kitchen Board") and open it.
   3. Switch to **Production**, open **Credentials**, and copy the **Production Access token**.

   Treat the token like a password. It never goes in git, an email, or a text message.
4. **Copy `config.example.json` to `config.json`** and paste in the token. `config.json` is gitignored, so updates never touch it. `skipItems` is only the starting skip list; once it's changed from the front page (Manage → Leave off kitchen tickets), that list is kept on the PC and `skipItems` no longer matters. Keep only those two settings: every other setting has a built-in default, and a line in `config.json` pins that setting so updates can't improve it. The board lists any such line when it starts and on `/check`.
5. **Double-click `start-kitchen.bat`.** It first pulls the latest board code with git (if the internet is down, it starts the version already on the PC). Then a minimized window runs the board program, and Chrome opens full-screen on the board. Press **Alt+F4** to leave full-screen. A desktop shortcut to it is fine. Running it again replaces the board program and the board window, never stacks a second one, and leaves everything else on the PC alone.
6. **Start it automatically.** Press Win+R and type `shell:startup`, then put a shortcut to `start-kitchen.bat` in that folder. Also set:
   - Settings → System → Power: **screen and sleep to Never**.
   - Windows to sign in automatically after a restart (run `netplwiz` and uncheck "Users must enter a user name and password"). Do this only if the kitchen PC is used for nothing else.
   - Windows Update **active hours** to cover service, so the PC doesn't restart mid-lunch.

## Updating the board

The kitchen PC runs the **`main`** branch, the same one that deploys the website. Work happens on **`dev`** and is merged into `main` to ship it (see "Branches" in the repo's CLAUDE.md). After a merge, restart the board on the kitchen PC: run `start-kitchen.bat`, restart the PC, or use **Check for updates**. Before starting, it fetches `main` and fast-forwards. The branch is set at the top of `start-kitchen.bat` (`BOARD_BRANCH`). If git isn't installed or the update fails, it says so on screen and starts the version already there. `config.json` and the `data\` folder (cleared tickets, the plan, the history, photos) are never changed by an update.

**It only updates a copy that is on `main`** (or on `kitchen-board`, the branch the PC ran before 2026-10-08, which it moves to `main` once). A copy on any other branch is someone's work in progress, so it starts it as it stands and leaves git alone.

### On a development computer: `start-dev.bat`

Run **`start-dev.bat`**, not `start-kitchen.bat`. It sets `KITCHEN_DEV=1`, which means:
- **No git:** your branch and uncommitted work are left as they are. Check for updates says so instead of updating.
- **An ordinary Chrome window** on its own profile, not locked full screen. Close it like any window.
- **Demo orders** (`KITCHEN_MOCK=1`) unless `KITCHEN_MOCK` is already set. To try it against the real account in `config.json`, run `set KITCHEN_MOCK=0` first. Remember that Specials **writes to Square**.
- **The power menu and the watchdog are off**, so the board can't shut your computer down or keep reopening a window.

To make every run on your computer a development run, set it once for good: `setx KITCHEN_DEV 1`. Never set it on the kitchen PC.

### Keeping the board on screen

- **Watchdog:** the board checks in with its program every second. If it stops for 30 seconds while the program is running, the program reopens the board full screen. This covers a keyboard's Home or Back key taking Chrome to another page, a closed tab, or a crashed tab. **Close the board** ends the program too, so there's no watchdog after it. It doesn't run in test mode or on a development copy either. It waits 2 minutes between tries. Each reopen is logged in the program's window.
- **Turn the internet keys off (optional, kitchen PC only):** double-click `keyboard-lock.reg`, accept, and restart the PC. It disables the Browser Home / Back / Forward / Refresh / Search / Mail and app keys that many keyboards have, so a stray press does nothing at all. `keyboard-unlock.reg` turns them back on. Not needed once the kitchen has only a number pad.

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
- **Add from the front:** a counter sale's skip-list items (drinks, chips) and any condiment packets: what the counter puts in the bag. A Square modifier with **"packet"** in its name ("Ketchup packet") is moved off the kitchen ticket and onto this list, totalled across the order. Online and DoorDash orders have no such list: the kitchen bags them whole. Tap a line to tick it off while bagging. Ticks are kept on that device only.
- **Online orders** say whether they've been marked ready in Square ("Marking it ready in Square…" for the few seconds after Done). With `squareStatus` on, **Handed off** is what marks them picked up in Square; an order stays on the front page until someone presses it.
- **An online or DoorDash order of only drinks or chips** goes on the kitchen board like any other order (those items on the ticket), and shows as Cooking here until the kitchen presses Done. A counter sale of only those doesn't show anywhere, because it's handed over as it's rung up.
- **Handed off** clears an order from the front page only; it never touches the kitchen board. **Undo** in the top bar lists today's hand-offs; click one to bring it back.
- **Ready orders clear themselves** after 10 minutes if nobody presses Handed off (`autoHandoffMinutes`; the Ready heading says so). They go on Undo, marked "cleared by itself", and one brought back stays until it's handed off by hand. Two kinds never clear themselves: a **not paid** order, and an **online or DoorDash order** (its Handed off tells Square it was picked up; with `squareStatus` off, only one not yet marked ready in Square).
- **Today**, under the orders: how many orders so far, breakfast vs lunch (before or after 11am, by when it was rung up or due), counter vs online, average and longest time in the kitchen (from when it went on the kitchen board to Done, so a pickup or phone order for later counts from 15 minutes before its time and a DoorDash order from when it stopped waiting for a Dasher; if a ticket is undone and Done again, the time it sat cleared doesn't count. Until 2026-10-21 counter orders only, from when they were rung), and the most ordered items. Canceled orders and unpaid open checks aren't counted. Sales and comparisons with other days are on the owner's phone page, `/today` (below).

Only the front page, its Handed off and Undo, the PIN-protected Manage actions and the owner's phone page (`/today`) answer other devices. The kitchen board, `/check`, Done, the power menu and updates answer the kitchen PC alone.

### On a phone, like an app

The front page works on a phone on the cafe wifi: the orders stack in one column, and Manage opens full screen.

- **Put it on the home screen.** iPhone: open the front page in Safari, tap Share, then **Add to Home Screen**. Android: open it in Chrome, tap ⋮, then **Add to Home screen**. The icon is a cream C on teal, named "Café Front". On an iPhone it opens full screen, with no address bar. Android may open it in an ordinary Chrome tab, because the kitchen PC isn't on https; it works the same.
- **If the phone can't find the PC by name** (`http://kitchen-pc:8090/front`), try the name with `.local` on the end (`http://kitchen-pc.local:8090/front`). Phones often don't know Windows names without it.
- **Remember on this device**, under the PIN, keeps the PIN on that phone, so Manage opens straight to its menu. Use it on your own phone only. **Forget the PIN here** at the foot of the Manage menu removes it, and a phone forgets it by itself if the PIN is changed in `config.json`.
- **Only on the cafe wifi**, unless the phone has Tailscale (see "Today, on the owner's phone"). The kitchen PC isn't open to the internet, on purpose, so without it the page doesn't open from home or on mobile data.

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
| `squareStatus` | `true` | The board marks online and DoorDash orders Ready in Square after Done, and picked up after Handed off (see "Square is told"). `false`: the board only reads from Square. |
| `readyDelaySeconds` | `10` | How long after Done (or Handed off) Square is told: the time to Undo. |
| `descriptions` | Lunch Special: `Served from 11am.`, Soup of the Day: `Starting at 11am.` | The words each daily item's description ends with (see "Descriptions in Square"). `{}` leaves the descriptions alone. |
| `dailyPhotos` | `true` | Each morning Lunch Special's and Soup of the Day's picture becomes a photo of the day's dish (see "Photos in Square"). `false` leaves the pictures alone. |
| `itemPhotos` | `true` | A photo saved by Photo post for any other item in Square becomes that item's picture, the newest one (see "Photos in Square"). `false` leaves them alone. |
| `photoPlaceholders` | `placeholders/lunch-special.png`, `placeholders/soup-of-the-day.png` | The picture for each daily item on a day its dish has no photo. Leave an item out to show nothing of ours on those days. |
| `specialsUrl` | `https://lvcafetogo.com/specials.json` | Where **Specials** reads the website's specials from. `""` turns that off. |
| `openDays` | `[1, 2, 3, 4, 5]` | The days Specials lists (0 is Sunday, 6 Saturday). |
| `updatePin` | none | Turns on **Manage** on the front page: enter the PIN once, then pick a job from the menu (Back returns to it; closing the panel forgets the PIN, unless **Remember on this device** was ticked). With this PIN it can set the **Specials** for today and the days ahead (see below), make a **Photo post** (see below), change the **Desserts** (see below), delete test shots or move the photos to GitHub in **Saved photos** (see Photo post), **Back up now** (the backup below, on demand; the board and orders carry on while it runs), change what to **Leave off kitchen tickets** (every Square category with its items; tick an item, or a whole category), **Check for updates** (the board's own update; it restarts in about 10 seconds if there's anything new) or **Reset for the day** (same as the board's, including the clear-the-board option), or see **Reports** (see below), or open **Today on the phone** (see "Today, on the owner's phone"). Five wrong PINs in 10 minutes locks it for 10 minutes. Without it, Manage says it isn't set up. Example: `"updatePin": "2468"`. |

## Today, on the owner's phone (`/today`)

How the day is going, for the owner's phone, at the shop or away from it: `http://<kitchen PC name>:8090/today`, or **Manage → Today on the phone** on the front page. Read-only: nothing on it presses Done or Handed off.

- **At the top, behind the PIN** (the Manage PIN; sales are the owner's business, not the counter's): sales so far with the order count and average ticket, and how that compares with **last week's same day by this time** ("▲ $45 (12%) ahead of last Mon by now"). Pickups already booked for later today are listed apart, so a morning is compared with a morning.
- **The day's split:** breakfast / lunch, counter / online, to go / for here, and time in the kitchen.
- **Compared with:** today, last week's same day and a usual one (the average of up to four of them) up to this time, then those days' whole-day totals, then this week so far against last week's to the same day and time. A day the board never ran is missing from the history, so it isn't compared; the first weeks after this update show less.
- **Busiest hours:** orders per hour today, last week's same day beside each.
- **Most ordered today** (top ten), then **on the board now**: every open order as the front page has it, with how long it's been cooking or when it's due. It checks every 5 seconds while the page is open, the numbers every 30, and nothing while the phone is locked.
- **The numbers are the board's own count**, the same as Reports: each order's total in Square, tax included, once it's paid (online orders when they're placed). Canceled, test and demo orders aren't in it. Square's Dashboard has the official sales, and it's the place to look when the kitchen PC is off.
- **The PIN** is asked once; **Remember on this phone** (ticked) keeps it, shared with the front page's Manage on the same phone. A changed PIN is forgotten by itself and asked again, never tried over and over (five wrong PINs would lock Manage for 10 minutes).
- **On the home screen** it's its own icon, "Café Today" (Share → Add to Home Screen, as for the front page).

### Away from the shop: Tailscale (one time)

The kitchen PC stays closed to the internet. **Tailscale** (free for personal use) joins the owner's phone and the kitchen PC in a private network of their own, so the phone reaches the PC as if it were on the cafe wifi, from anywhere, and nothing else can. No router settings, no port opened, no token or sales figures copied anywhere: the numbers never leave the PC except to the phone asking for them. It also brings the front page and Manage (Specials, Photo post, Reports) to the phone away from the shop.

1. **Make a Tailscale account** at tailscale.com (Personal, free). Sign in with the owner's own Google, Microsoft or Apple account.
2. **On the kitchen PC:** install Tailscale for Windows from tailscale.com/download, sign in with that account. In the Tailscale icon by the clock, turn on **Run unattended** (Preferences), so it connects after a restart without anyone at the PC.
3. **Stop its sign-in running out:** on login.tailscale.com, **Machines** → the kitchen PC → ⋯ → **Disable key expiry**. Otherwise it signs out after 180 days and someone has to sign it in again at the PC.
4. **Let the phone in through Windows Firewall.** In PowerShell **as administrator** (only Tailscale's own addresses, on any network profile):
   ```powershell
   New-NetFirewallRule -DisplayName "Kitchen board over Tailscale" -Direction Inbound -Program (Get-Command node).Source -Protocol TCP -LocalPort 8090 -RemoteAddress 100.64.0.0/10 -Action Allow
   ```
5. **On the phone:** install the Tailscale app, sign in with the same account, and switch it on. (iPhone: Settings in the app → **VPN On Demand**, so it connects by itself.)
6. **Open `http://<kitchen PC name>:8090/today`**, using the PC's name as the Tailscale app lists it under Machines (or its `100.x.x.x` address there), and add it to the home screen. With `frontKey` set, add `?key=<the key>`.

- **Only devices signed in to that Tailscale account** reach it. Never turn on **Funnel** or share the kitchen PC from the Tailscale admin page: either would open it to other people. A lost phone: remove it under Machines.
- **The kitchen PC must be on** and the board running. After closing (or if the page says it can't reach the kitchen PC), Square's own Dashboard app has the sales.

## When an order doesn't show up

Open **http://localhost:8090/check** in a normal Chrome window. Alt+Tab out of the board, or press Alt+F4 and reopen it with `start-kitchen.bat` afterwards. The page lists every order Square sent on its last check. For each one it says whether it's on the board, and if not, why: cleared with Done, every item on the skip list, pickup still more than an hour away, and so on. It also shows the current skip list and whether the Square catalog (needed to skip whole categories) could be read.

- **Raw** next to an order on `/check` shows it exactly as Square sent it: what to look at when the board reads something the POS recorded in a way it doesn't expect yet.
- **A ticket says TO GO when it should say FOR HERE, or the other way round:** the "Board type" column says which the board decided, and "From Square" shows what it was decided from. The POS records "To Go" as a PICKUP fulfillment; an order with no fulfillment, or any other kind, counts as for here.

- **If the order is missing from the list entirely**, Square didn't return it. Check the location shown at the top of the page, and check that the token belongs to the cafe's Square account.
- The minimized **"Kitchen board program"** window logs every new order it sees the same way, along with any errors from Square.

## Trying it without Square

From a command prompt in this folder:

```
set KITCHEN_MOCK=1
start-kitchen.bat
```

This shows fake orders under a purple TEST MODE banner (the demo's purple: practice, not a problem) and adds a new one every 45 seconds, so you can hear the chime. Test mode also makes up four weeks of history before today (in `stats-history-mock.json` only), so `/today` and Reports have something to compare with; they need `updatePin` in `config.json` (or a test config: `set KITCHEN_CONFIG=<a file with "updatePin">`). Bumps in test mode go to `state-mock.json` and never mix with real ones.

To test without sound (on another computer, say), also run `set KITCHEN_MUTE=1` before `start-kitchen.bat`, or just tap the speaker icon. A muted speaker shows as a filled cream button, so a silent board can't go unnoticed. To silence the kitchen PC for good, add `"sound": false` to `config.json`, but the chime is how a new order gets noticed, so leave it on there.

## Tests

`npm test` (or `node --test` in this folder) checks the rules that turn Square's orders into tickets: names, table numbers, to go and for here, the to-go split, packets and the skip list, online and DoorDash, which screen a ticket is on, and the specials' words in Square. No `npm install` needed. The tests run on demo orders, with `config.example.json`'s settings and a scratch folder for the board's own files, so they never touch Square, `config.json` or this PC's files. Add a test when an order surprises the board: copy its **raw** copy from `/check` into a test, minus names.

## Files

| File | What it is |
|---|---|
| `server.js` | Polls Square every 5 s and serves the board on `http://localhost:8090`. It only listens on the PC itself, not the network, and the power menu and update check only answer the board page itself. |
| `lib\` | The board program's parts, one file per job (config, Square, tickets, specials, stats, routes…); `server.js` lists them. Nothing to install. |
| `tests\` | The tests (see "Tests"). |
| `board.html` | The kitchen screen. |
| `front.html` | The front page for the counter (`/front`). |
| `today.html` | The owner's phone page (`/today`): the day's numbers, the reservations and the open orders. |
| `google-script\Code.gs` | The reservations' Google Apps Script, pasted into the cafe's Google Sheet (see "Reservations"). Not run on this PC. |
| `front\` | The front page's Manage jobs, one file each (Specials, Reservations, Photo post, Saved photos, Reports, Desserts, Leave off kitchen tickets), and the Manage panel's styles. |
| `kitchen.css` | The colours and base styles both screens share. |
| `config.json` | The token and settings. Only on the kitchen PC; gitignored. |
| `data\` | This PC's own files, made by the board; gitignored, never touched by an update (see "The data folder and backups"). |
| `wordmark.svg` | The Café wordmark drawn into Photo post's pictures. |
| `icon-*.png` | The front page's home-screen icon. |
| `start-kitchen.bat` | Pulls updates from `main`, starts the program (restarting it if it ever stops), and opens Chrome in kiosk mode. Replaces any copy already running. `start-kitchen.bat window` only reopens the board window (what the watchdog runs). |
| `start-dev.bat` | `start-kitchen.bat` for a development computer: no git, a normal window, demo orders. See "Updating the board". |
| `keyboard-lock.reg`, `keyboard-unlock.reg` | Turn the keyboard's internet and app keys off / back on. Kitchen PC only, then restart. |
| `focus-board.ps1` | Run by `start-kitchen.bat` after Chrome opens: brings the board window to the front so the number pad types into it, not into a console window. Tries for 20 seconds; if it can't, click the board once. |

### The data folder and backups

Everything the board makes on this PC is in `data\`. Before 2026-10-13 these sat loose in the kitchen folder; the first start on the new code moved them in by itself.

| File | What it is |
|---|---|
| `state.json` | Which orders have been cleared, and the skip list. |
| `specials-plan.json` | Specials: the days ahead, the words for each day's photo, and which days are in Square already. |
| `stats-history.json` | Every day's orders and numbers, for Reports. Never deleted, and **the only copy of the kitchen times**. |
| `reservations.json` | Reservations: every table booked or asked for, with names and phone numbers. |
| `photos\` | Photo post: the photos and finished posts kept for the website, with `photos.json`. |
| `backups\` | The daily copies, below. |
| `offsite\`, `backup-key` | Backup to GitHub, below: the repo's clone and this PC's key for it. |

**Backups.** When the board starts, again at 2pm (closing) if it's still on, and whenever **Manage → Back up now** is pressed, it copies `stats-history.json`, `specials-plan.json`, `state.json` and `reservations.json` into `data\backups\<date>\`, keeping the last 30 days. That covers a bad write or a deleted file, not a dead PC. For that, set **`backupDir`** in `config.json` to a folder off this PC's drive: a USB stick left plugged in (`"backupDir": "E:\\Kitchen backup"`, with two backslashes), a OneDrive folder on the Kitchen account, or a share on another PC. The same dated copies go there, plus every Photo post photo (`photos\`). If it can't be reached (the stick is out), the program window says so and the board carries on. `/check` shows when each place was last written.

**Backup to GitHub (the copy off this PC).** Set **`backupRepo`** in `config.json` to a private GitHub repo and the same backup is pushed there each time: one file per day of history (`history\<date>.json`), the plan, `state.json` and the Photo post photos, with every earlier version kept by git. It can be read from any computer, and Claude can read it for reports. The PC never signs in to GitHub; it makes its own key, which can write to that one repo only:

1. On GitHub, make a **private** repo with nothing in it (no README needed), e.g. `CafeKitchenData`.
2. On the kitchen PC, add `"backupRepo": "git@github.com:<you>/CafeKitchenData.git"` to `config.json` (the repo's web address works too) and restart the board.
3. Open `localhost:8090/check`. The **Backup** line shows *This PC's backup key* (`ssh-ed25519 …`). Copy all of it.
4. On GitHub: the repo's **Settings → Deploy keys → Add deploy key**, paste it, tick **Allow write access**, Add key.
5. Within 10 minutes the board tries again and `/check` says when it pushed; the repo fills in.

The key is `data\backup-key` (and `.pub`); the clone it pushes from is `data\offsite\`. If the PC is ever replaced, delete the old key from Deploy keys and add the new PC's.

To put a file back: close the board, copy it from a dated folder into `data\`, start the board. For the history from GitHub, the day files are joined back into `stats-history.json` (ask Claude).

## Specials (Manage on the front page)

Today's specials and the days ahead on one screen (until 2026-10-09 they were two: Today's specials and Plan the week). **Each morning the board puts that day's specials into Square by itself**, as soon as it starts (or, if it was left on overnight, within a minute of midnight). Nothing has to be opened on the day. The items are the ones named in `dailyItems` in `config.json` (default: Lunch Special and Soup of the Day; names exactly as in Square. Salad of the Day was dropped 2026-10-09: when a special comes with a salad, the special says so).

- **One row per day the cafe is open**, today first and open. Tap a day to open it:
  - **The special and the soup**, by name. (An item added to `dailyItems` with "Salad" in its name shows on today only, as it is decided on the day.)
  - **Comes with**, under the special: **Choice of side**, or **These sides** with commas between ("Mashed potatoes & gravy, green beans"). Two sides with **"or"** between ("Tossed salad or cooked broccoli") are one side the customer picks. Days from the website bring this with them. **It sets the side lists on Lunch Special in Square each morning** (below, "Sides in Square").
  - **Words under the photo, for Photo post**: what Photo post writes under the picture of that day's special. Left empty, Photo post words it from Comes with ("Served with mashed potatoes & gravy and green beans", or "With choice of side"). These words are kept apart from the day, so writing them doesn't stop the website updating it, and they never go to Square or the website.
  - **Prices**, folded away: a box per size. **A blank price keeps whatever Square has** (shown faintly, or "at the till" when the till asks for one). Type a price only when it changes that day. To make an item ask for its price at the till, change it in the Square Dashboard.
- **What it is today goes into Square** as part of the item's size names, so it prints on the kitchen ticket and the receipt after the item name: Lunch Special's one size becomes "BBQ Ribs", and the soup's sizes become "Cup · Chicken Dumpling" and "Bowl · Chicken Dumpling". The item's own name never changes.
- **Today** shows the names Square has right now, so a change made in the Dashboard isn't saved over, and whether today's specials are in Square yet. Saving today puts them in straight away. If Square refuses (no internet, say), it says so and the board tries again every 5 minutes.
- **Days come in from the website by themselves.** Every half hour the board reads the specials the website publishes (`specialsUrl`, built from the site's `src/_data/specials.json`, the same days as the /menu box and the Facebook post). The plate goes into Lunch Special and the soup into Soup of the Day. They're tagged **From the website**.
- **The website never overwrites:**
  - **today**, once it's in Square (and no earlier day). **Its sides are the exception:** fix them on the website and they reach Square's side lists within half an hour, or at **Check for updates** (client 2026-10-19). The plate's and the soup's names stay as they went in;
  - **a day changed here**, tagged **Set here**. From then on the website's copy of that day is ignored.

  So putting next week on the website mid-week changes nothing for this week. A day the website still lists can't be blanked here (clearing it lets the website's copy back in on the next read); change it on the website instead, or type something else here.
- **A day with nothing planned** puts the plain names back ("Regular", "Cup", "Bowl") that morning, so yesterday's plate never prints on today's tickets. Prices are left alone. A board that has never had a plan leaves Square alone.
- **What it writes to Square** is narrow: nothing but those items' prices and size names, and the side lists below. It reads each item fresh before saving, and if someone changed the item in the Dashboard a moment before, Square refuses the save and the front is asked to open it again, so nothing is overwritten. A mistyped price saves nothing at all.
- The plan is kept in `data\specials-plan.json` on the kitchen PC (gitignored). The program window logs every day it reads from the website and every write to Square.

### Sides in Square

Each side the special comes with is its own modifier list on **Lunch Special** (`sideItem`): **Side 1**, **Side 2**, **Side 3** (`sideLists`). Every morning, with the special and the soup, the board rewrites them from that day's **Comes with**, so the counter, Square Online and DoorDash all offer the same thing (client 2026-10-11):

| Comes with | On Lunch Special |
|---|---|
| Set sides: "Mashed potatoes & white gravy, corn" | Side 1 = **Mashed Potatoes & White Gravy** (picked already), Side 2 = **Corn** (picked already), each then lists the deli salads |
| A side with "or": "Tossed salad or cooked broccoli" | Side 1 = **Chef's Choice** (picked already), Tossed Salad, Cooked Broccoli, then the deli salads |
| Choice of side | Side 1 = **Chef's Choice** (picked already), then the deli salads |
| Nothing | the side lists switched off |

- **Nobody has to tap anything.** Each list is pick one, with the day's side picked already (marked on the option itself and on Lunch Special; the catalog calls use Square API 2025-05-21, as older versions got the pick wrong and Side 1 came up empty, 2026-10-19), so a plain Lunch Special comes as planned, and its sides print on the ticket. Tap a deli salad in Side 1 or Side 2 to swap that one side. Chef's Choice means the kitchen picks.
- **The deli salads** are the website's `swapSides` in `/specials.json`, which is menu.json's Deli Salads row. Change them there; the board reads them with the specials.
- **The side lists come first** on Lunch Special, Side 1 to Side 3, and its other lists (Dressing) after them, so the dressing is asked after the sides (client 2026-10-13). The board puts them in that order whenever it writes the sides.
- **A cup of the day's soup** comes last in every list, as **Soup of the Day** (the kitchen knows which), when the website's `soupSide` is on (client 2026-10-13). A day with no soup planned has none.
- **A day's extra sides** (`extraSides` on that day in the website's `specials.json`, "just for today") come first, before the deli salads, that day only. They're the one part of a day the website can still change once today is in Square: they reach Square within half an hour, or at Check for updates. They don't show on the front page.
- Every option is $0 (the price covers the sides). A list the day doesn't need is switched off on the item, not deleted, and a list is made the first time a day needs it. A day with more sides than lists logs which one can't be swapped.
- The deli salads sold on their own are separate items in Square (Sides), one button each; these lists are only the swap on the special.
- **Leave Off** (`leaveOffList`): a day's `leaveOff` in the website's `specials.json` (`["Bacon"]` on a Chicken Bacon Avocado Wrap day) becomes a list on Lunch Special that day, **No Bacon**, pick any, $0, after the side lists and the dressing, so the ticket says "No Bacon" (client 2026-10-18). Off on a day without one. Read like extra sides: even for today once it's in Square, within half an hour or at Check for updates. It doesn't show on the front page.
- **The Special Side** (`specialSideItem`, the $2 side sold on its own) gets the same morning write: one list, **Today's Side** (`specialSideList`), with the sides the plate comes with ("Tossed salad or cooked broccoli" as both), so the ticket says which side (client 2026-10-15). One side is picked already, so it's one tap; with more, it asks which. Off on a choice-of-side day or a day without sides. No deli salads or soup on it: those are sold as their own items.

### Descriptions in Square

Online ordering and DoorDash show an item's description under its name, and the variation name (what the ticket prints) is easy to miss there. So every morning, with the names and sides, the board writes the day into **Lunch Special**'s and **Soup of the Day**'s descriptions (client 2026-10-12):

- Lunch Special: "Lasagna with Tossed Salad or Cooked Broccoli and Breadstick. Includes a fountain drink or iced tea. Swap a side below if you like. Served from 11am." The sides are worded by the website's `specialSides` (`src/_lib/specials-caption.js`), so they read as on /menu; the drink line follows `includesDrink` in `/specials.json`; "Pick your side below." on a choice-of-side day.
- Soup of the Day: "Chicken Pot Pie. Starting at 11am."
- A day with nothing planned puts back the `descriptions` words alone. A day changed on the front page is rewritten straight away, like the names.

### Photos in Square

Each morning the board also puts a photo of the day's dish on **Lunch Special** (and **Soup of the Day**, once a soup is photographed), for online ordering and DoorDash (client 2026-10-12):

- **Found by name:** a photo whose title is the day's special ("BBQ Ribs"), ignoring case and punctuation. The photos are the website's Daily specials (`src/_data/photos.json`, `special: true`) and the ones Photo post saved on this PC that haven't moved to the website yet (`photos/photos.json`). Always the plain photo, never the finished post with words on it.
- **Rotates:** a dish photographed more than once shows the next photo each day it's served.
- **No photo yet** (or nothing planned): the item's placeholder, "Today's Lunch Special" over a covered plate, or "Soup of the Day" over a bowl (`photoPlaceholders`, files in `placeholders/`). They're the studio's `square-placeholder-special` and `-soup` pieces: change one there, export it, and copy the PNG over this one. A picture put on the item by hand in the Dashboard is never removed; it sits behind ours.
- Each picture is uploaded to Square once, by its contents; the board remembers its image (`squareImages` in `specials-plan.json`), so a changed placeholder goes up again by itself.
- **A new dish:** take it with Photo post and tick it as a special, with its title spelled as on the specials; the next time that dish is on, it shows.
- **Moved to GitHub:** a photo taken off this PC with **Saved photos → Move all to GitHub** is still found, in the backup's copy (`data\offsite\photos\`).

**The rest of the menu fills up the same way** (`itemPhotos`, client 2026-10-16). A Photo post made for any item in Square (step 2, "any item in Square") becomes that item's picture for online ordering and DoorDash within a minute of saving it, and so does a website photo with an `item` (`src/_data/photos.json`). With several photos of one item, the newest is used. Each photo goes up once: a picture changed afterwards in the Dashboard or in **Desserts** stays until the next Photo post of that item. Pictures already on the item stay behind it. An item name Square doesn't have (renamed since) is logged in the program window and skipped.

### The price

`/specials.json` carries the usual price of a special (`price`, $10) and a day's own when it differs; the board puts it into Square with the day's plate, like the name (client 2026-10-12). A price set on the front page for a day wins, as always.

## Reservations (Manage on the front page)

Tables booked ahead, for any number of people (client 2026-10-19). The paper book can stay; this is so the board and the counter see what's coming. Everyone still orders and pays at the counter, so a big table's checks are as separate as anyone's.

**Where they show**
- **The kitchen board and the top of the front page:** a table booked for today shows from 90 minutes before its time (`reservationAheadMinutes`): "Table for 12 · Johnson · 11:30am · in 40 min". It turns amber 15 minutes before and stays until the hold runs out (20 minutes after its time, `holdMinutes` in the website's `site.json`), or until the front presses **Seated** (no PIN, like Handed off). The rest of today's tables are one line under it.
- **The front page** also shows a red button when the website has sent requests nobody has answered yet; it opens Reservations.
- **`/today`** on the owner's phone lists today's tables and the next two weeks'.
- **Email, from Google** (once it's set up, below): the cafe's inbox gets every website request as it comes in, and a list of the day's tables at 5am on any day that has some. Customers with an email address get the confirmation, any change, and a reminder at 3pm the day before.

**Manage → Reservations**
- **To answer:** the website's requests. **Accept** books it and, with *Email them the answer* ticked, emails the confirmation. **Decline** emails that you can't (call them to find another time). **Edit** fixes a request before answering it.
- **Coming up:** every table by day, with the phone number. **Seated** (today), **Edit**, **Cancel** (asks first, and can email them). A canceled or declined one can be **booked again**.
- **+ New reservation:** a phone call or a booking at the counter. It's booked straight away; with an email address it's confirmed by email too. A day the cafe is closed asks once more before it's kept.
- **Texting them:** after Accept, Decline, Cancel or a new booking, the screen has **Call**, **Text them** (opens the phone's or iPad's messages with the words written) and **Copy the text** (for pasting into Google Voice). Nothing can text a customer by itself without a paid texting service; Google Voice is free but only sends what a person sends from its app, so the words are ready to paste.
- The list shows the last 7 days too. A change that couldn't reach Google is marked *Not sent yet*; the PC tries again at its next check.
- **How often the PC checks Google:** every 2 minutes from 5am to 3pm, every 15 minutes the rest of the time, and straight away when Reservations is opened (it opens within 8 seconds even when Google is slow; a request still on its way turns up by itself). That's a few hundred short checks a day, far under the free account's limit of about 90 minutes of script time a day.

**The website's form** is `/reserve` (`src/reserve.njk`), in the menu as Reserve. Until the script's address is in `site.json` it shows the phone number instead of the form. The form checks the same things as the script: today up to 90 days ahead, Monday to Friday, 6am to 1:30pm, 1 to 80 people. It says the table is held for 20 minutes and to check in at the counter. Change those in both `site.json` (`reservations`) and the top of `google-script/Code.gs`.

### Setting up Google (one time)

All of it on the cafe's Google account (theabcafe@gmail.com), in a browser signed into **that account only** (a private window, or a Chrome profile of its own). Signed into several Google accounts, Apps Script opens as the first one and says "Sorry, unable to open the file at this time."

1. **Make the sheet:** in Google Sheets, a new blank spreadsheet named *Reservations*.
2. **Add the script:** in the sheet, **Extensions → Apps Script**. Delete what's in `Code.gs` there, paste in all of `kitchen/google-script/Code.gs` from this repo, and press Save. (A script made on its own at script.google.com works too: its first setup makes the *Reservations* sheet in Drive and logs where it is.)
3. **Run setup once:** pick **setup** in the function list at the top and press **Run**. Google asks for access (the sheet, sending email, running at set times): pick the cafe's account; on "Google hasn't verified this app", **Advanced → Go to … (unsafe)**. That warning is normal for a script you wrote yourself. When it finishes, the log at the bottom shows a long **key**. Copy it.
4. **Deploy it:** **Deploy → New deployment**, type **Web app**, *Execute as:* **Me**, *Who has access:* **Anyone**. Deploy, and copy the **Web app URL** (it ends in `/exec`).
5. **The website:** put that URL in `src/_data/site.json` as `reservations.formUrl`, build and upload (or tell Claude). The form appears on `/reserve`.
6. **The kitchen PC:** add `"reservationsKey": "<the key>"` to `config.json` and restart the board. `/check` shows *Reservations: Google: last checked …* once it's talking to the script. The PC reads the script's address from the website's `site.json`, which it already has.
7. **Try it:** send a request from `/reserve` with your own email. The cafe's inbox gets it, and within 2 minutes the front page shows the red request button. Accept it and the confirmation arrives.
8. **Google Business Profile:** in the profile's edit screen, add `https://lvcafetogo.com/reserve` as the **reservations** link, so Google Search and Maps show a Reserve button.

**After a change to `Code.gs`:** paste it into the script again, Save, then **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy**. The address stays the same. Without a new version the website keeps using the old script.

The key is a password for the reservations: it stays in `config.json` and the script's own settings, never in this repo, an email or a text. To change it, delete `KEY` under the script's **Project Settings → Script Properties**, run **setup** again, and put the new key in `config.json`.

The sheet is a copy of the book that the PC keeps up to date. Change reservations on the front page, not in the sheet: the PC never reads the sheet's edits back.

## Photo post (Manage on the front page)

Makes the Facebook dish post (a 1080 × 1250 picture) on the phone, from a photo taken there and then. It's the only way dish posts are made: the website's `/studio/` dish posts were archived on 2026-10-09. Nothing is generated anywhere else and nothing costs anything: the phone draws it.

1. **Take or choose a photo.** The phone's camera or photo library.
2. **What's in the photo:** today's special or soup (from Specials, with the words written there or its sides), "A special" to type one in, or any item in Square (its category, name and description come from Square).
3. **Change any of the words:** the name, the line above it, the words under the photo, and **Drink included** for a special. The picture redraws as you type.
4. **Frame it:** drag the picture to move it, and zoom with the slider. The post shows a square of it.
5. **Make the picture.** Press and hold it to save it to the phone's photos (or Download), and **Copy caption**: with the order link, hours and menu link.

**Keep the photo on the kitchen PC for the website** (ticked by default) saves the photo (2000px, re-drawn on the phone so its GPS location is gone) and the finished post in `data\photos\` on the kitchen PC, listed in `data\photos\photos.json` in the same shape as the website's `src/_data/photos.json`. To put one on the website's `/gallery`, copy the photo into `src/assets/photos/`, move its entry over (a dish on the menu takes its menu name as `item`, not `special`), write its `alt` text, and run `npm run thumbs` (or ask Claude to).

**Manage → Saved photos** shows every photo kept this way, newest first (the finished post, so a test is easy to spot). Tick the test shots and retakes, **Delete ticked**, confirm: the photo, its post and its `photos.json` entry go from the kitchen PC, and from the GitHub backup's current files at its next push (git's history still has them). A photo already copied to the website isn't touched.

**Move all to GitHub** (there when `backupRepo` is set) clears the kitchen PC of photos without losing them: it backs up first, then takes every photo the backup reached off the PC. They stay in the GitHub backup's `photos\` folder and its `photos.json`, ready for the website; `data\photos\photos.json` lists them under `cleared` so later backups leave them there. If the backup doesn't reach GitHub, nothing is moved. Delete test shots first, or they go to GitHub too.

- The post's fonts load from Google Fonts on the phone, like the website's. Without internet the picture uses plain fonts and the screen says so.
- The phone number, web address, hours, menu and order links in the picture and caption are the website's own: `src/_data/site.json` (`phone`, `social.website`, the `opening` hours), read each time the screen opens. Change them there and Photo post follows after the next update.

## Reports and the daily history (Manage on the front page)

**Every day's numbers are kept for good** in `data\stats-history.json` on the kitchen PC, one entry per day, saved as the day goes (every 30 seconds while orders come in), so nothing depends on the board being closed properly at night. Each day keeps every order that counted: when, breakfast or lunch, counter or online, to go or for here, paid, its total in Square, the items (with the size or "what it is today", so a report can tell which specials sold), and its time in the kitchen. No customer names. Test, demo and canceled orders never get in, and a **Reset for the day** restarts that day's history the same as Today's numbers.

**Manage → Reports** shows any range of days: This week, Last week, This month, Last month, Last 30 days, or any two dates. For the range: orders (and a day's average), sales, breakfast / lunch, counter / online, to go / for here, average and longest time in the kitchen, a line per day, and every item ordered. Two downloads for a report made elsewhere (a spreadsheet opens them):

- **Days (CSV):** one row per day.
- **Every order (CSV):** one row per order, with its items.

A day the board never ran is missing; Square's own reports still have its sales. Sales are each order's total in Square, tax included. It's the only place the kitchen times exist, so it's copied every day; set `backupDir` to keep a copy off the PC (see "The data folder and backups").

## Desserts (Manage on the front page)

For the items in `dessertItems` in `config.json` (default: Cheesecake, Dessert Bar; names exactly as in Square) and every other item in the Square category `dessertCategory` (default: Desserts): the item's photo, its **kinds** and how many of each are left, and the options in its modifier lists, such as the cheesecake's sauce. Works on a phone on the cafe wifi.

Each kind is a **variation** of the item in Square (since 2026-10-21): Cheesecake is Plain and Pumpkin, Dessert Bar is Magic Bar and M&M Chocolate Rice Crispy Treat. The iPad asks which when the item is rung up, the ticket says it, and Square's reports count each kind. The Caramel or Chocolate sauce for a plain cheesecake is its own list, Cheesecake Sauce (pick one or none, no charge); Square can't show a list for one variation only, so it is on the item.

- **Left** is how many are in the case. Saving it turns on Square's stock count for that kind: Square counts it down as they sell, at the till and online, and online ordering shows it sold out at 0. Leave it **blank** to stop counting a kind (always available). Only a number you changed is sent, so a sale made while the screen was open isn't counted back in. Square won't let the board switch counting on or off for a kind that already has its own setting for the cafe (Cheesecake's Plain and Pumpkin, seen 2026-10-21): the count is still saved, and the board says to turn **Track stock** on (or off) for it once in Square. Kinds the board made itself it can switch.
- **Remove** takes a kind off for good once it's gone (it is deleted in Square; past sales keep its name). An item keeps at least one kind. **Add** puts in a new kind at the item's price, with how many there are.
- **New dessert** (at the bottom) makes a dessert at its own price: its own item in Square, in the Desserts category, with how many there are (or blank). It is set up like the dessert already there that's on the most sales channels (same iPad screens, tax and online ordering), and goes in straight away. It has one kind, which the screen shows under the dessert's own name.
- **Untick an option** to hide it from online ordering (Square's "hidden online"). It stays in Square, and ticking it again brings it back. **Add** under a list puts a new option on it, at no extra charge.
- **Change photo** opens the phone's camera or photo library. The phone shrinks the picture and re-draws it before uploading, which also strips the GPS location phones save in photos. It becomes the item's main picture in Square, the one online ordering shows.

Like Specials, every save reads fresh from Square first, so a change made in the Dashboard meanwhile is never overwritten.
