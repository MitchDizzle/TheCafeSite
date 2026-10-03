# Kitchen order board

A full-screen order display for the kitchen mini PC. It reads orders from Square and shows them as big tickets the cooks can see at a glance. The kitchen printer keeps printing as before; this is the big-screen view alongside it.

Not part of the website. Nothing in this folder is built or uploaded.

## What shows up

- **Counter orders** rung up on Square POS today. Square marks these finished as soon as they're paid; the Restaurants app also marks their pickup step complete. Because of that, the board ignores Square's "completed" on counter orders, and they stay up until a cook presses **Done**. They appear once paid: a check that was sent but not charged yet can't be seen by the board, only by the kitchen printer.
- **Online / pickup orders** due today, starting an hour before pickup time. They leave the board when a cook presses **Done** *or* when the front marks them ready or picked up in Square Order Manager.
- Items listed in `skipItems` (drinks, chips) are left off. An order made up only of those items doesn't show at all.
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
| **1–9** | Done on that ticket (the number in its corner) |
| **Backspace** or **0** | Undo: brings back the last ticket cleared. Press again to go further back. Still works after a restart. |
| **+** / **−** | Scroll down / up |
| **Enter** | Check Square right now instead of waiting for the next check |

- Tickets 10 and up have no number key. Clear the first nine, or use the mouse.
- **The board checks Square every 5 seconds.** The refresh icon in the top right has a ring that empties as the next check approaches and refills when it runs. Tap it (or press **Enter**) to check right now. The ring turns amber when Square can't be reached.
- **The speaker icon** mutes and unmutes the chime and the alarm. Muted shows amber with a cross, and that screen remembers the setting until someone taps it again.
- **A two-tone chime** means a new order. **A low falling tone** plus an amber banner means the board lost Square or its own program. Tickets shown at that point might be out of date, and new ones might be missing, so go by the printer until it clears.
- **An amber "continues below" pointer** appears when a ticket runs off the bottom of the screen. Press **+** to see it.
- **Sound needs speakers.** Make sure they're plugged in, set as the default output in Windows, and not muted.

## Setting up the mini PC (one time)

1. **Install Node.js** (the LTS version) from nodejs.org, and **Google Chrome** (Microsoft Edge also works). Use the default options.
2. **Copy this `kitchen` folder** onto the PC, for example `C:\KitchenBoard`. Nothing else from the repo is needed, and there's nothing to `npm install`.
3. **Get a Square access token.**
   1. Go to developer.squareup.com and sign in with the cafe's Square account.
   2. Create an application (call it "Kitchen Board") and open it.
   3. Switch to **Production**, open **Credentials**, and copy the **Production Access token**.

   Treat the token like a password. It never goes in git, an email, or a text message.
4. **Copy `config.example.json` to `config.json`** and paste in the token. `config.json` is gitignored, so updates never touch it. Adjust `skipItems` to match item names exactly as they appear in Square. Keep only those two settings: every other setting has a built-in default, and a line in `config.json` pins that setting so updates can't improve it. The board lists any such line when it starts and on `/check`.
5. **Double-click `start-kitchen.bat`.** It first pulls the latest board code with git (if the internet is down, it starts the version already on the PC). Then a minimized window runs the board program, and Chrome opens full-screen on the board. Press **Alt+F4** to leave full-screen. A desktop shortcut to it is fine. Running it again replaces the board program and the board window, never stacks a second one, and leaves everything else on the PC alone.
6. **Start it automatically.** Press Win+R and type `shell:startup`, then put a shortcut to `start-kitchen.bat` in that folder. Also set:
   - Settings → System → Power: **screen and sleep to Never**.
   - Windows to sign in automatically after a restart (run `netplwiz` and uncheck "Users must enter a user name and password"). Do this only if the kitchen PC is used for nothing else.
   - Windows Update **active hours** to cover service, so the PC doesn't restart mid-lunch.

## Updating the board

Push the change to the `kitchen-board` branch from any computer, then restart the board on the kitchen PC: run `start-kitchen.bat` or restart the PC. Before starting, it fetches that branch, switches to it (so a copy cloned on `main` still ends up on the board's code), and fast-forwards. The branch is set at the top of `start-kitchen.bat` (`BOARD_BRANCH`); change it to `main` once the board is merged. If git isn't installed or the update fails, it says so on screen and starts the version already there. `config.json` and `state.json` (cleared tickets) are never changed by an update.

## When an order doesn't show up

Open **http://localhost:8090/check** in a normal Chrome window. Alt+Tab out of the board, or press Alt+F4 and reopen it with `start-kitchen.bat` afterwards. The page lists every order Square sent on its last check. For each one it says whether it's on the board, and if not, why: cleared with Done, every item on the skip list, pickup still more than an hour away, and so on.

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
| `server.js` | Polls Square every 10 s and serves the board on `http://localhost:8090`. It only listens on the PC itself, not the network. |
| `board.html` | The screen. |
| `config.json` | The token and settings. Only on the kitchen PC; gitignored. |
| `state.json` | Which orders have been cleared. Created automatically; gitignored. |
| `start-kitchen.bat` | Pulls updates, starts the program (restarting it if it ever stops), and opens Chrome in kiosk mode. Replaces any copy already running. |
