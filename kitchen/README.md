# Kitchen order board

A full-screen order display for the kitchen mini PC. It reads orders from Square and shows them as big tickets the cooks can see at a glance. The kitchen printer keeps printing as before; this is the big-screen view alongside it.

Not part of the website. Nothing in this folder is built or uploaded.

## What shows up

- **Counter orders** rung up on Square POS today. Square marks these finished as soon as they're paid, so they stay on the board until a cook presses **Done**.
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

- **Tap Done** on a ticket (touchscreen or mouse), or press its **number key 1–9** (a cheap USB number pad works well as a bump bar).
- **Undo** (top bar), **0**, or **Backspace** brings back the last ticket you cleared.
- A two-tone chime plays when a new order arrives.
- An amber banner across the top means Square can't be reached; the tickets shown might be out of date. Check the internet connection.

## Setting up the mini PC (one time)

1. **Install Node.js** (the LTS version) from nodejs.org, and **Google Chrome** (Microsoft Edge also works). Use the default options.
2. **Copy this `kitchen` folder** onto the PC, for example `C:\KitchenBoard`. Nothing else from the repo is needed, and there's nothing to `npm install`.
3. **Get a Square access token.**
   1. Go to developer.squareup.com and sign in with the cafe's Square account.
   2. Create an application (call it "Kitchen Board") and open it.
   3. Switch to **Production**, open **Credentials**, and copy the **Production Access token**.

   Treat the token like a password. It never goes in git, an email, or a text message.
4. **Copy `config.example.json` to `config.json`** and paste in the token. `config.json` is gitignored. Adjust `skipItems` to match item names exactly as they appear in Square.
5. **Double-click `start-kitchen.bat`.** A minimized window runs the board program, and Chrome opens full-screen on the board. Press **Alt+F4** to leave full-screen.
6. **Start it automatically.** Press Win+R and type `shell:startup`, then put a shortcut to `start-kitchen.bat` in that folder. Also set:
   - Settings → System → Power: **screen and sleep to Never**.
   - Windows to sign in automatically after a restart (run `netplwiz` and uncheck "Users must enter a user name and password"). Do this only if the kitchen PC is used for nothing else.
   - Windows Update **active hours** to cover service, so the PC doesn't restart mid-lunch.

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

## Files

| File | What it is |
|---|---|
| `server.js` | Polls Square every 10 s and serves the board on `http://localhost:8090`. It only listens on the PC itself, not the network. |
| `board.html` | The screen. |
| `config.json` | The token and settings. Only on the kitchen PC; gitignored. |
| `state.json` | Which orders have been cleared. Created automatically; gitignored. |
| `start-kitchen.bat` | Starts the program (restarting it if it ever stops) and opens Chrome in kiosk mode. |
