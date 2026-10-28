# Tom Don't Spend

A phone-first money planner. Plain HTML, CSS and JavaScript with no libraries and no build step.
Your numbers are saved on the device only (browser storage); use **More → Export backup** to keep a copy.

## What's in it

- **Home:** what's left this week, quick-add spends, payday-week warning, safety floor, payday
  checklist, countdowns, and total money (hidden until you tap).
- **Plan:** a slider for each pot and for the weekly spender, with live "left over" and warnings
  when the weekly money gets too low. Lock the month in; add unexpected costs and the plan updates.
- **Money:** accounts, monthly bills, debts (with a credit-use meter and upcoming payments).
- **Subs:** subscription list with keep / review / cancel, a finder that spots repeat payments
  in a bank CSV export (read on the device, never uploaded), and a "where they hide" checklist.
- **More:** pots (targets, goal dates), settings, backup.

## Files

| File | What it does |
|---|---|
| `logic.js` | All the money maths (pay cycles, plan totals, subscription finder, CSV reading) |
| `app.js` | The screens and buttons |
| `style.css` | Looks, light and dark mode |
| `tests.html` | Open it in a browser: runs the maths tests |
| `private/starter.json` | Your real starting numbers. Gitignored, never published |

## Run it on the Mac

```bash
python3 -m http.server 8777 --bind 127.0.0.1 --directory ~/budget-app
```

Then open http://127.0.0.1:8777 (the app) or http://127.0.0.1:8777/tests.html (the tests).

Not financial advice: it's a planner. MoneyHelper is free and impartial for bigger decisions.

## Put it on your iPhone

1. **Publish (one time):** install GitHub Desktop, sign in, then File → Add Local Repository →
   `~/budget-app` → **Publish repository**. Name it `tom-dont-spend` and untick "Keep this code
   private" (the code is public; your numbers are not in it).
2. **Turn on Pages:** on github.com open the repo → Settings → Pages → Branch: `main`, folder `/ (root)` → Save.
   After a minute it's live at `https://<your-github-name>.github.io/tom-dont-spend/`.
3. **Add to home screen:** open that link in **Safari** on the iPhone → Share → **Add to Home Screen**.
4. **Load your numbers:** AirDrop `private/starter.json` to the phone (save to Files), open the app
   from the home screen → **Import a backup** → pick the file.
5. **Updates:** after a change, press **Push origin** in GitHub Desktop. The app updates next time you open it.
