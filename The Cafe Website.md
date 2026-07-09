# The Cafe — Website Project

## Overview
Static HTML/CSS/JS website for **The Cafe**, a catering-only and meals-on-wheels prep business (no sit-down dining). Live at **https://lvcafetogo.com** (previously staged at `mtch.tech/thecafe`).

---

## Tech Stack
- **Static HTML/CSS/JS** — no build tools, no npm, no framework
- **Shared components** (nav, footer) via JS `fetch()` includes — portable, no server config required
- **Contact form** via [Formspree](https://formspree.io) (free tier, domain-restricted, safe to expose endpoint in HTML)
- **Fonts** via Google Fonts CDN — Playfair Display (headings) + Lato (body)
- **Version control** — public GitHub repo (safe: no secrets, all content is intentionally public)
- **Hosting** — live at `lvcafetogo.com`; `mtch.tech/thecafe` subfolder available as staging

> **NFOServers note:** Uses custom control panel, not cPanel. SSI availability unknown — use JS fetch approach for shared components.

---

## Hosting & Cost
| Item | Cost |
|------|------|
| Staging on mtch.tech | $0 (already paying) |
| GitHub (public repo) | $0 |
| Production shared hosting | ~$3–5/mo |
| Domain `.net` or `.com` | ~$10–14/yr + ~$8–10/yr WHOIS protection |
| **Year 1 total (client)** | ~$50–60 |
| **Year 2+ total (client)** | ~$46–54/yr |

---

## Color Palette & Fonts

```css
:root {
    --cream:          #FAF7F2;
    --firebrick:      #B22222;
    --firebrick-dark: #8B1A1A;
    --text-dark:      #2C1810;
    --overlay:        rgba(18, 8, 4, 0.52);
}
```

- **Heading font:** `Playfair Display` (serif, elegant — used for "The Cafe" title)
- **Body font:** `Lato` (sans-serif, light weight for subtitle/buttons)

---

## File Structure

```
thecafe/
├── site/                   # ← everything deployed to lvcafetogo.com; upload this folder only
│   ├── index.html          # Hero/landing — gateway page
│   ├── about.html          # About + Services + What to Expect (scrollable)
│   ├── team.html           # Meet the Team cards
│   ├── gallery.html        # Photo grid (lazy loaded)
│   ├── catering.html       # Packages + booking form
│   ├── contact.html        # Contact info + newsletter + FAQ
│   ├── privacy.html        # Privacy policy
│   ├── favicon.svg / robots.txt / sitemap.xml
│   ├── css/
│   │   └── style.css       # Shared styles for inner pages
│   ├── js/
│   │   └── main.js         # Shared JS for inner pages (nav, scroll fx, Formspree)
│   ├── components/
│   │   ├── nav.html        # Reference nav fragment (pages inline their own copy)
│   │   └── footer.html     # Reference footer fragment
│   └── assets/
│       ├── slides/         # Hero slideshow (slide1.jpg – slide4.jpg)
│       └── gallery/        # Gallery photos
├── social/                 # Social media templates (not deployed)
├── FrontBanner/            # Door signage (not deployed)
└── archive/                # Old site snapshots (not deployed)
```

---

## Page Plan

| Page | Sections | Notes |
|------|----------|-------|
| `index.html` | Hero only — slideshow + title + 2 buttons | No nav bar. Gateway only. |
| `about.html` | Our Story → What We Offer → What to Expect | 3 scroll sections with chevron indicators |
| `team.html` | Staff cards (photo + name + role + bio) | Requires team interviews |
| `gallery.html` | Masonry/grid photo layout | All images lazy loaded |
| `catering.html` | Packages → Booking form | Full booking form, Formspree (`f/xzdlnpnw`) |
| `contact.html` | Catering pointer → Contact info → Newsletter → FAQ | Newsletter form, Formspree (`f/mdarqnql`) |

### Hero button mapping
- **"Book a Catering"** → `catering.html#inquiry`
- **"Learn More"** → `about.html`

---

## Content Checklist (gather from client)
- [ ] 4 slideshow photos (landscape, catering/food/kitchen)
- [ ] Gallery photos
- [ ] Official business tagline (placeholder: *"Catering & Meal Prep, Crafted with Care"*)
- [ ] Services list + descriptions
- [ ] Service area (city/region/radius)
- [ ] Team photos + bios (interview each person)
- [ ] Contact info (phone, email)
- [ ] Booking process (lead time, minimums, how quotes work)
- [ ] Dietary accommodations offered
- [ ] 2–3 client testimonials
- [ ] FAQ answers (cancellation policy, serving staff, how far in advance, etc.)
- [ ] Business hours / response time expectation
- [ ] Social media handles (Facebook, Instagram)

---

## Pages Missing From Initial Scope (add later)
- Service area map or written coverage zone
- Pricing guidance ("starting at $X/person" or "request a quote" flow)
- Testimonials section (on about or contact page)
- Google Business Profile listing (free, critical for local search)
- Basic SEO: title tags, meta descriptions, Open Graph tags
- Privacy policy (required when collecting form data)

---

## index.html — Complete Starter

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="The Cafe – Professional catering and meal prep services. Crafted with care for every occasion.">
    <title>The Cafe | Catering &amp; Meal Prep</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400&display=swap" rel="stylesheet">

    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --cream:          #FAF7F2;
            --firebrick:      #B22222;
            --firebrick-dark: #8B1A1A;
            --text-dark:      #2C1810;
            --overlay:        rgba(18, 8, 4, 0.52);
        }

        html, body { height: 100%; overflow: hidden; }

        /* Slideshow */
        .hero { position: relative; width: 100%; height: 100vh; overflow: hidden; }
        .slideshow { position: absolute; inset: 0; }

        .slide {
            position: absolute; inset: 0;
            opacity: 0;
            transition: opacity 1.2s ease-in-out;
        }
        .slide.active { opacity: 1; }

        .slide img {
            width: 100%; height: 100%;
            object-fit: cover; display: block;
        }

        /* Placeholder gradients — replace with real photos */
        .slide-placeholder { width: 100%; height: 100%; }
        .slide-1 .slide-placeholder { background: linear-gradient(135deg, #8B4513 0%, #A0522D 40%, #CD853F 100%); }
        .slide-2 .slide-placeholder { background: linear-gradient(135deg, #6B2020 0%, #B22222 50%, #8B3A3A 100%); }
        .slide-3 .slide-placeholder { background: linear-gradient(135deg, #4A3728 0%, #6B4C3B 50%, #8B6355 100%); }
        .slide-4 .slide-placeholder { background: linear-gradient(135deg, #3D2B1F 0%, #5C3D2E 40%, #8B5E45 100%); }

        /* Overlay */
        .overlay { position: absolute; inset: 0; background: var(--overlay); z-index: 1; }

        /* Hero content */
        .hero-content {
            position: absolute; inset: 0; z-index: 2;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            text-align: center; padding: 1.5rem; gap: 0.75rem;
        }

        .hero-eyebrow {
            font-family: 'Lato', sans-serif;
            font-weight: 300;
            font-size: clamp(0.7rem, 2vw, 0.95rem);
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: var(--cream);
            opacity: 0.75;
        }

        .hero-title {
            font-family: 'Playfair Display', serif;
            font-size: clamp(3.5rem, 12vw, 8rem);
            font-weight: 700;
            line-height: 1;
            color: var(--cream);
            text-shadow: 0 2px 28px rgba(0, 0, 0, 0.45);
            letter-spacing: 0.02em;
        }

        .hero-subtitle {
            font-family: 'Lato', sans-serif;
            font-weight: 300;
            font-size: clamp(0.85rem, 2.5vw, 1.1rem);
            color: var(--cream);
            opacity: 0.85;
            max-width: 40ch;
            line-height: 1.65;
            margin-top: 0.25rem;
        }

        /* Buttons */
        .hero-actions {
            display: flex; gap: 1rem;
            margin-top: 1.75rem;
            flex-wrap: wrap; justify-content: center;
        }

        .btn {
            font-family: 'Lato', sans-serif;
            font-weight: 400;
            font-size: clamp(0.8rem, 2vw, 0.9rem);
            letter-spacing: 0.12em;
            text-transform: uppercase;
            text-decoration: none;
            padding: 0.9rem 2.4rem;
            border-radius: 2px;
            border: 2px solid transparent;
            display: inline-block; cursor: pointer;
            transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.15s;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn:focus-visible { outline: 3px solid var(--cream); outline-offset: 3px; }

        .btn-primary {
            background: var(--firebrick);
            color: var(--cream);
            border-color: var(--firebrick);
        }
        .btn-primary:hover { background: var(--firebrick-dark); border-color: var(--firebrick-dark); }

        .btn-ghost {
            background: transparent;
            color: var(--cream);
            border-color: var(--cream);
        }
        .btn-ghost:hover { background: var(--cream); color: var(--text-dark); }

        /* Slide dots */
        .dots {
            position: absolute; bottom: 1.75rem; left: 50%;
            transform: translateX(-50%); z-index: 2;
            display: flex; gap: 0.55rem;
        }
        .dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: rgba(250, 247, 242, 0.35);
            border: none; cursor: pointer; padding: 0;
            transition: background 0.3s, transform 0.2s;
        }
        .dot.active { background: var(--cream); transform: scale(1.3); }
        .dot:focus-visible { outline: 2px solid var(--cream); outline-offset: 3px; }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce) {
            .slide { transition: opacity 0.01ms; }
            .btn, .dot { transition: none; }
        }

        /* Mobile */
        @media (max-width: 480px) {
            .hero-actions { flex-direction: column; width: 100%; max-width: 280px; }
            .btn { text-align: center; width: 100%; }
        }
    </style>
</head>
<body>

<main class="hero" role="main">

    <div class="slideshow" aria-hidden="true">
        <!-- Slide 1: eager — visible on first paint. Replace placeholder div with real img tag. -->
        <div class="slide slide-1 active">
            <!-- <img src="assets/slides/slide1.jpg" alt="" loading="eager" fetchpriority="high"> -->
            <div class="slide-placeholder"></div>
        </div>
        <!-- Slides 2–4: lazy — data-src swapped to real img when slide is about to show -->
        <div class="slide slide-2" data-src="assets/slides/slide2.jpg">
            <div class="slide-placeholder"></div>
        </div>
        <div class="slide slide-3" data-src="assets/slides/slide3.jpg">
            <div class="slide-placeholder"></div>
        </div>
        <div class="slide slide-4" data-src="assets/slides/slide4.jpg">
            <div class="slide-placeholder"></div>
        </div>
    </div>

    <div class="overlay" aria-hidden="true"></div>

    <div class="hero-content">
        <p class="hero-eyebrow">Catering &amp; Meal Prep Services</p>
        <h1 class="hero-title">The Cafe</h1>
        <p class="hero-subtitle">Catering &amp; Meal Prep, Crafted with Care</p>
        <nav class="hero-actions" aria-label="Main navigation">
            <a href="contact.html" class="btn btn-primary">Book a Catering</a>
            <a href="about.html"   class="btn btn-ghost">Learn More</a>
        </nav>
    </div>

    <div class="dots" role="tablist" aria-label="Slideshow navigation">
        <button class="dot active" role="tab" aria-label="Slide 1" aria-selected="true"  data-index="0"></button>
        <button class="dot"        role="tab" aria-label="Slide 2" aria-selected="false" data-index="1"></button>
        <button class="dot"        role="tab" aria-label="Slide 3" aria-selected="false" data-index="2"></button>
        <button class="dot"        role="tab" aria-label="Slide 4" aria-selected="false" data-index="3"></button>
    </div>

</main>

<script>
(function () {
    const slides  = document.querySelectorAll('.slide');
    const dots    = document.querySelectorAll('.dot');
    let current   = 0;
    let timer;

    function loadSlide(slide) {
        const src = slide.dataset.src;
        if (!src) return;
        const placeholder = slide.querySelector('.slide-placeholder');
        const img = new Image();
        img.alt = '';
        img.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.onload = () => { if (placeholder) placeholder.replaceWith(img); };
        delete slide.dataset.src;
    }

    function goTo(index) {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        dots[current].setAttribute('aria-selected', 'false');

        current = index;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
        dots[current].setAttribute('aria-selected', 'true');

        // Pre-load the next slide so it's ready
        const next = slides[(current + 1) % slides.length];
        if (next.dataset.src) loadSlide(next);
    }

    function advance() { goTo((current + 1) % slides.length); }

    function startTimer() { timer = setInterval(advance, 5000); }
    function resetTimer()  { clearInterval(timer); startTimer(); }

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            goTo(parseInt(dot.dataset.index, 10));
            resetTimer();
        });
    });

    // Pre-load slide 2 immediately so it's ready when the timer first fires
    loadSlide(slides[1]);

    // Pause autoplay when tab is not visible
    document.addEventListener('visibilitychange', () => {
        document.hidden ? clearInterval(timer) : startTimer();
    });

    startTimer();
}());
</script>

</body>
</html>
```

---

## JS Fetch Include Pattern (for inner pages)

Add this to `components/nav.html` and `components/footer.html` as plain HTML fragments, then load them in every inner page:

```html
<!-- In about.html, team.html, etc. -->
<div id="nav-mount"></div>
<script>
    fetch('/thecafe/components/nav.html')
        .then(r => r.text())
        .then(html => document.getElementById('nav-mount').innerHTML = html);
</script>
```

---

## GitHub Repo Setup (when ready)

```bash
git init thecafe
cd thecafe
# add all files
git add index.html css/ js/ components/ assets/
git commit -m "initial hero page"
git remote add origin https://github.com/YOUR_USERNAME/thecafe.git
git push -u origin main
```

**Safe to make public:** no secrets, no credentials, Formspree keys are domain-restricted by design.

---

## Next Steps
1. [ ] Create GitHub repo `thecafe`, clone locally
2. [ ] Copy `index.html` starter above into repo root
3. [ ] Open in browser — placeholder gradient slides confirm layout works
4. [ ] Swap placeholder `<div>`s for real `<img>` tags as photos become available
5. [ ] Build `about.html` next (3 scrollable sections with chevron indicators)
6. [ ] Set up Formspree account and wire `contact.html` form
