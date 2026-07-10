# TheCafeSite — Claude instructions

Static HTML/CSS/JS site for The Cafe (catering & meal prep, Leavenworth KS). **No build tools, no npm, no frameworks** — keep it that way.

## Planning & tasks
Project planning, decisions, and the task backlog live OUTSIDE this public repo at `C:\Users\Mitch\Desktop\CafeWork\` — read `PLAN.md` there first, take tasks from `TASKS.md`. Never commit business/planning details, pricing strategy, or outreach scripts to this repo.

## Conventions
- Everything deployed to the live site lives under `site/` — upload that folder only. `social/`, `FrontBanner/`, `archive/`, and the `.md` docs stay out of deployment.
- Palette & fonts: see `The Cafe Website.md` (cream `#FAF7F2`, firebrick `#B22222`, `--text-dark #2C1810`; Playfair Display headings, Lato body via Google Fonts).
- New pages: copy the structure of `site/about.html`. Nav and footer are inlined in each page (not fetched); `site/components/nav.html` and `site/components/footer.html` are the reference copies — keep them in sync when the nav/footer changes.
- `site/index.html` is a self-contained hero/gateway page (own inline CSS, no nav).
- Images lazy-loaded; respect `prefers-reduced-motion`; keep pages accessible (this audience skews older).
- Live site: `https://lvcafetogo.com` (canonical/og:url/sitemap use this host). Internal links are extensionless (`href="about"`, not `about.html`) — `site/.htaccess` rewrites them to the real files, so pages only render correctly through a server with those rules, not from `file://`. `404.html` uses root-absolute links since it renders at arbitrary paths.
- Social templates live in `social/` (fixed-size HTML → PNG screenshots); door signage precedent in `FrontBanner/`.

## Safety
Public repo: no secrets, no API keys, no customer data — ever. Formspree endpoints are OK (domain-restricted).
