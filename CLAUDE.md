# TheCafeSite — Claude instructions

Static HTML/CSS/JS site for The Cafe (catering & meal prep, Leavenworth KS). **No build tools, no npm, no frameworks** — keep it that way.

## Planning & tasks
Project planning, decisions, and the task backlog live OUTSIDE this public repo at `C:\Users\Mitch\Desktop\CafeWork\` — read `PLAN.md` there first, take tasks from `TASKS.md`. Never commit business/planning details, pricing strategy, or outreach scripts to this repo.

## Conventions
- Palette & fonts: see `The Cafe Website.md` (cream `#FAF7F2`, firebrick `#B22222`, `--text-dark #2C1810`; Playfair Display headings, Lato body via Google Fonts).
- New pages: copy the structure of `about.html`; load shared `components/nav.html` and `components/footer.html` via the JS fetch pattern in `js/main.js`.
- `index.html` is a self-contained hero/gateway page (own inline CSS, no nav).
- Images lazy-loaded; respect `prefers-reduced-motion`; keep pages accessible (this audience skews older).
- Staging: `mtch.tech/thecafe` — component fetch paths assume that subfolder.
- Social templates live in `social/` (fixed-size HTML → PNG screenshots); door signage precedent in `FrontBanner/`.

## Safety
Public repo: no secrets, no API keys, no customer data — ever. Formspree endpoints are OK (domain-restricted).
