/* ============================================================
   The Cafe — Shared Inner-Page JS
   Handles: mobile nav toggle, active nav link, footer year,
            footer slide-in, scroll-fade sections
   ============================================================ */

(function () {
    'use strict';

    /* ── Mobile nav toggle ──────────────────────────────────── */

    var toggle = document.querySelector('.nav__toggle');
    var links  = document.querySelector('.nav__links');

    if (toggle && links) {
        toggle.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open);
        });

        links.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') {
                links.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* ── Active nav link ────────────────────────────────────── */

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__links a').forEach(function (a) {
        if (a.getAttribute('href') === currentPage) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
        }
    });

    /* ── Footer year ────────────────────────────────────────── */

    document.querySelectorAll('.footer-year').forEach(function (el) {
        el.textContent = new Date().getFullYear();
    });

    /* ── Footer slide-in ────────────────────────────────────── */

    var footer = document.querySelector('.footer');
    if (footer && window.IntersectionObserver) {
        var footerObs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    footer.getBoundingClientRect();
                    footer.classList.add('is-visible');
                    footerObs.unobserve(footer);
                }
            });
        }, { threshold: 0.1 });
        footerObs.observe(footer);
    } else if (footer) {
        footer.classList.add('is-visible');
    }

    /* ── Scroll-fade sections ───────────────────────────────── */

    if (window.IntersectionObserver) {
        var fadeEls = document.querySelectorAll('[data-fade]');
        if (fadeEls.length) {
            var fadeObs = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        fadeObs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15 });

            fadeEls.forEach(function (el) {
                el.classList.add('fade-ready');
                fadeObs.observe(el);
            });
        }
    }

}());
