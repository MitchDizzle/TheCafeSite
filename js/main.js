/* ============================================================
   The Cafe — Shared Inner-Page JS
   Handles: nav/footer fetch includes, mobile nav toggle,
            active nav link highlighting, scroll-fade sections
   ============================================================ */

(function () {
    'use strict';

    /* ── Component loader ───────────────────────────────────── */

    /**
     * Fetches an HTML fragment and injects it into the given mount element.
     * Falls back silently if the fetch fails (e.g. file:// protocol locally).
     */
    function loadComponent(mountId, url, callback) {
        const mount = document.getElementById(mountId);
        if (!mount) return;

        fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error('fetch failed: ' + r.status);
                return r.text();
            })
            .then(function (html) {
                mount.innerHTML = html;
                if (typeof callback === 'function') callback(mount);
            })
            .catch(function (err) {
                console.warn('Could not load component:', url, err);
            });
    }

    /* ── Nav helpers (run after nav fragment is injected) ───── */

    function initNav(navMount) {
        // Mobile toggle
        const toggle = navMount.querySelector('.nav__toggle');
        const links  = navMount.querySelector('.nav__links');

        if (toggle && links) {
            toggle.addEventListener('click', function () {
                const open = links.classList.toggle('open');
                toggle.setAttribute('aria-expanded', open);
            });

            // Close menu when a link is clicked
            links.addEventListener('click', function (e) {
                if (e.target.tagName === 'A') {
                    links.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Highlight active page link
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        navMount.querySelectorAll('.nav__links a').forEach(function (a) {
            const href = a.getAttribute('href');
            if (href && href === currentPath) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
            }
        });
    }

    /* ── Scroll-fade observer ───────────────────────────────── */

    function initScrollFade() {
        if (!window.IntersectionObserver) return;

        const elements = document.querySelectorAll('[data-fade]');
        if (!elements.length) return;

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        elements.forEach(function (el) {
            el.classList.add('fade-ready');
            observer.observe(el);
        });
    }

    /* ── Base path (handles /thecafe/ subfolder staging) ────── */

    function getBasePath() {
        // Derive base from a known script tag, or fall back to /thecafe/
        const scripts = document.querySelectorAll('script[src*="main.js"]');
        if (scripts.length) {
            const src = scripts[scripts.length - 1].getAttribute('src');
            // src = "js/main.js" (relative) or "/thecafe/js/main.js" (absolute)
            return src.replace(/js\/main\.js$/, '');
        }
        return '/thecafe/';
    }

    /* ── Init ───────────────────────────────────────────────── */

    const base = getBasePath();

    function initFooter(footerMount) {
        const footer = footerMount.querySelector('.footer');
        if (!footer) return;

        if (!window.IntersectionObserver) {
            footer.classList.add('is-visible');
            return;
        }

        const obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    footer.classList.add('is-visible');
                    obs.unobserve(footer);
                }
            });
        }, { threshold: 0.1 });

        obs.observe(footer);
    }

    loadComponent('nav-mount',    base + 'components/nav.html',    initNav);
    loadComponent('footer-mount', base + 'components/footer.html', initFooter);

    document.addEventListener('DOMContentLoaded', function () {
        initScrollFade();
    });

}());
