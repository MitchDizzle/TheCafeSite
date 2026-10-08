/* ============================================================
   The Cafe — Shared Inner-Page JS
   Handles: mobile nav toggle, footer year, Formspree and Web3Forms forms
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

    /* ── Footer year ────────────────────────────────────────── */

    document.querySelectorAll('.footer-year').forEach(function (el) {
        el.textContent = new Date().getFullYear();
    });

    /* ── Catering: a subject and "When" line readable at a glance ─
       The request lands in Gmail, so the subject carries what decides
       whether it can be done, name first so a request is easy to spot: who, the day, how many, pickup or drop-off. It must keep starting "Catering request", which the Gmail filter matches (anywhere in the subject). "When" replaces the raw date and time fields in the email. */

    function cateringEmail(form) {
        var data = new FormData(form);
        var get = function (k) { return String(data.get(k) || '').trim(); };
        var date = get('Date needed');
        var time = get('Time needed');
        var day = '', dayLong = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            var p = date.split('-');
            var d = new Date(+p[0], p[1] - 1, +p[2]);
            day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            dayLong = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
        var clock = '';
        if (/^\d{2}:\d{2}/.test(time)) {
            var h = +time.slice(0, 2), m = time.slice(3, 5);
            clock = ((h % 12) || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
        }
        var people = get('People');
        var subject = [get('Name'), 'Catering request', (day || 'date not given') + (clock ? ' at ' + clock : ''),
            people ? people + ' people' : '', get('Pickup or drop-off')]

            .filter(Boolean).join(' · ');

        // Key order is the order the email lists them: what to act on first.
        var out = {
            access_key: get('access_key'),
            subject: subject,
            from_name: get('from_name'),
            'When': (dayLong || date || 'Not given') + (clock ? ' at ' + clock : time ? ' at ' + time : ', no time given'),
            'People': people,
            'Pickup or drop-off': get('Pickup or drop-off'),
            'Name': get('Name'),
            'Phone': get('Phone'),
            'email': get('email'),
            'Organization': get('Organization'),
            'Looking for': get('Looking for')
        };
        if (data.get('botcheck')) out.botcheck = true;
        Object.keys(out).forEach(function (k) { if (out[k] === '') delete out[k]; });
        return JSON.stringify(out);
    }

    /* ── Formspree and Web3Forms forms: submit in-page, confirm ── */

    document.querySelectorAll('form[action*="formspree.io"], form[action*="web3forms.com"]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            if (!form.reportValidity()) return;

            var button = form.querySelector('button[type="submit"]');
            var status = form.querySelector('.form-status');
            if (!status) {
                status = document.createElement('p');
                status.className = 'form-status';
                status.setAttribute('role', 'status');
                status.setAttribute('tabindex', '-1');
                form.appendChild(status);
            }
            status.hidden = true;
            status.classList.remove('form-status--error');

            var buttonText = button ? button.textContent : '';
            if (button) {
                button.disabled = true;
                button.textContent = 'Sending…';
            }

            var isCatering = form.hasAttribute('data-catering');
            fetch(form.action, {
                method: 'POST',
                body: isCatering ? cateringEmail(form) : new FormData(form),
                headers: isCatering
                    ? { 'Accept': 'application/json', 'Content-Type': 'application/json' }
                    : { 'Accept': 'application/json' }
            }).then(function (response) {
                if (!response.ok) throw new Error('Form service returned ' + response.status);
                return response.json().catch(function () { return {}; });
            }).then(function (result) {
                // Web3Forms answers 200 with success: false on some refusals.
                if (result && result.success === false) throw new Error(result.message || 'Refused');

                form.querySelectorAll('.form-grid').forEach(function (el) {
                    el.hidden = true;
                });
                status.textContent = form.getAttribute('data-success') ||
                    'Thank you! Your message is on its way.';
                status.hidden = false;
                status.focus();
            }).catch(function () {
                if (button) {
                    button.disabled = false;
                    button.textContent = buttonText;
                }
                status.classList.add('form-status--error');
                status.textContent = 'Sorry — something went wrong and your message was not sent. ' +
                    'Please try again in a moment, or call us at (913) 547-9994.';
                status.hidden = false;
                status.focus();
            });
        });
    });

}());
