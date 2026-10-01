/* ==========================================================================
   K Manimaran — portfolio interactions
   Plain ES5-compatible script, no dependencies. One rAF loop drives both the
   scroll-linked UI and the WebGL renderer so we never compete for frames.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var $  = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function on(el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt || false); }

  /* ====================================================== preloader */

  (function preloader() {
    var box   = $('#preloader');
    var fill  = $('#preloaderFill');
    var pct   = $('#preloaderPct');
    if (!box) return;

    if (reduced) { box.classList.add('is-done'); return; }

    var value = 0, target = 0, done = false, raf = 0;
    target = 0.9;

    function step() {
      value += (target - value) * 0.09;
      var shown = Math.round(value * 100);
      if (fill) fill.style.width = shown + '%';
      if (pct) pct.textContent = shown + '%';
      if (value > target - 0.005 && target >= 1) { finish(); return; }
      raf = requestAnimationFrame(step);
    }

    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
      setTimeout(function () { box.classList.add('is-done'); }, 180);
    }

    raf = requestAnimationFrame(step);

    function ready() { target = 1; }
    if (doc.readyState === 'complete') ready();
    else on(window, 'load', ready);
    /* never trap the user behind a stalled asset */
    setTimeout(finish, 4200);
  })();

  /* ==================================================== header + nav */

  (function header() {
    var head = $('#siteHead');
    var burger = $('#burger');
    var nav = $('#nav');

    on(burger, 'click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    $$('#nav a').forEach(function (a) {
      on(a, 'click', function () {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    on(doc, 'keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    });

    window.__kmHeader = head;
  })();

  /* ==================================================== smooth scroll */

  (function smoothScroll() {
    var headH = function () { return ($('#siteHead') ? $('#siteHead').offsetHeight : 68) + 14; };

    function go(hash) {
      var target = doc.getElementById(hash);
      if (!target) return;
      var top = target.getBoundingClientRect().top + window.pageYOffset - headH();
      window.scrollTo({ top: Math.max(top, 0), behavior: reduced ? 'auto' : 'smooth' });
    }

    $$('a[href^="#"]').forEach(function (link) {
      on(link, 'click', function (e) {
        var id = link.getAttribute('href');
        if (!id || id === '#' || id.length < 2) return;
        if (!doc.getElementById(id.slice(1))) return;
        e.preventDefault();
        go(id.slice(1));
        history.replaceState(null, '', id);
      });
    });

    if (location.hash.length > 1) {
      window.addEventListener('load', function () { setTimeout(function () { go(location.hash.slice(1)); }, 80); });
    }

    var toTop = $('#toTop');
    on(toTop, 'click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
    window.__kmToTop = toTop;
  })();

  /* ========================================================== reveal */

  (function reveal() {
    var items = $$('.reveal');
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var group = el.parentNode ? $$('.reveal', el.parentNode).filter(function (n) { return n !== el; }).length : 0;
        var delay = Math.min(group * 55, 320);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ======================================================== counters */

  (function counters() {
    var els = $$('[data-count]');
    if (!els.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      if (reduced) { el.textContent = target.toFixed(decimals); return; }
      var dur = 1250, t0 = null;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ==================================================== text scramble */

  (function scramble() {
    var glyphs = '!<>-_\\/[]{}—=+*^?#0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var els = $$('[data-scramble]');
    if (!els.length || reduced) return;

    function play(el) {
      var text = el.getAttribute('data-text') || el.textContent;
      el.setAttribute('data-text', text);
      var n = text.length;
      var lead = 9;                    /* frames of noise before the first glyph settles */
      var total = n + lead + 2;
      var frame = 0;

      function tick() {
        var out = '';
        for (var i = 0; i < n; i++) {
          if (frame >= i + lead) out += text[i];
          else out += text[i] === ' ' ? ' ' : glyphs.charAt(Math.random() * glyphs.length | 0);
        }
        el.textContent = out;
        frame++;
        if (frame < total) requestAnimationFrame(tick);
        else el.textContent = text;
      }
      requestAnimationFrame(tick);
    }

    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ================================================ cursor + magnet + tilt */

  (function pointer() {
    if (!finePointer || reduced) return;

    var cur = $('#cursor');
    if (cur) doc.documentElement.classList.add('has-cursor');
    var dot = cur ? cur.children[0] : null;
    var core = cur ? cur.children[1] : null;
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var dx = mx, dy = my, cx = mx, cy = my;

    on(window, 'pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      var hot = e.target && e.target.closest &&
        e.target.closest('a, button, [data-tilt], [data-magnetic], .skill, .chip-btn');
      if (cur) cur.classList.toggle('is-hot', !!hot);
    }, { passive: true });

    /* magnetic buttons */
    $$('[data-magnetic]').forEach(function (el) {
      on(el, 'pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var ox = (e.clientX - (r.left + r.width / 2)) * 0.22;
        var oy = (e.clientY - (r.top + r.height / 2)) * 0.28;
        el.style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)';
      });
      on(el, 'pointerleave', function () { el.style.transform = ''; });
    });

    /* 3D tilt + spotlight on cards */
    $$('[data-tilt]').forEach(function (el) {
      var strength = 7;
      on(el, 'pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        el.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - py) * strength * 2).toFixed(2) +
                             'deg) rotateY(' + ((px - 0.5) * strength * 2).toFixed(2) + 'deg) translateY(-4px)';
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      on(el, 'pointerleave', function () {
        el.style.transform = '';
      });
    });

    window.__kmCursorTick = function () {
      dx = lerp(dx, mx, 0.18);
      dy = lerp(dy, my, 0.18);
      cx = lerp(cx, mx, 0.42);
      cy = lerp(cy, my, 0.42);
      if (dot) dot.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) translate(-50%,-50%)';
      if (core) core.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px) translate(-50%,-50%)';
    };
  })();

  /* ==================================================== project filter */

  (function filter() {
    var buttons = $$('.chip-btn');
    var cards = $$('#projectsGrid .project');
    var empty = $('#projectsEmpty');
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      on(btn, 'click', function () {
        var f = btn.getAttribute('data-filter');
        buttons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        var shown = 0;
        cards.forEach(function (c) {
          var tags = (c.getAttribute('data-tags') || '').split(/\s+/);
          var ok = f === 'all' || tags.indexOf(f) !== -1;
          c.classList.toggle('is-hidden', !ok);
          if (ok) {
            shown++;
            c.classList.remove('is-in');
            requestAnimationFrame(function () { c.classList.add('is-in'); });
          }
        });
        if (empty) empty.hidden = shown !== 0;
      });
    });
  })();

  /* ======================================================= contact form */

  (function contactForm() {
    var form    = $('#contactForm');
    if (!form) return;

    var status  = $('#cf-status');
    var submit  = $('.cform__submit', form);
    var label   = $('.cform__submit-label', form);
    var counter = $('#cf-message-count');
    var message = $('#cf-message');
    var fallback = $('#cf-fallback');
    var mailto = $('#cf-mailto');
    var CONTACT_EMAIL = 'manimarank900@gmail.com';

    /* The API base lives in a <meta> tag so it can be changed without touching
       any JavaScript. An empty value puts the form into email-only mode. */
    var meta = $('meta[name="portfolio-api"]');
    var base = meta ? (meta.getAttribute('content') || '').trim().replace(/\/+$/, '') : '';
    var isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(location.hostname) ||
                  location.protocol === 'file:';

    var LIMITS = { name: [2, 80], email: [0, 160], company: [0, 120], message: [10, 4000] };
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var startedAt = Date.now();
    var sending = false;

    /* ---------------------------------------------------------- helpers */

    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text;
      status.className = 'cform__status' + (kind ? ' cform__status--' + kind : '');
    }

    function fieldError(input, message) {
      var box = $('[data-err-for="' + input.id + '"]', form);
      if (box) box.textContent = message || '';
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
      return !message;
    }

    function validate() {
      var ok = true;
      var firstBad = null;

      function check(input, message) {
        if (!fieldError(input, message) && !firstBad) firstBad = input;
        if (message) ok = false;
      }

      var name = $('#cf-name', form).value.trim();
      check($('#cf-name', form),
        !name ? 'Please tell me your name.'
        : name.length < LIMITS.name[0] ? 'That looks a little short.'
        : name.length > LIMITS.name[1] ? 'Please keep it under 80 characters.' : '');

      var email = $('#cf-email', form).value.trim();
      check($('#cf-email', form),
        !email ? 'I need an email to reply to.'
        : !EMAIL_RE.test(email) ? 'That does not look like a valid email address.'
        : email.length > LIMITS.email[1] ? 'That email is too long.' : '');

      var company = $('#cf-company', form).value.trim();
      check($('#cf-company', form),
        company.length > LIMITS.company[1] ? 'Company name is too long.' : '');

      var body = message.value.trim();
      check(message,
        !body ? 'Please write a message.'
        : body.length < LIMITS.message[0] ? 'A little more detail, please — at least 10 characters.'
        : body.length > LIMITS.message[1] ? 'Please keep it under 4000 characters.' : '');

      if (firstBad) firstBad.focus();
      return ok;
    }

    /* -------------------------------------------------- email fallback */

    function buildMailto(payload) {
      var subject = 'Portfolio enquiry — ' + payload.topic;
      var lines = [
        'Name: ' + payload.name,
        'Email: ' + payload.email,
        'Company: ' + (payload.company || '—'),
        '',
        payload.message
      ];
      return 'mailto:' + CONTACT_EMAIL +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(lines.join('\n'));
    }

    /* Every failure path funnels through here, so this is also the single
       place that puts the button back within reach for a retry. */
    function offerEmail(payload, why) {
      setSending(false);
      if (!fallback || !mailto) return;
      mailto.href = buildMailto(payload);
      fallback.hidden = false;
      setStatus(why + ' Your message is ready to send by email instead.', 'warn');
    }

    /* --------------------------------------------------------- counters */

    function updateCount() {
      if (!counter) return;
      var n = message.value.length;
      counter.textContent = n + ' / ' + LIMITS.message[1];
      counter.classList.toggle('is-near', n > LIMITS.message[1] * 0.9);
    }

    on(message, 'input', function () {
      updateCount();
      if (message.getAttribute('aria-invalid') === 'true' && message.value.trim().length >= LIMITS.message[0]) {
        fieldError(message, '');
      }
    });

    $$('.field__input', form).forEach(function (input) {
      on(input, 'blur', function () {
        if (input.value.trim() !== '') validateField(input);
      });
      on(input, 'input', function () {
        if (input.getAttribute('aria-invalid') === 'true') validateField(input);
      });
    });

    function validateField(input) {
      var v = input.value.trim();
      if (input.id === 'cf-name') {
        return fieldError(input, !v ? 'Please tell me your name.' : v.length < 2 ? 'That looks a little short.' : '');
      }
      if (input.id === 'cf-email') {
        return fieldError(input, !v ? '' : EMAIL_RE.test(v) ? '' : 'That does not look like a valid email address.');
      }
      if (input.id === 'cf-message') {
        return fieldError(input, !v ? '' : v.length < 10 ? 'A little more detail, please — at least 10 characters.' : '');
      }
      return true;
    }

    /* ---------------------------------------------------------- submit */

    function setSending(on_) {
      sending = on_;
      if (submit) {
        submit.disabled = on_;
        submit.classList.toggle('is-sending', on_);
      }
      if (label) label.textContent = on_ ? 'Sending…' : 'Send message';
    }

    function payload() {
      return {
        name: $('#cf-name', form).value.trim(),
        email: $('#cf-email', form).value.trim(),
        topic: $('#cf-topic', form).value,
        company: $('#cf-company', form).value.trim(),
        message: message.value.trim(),
        source: location.href.slice(0, 300),
        website: $('#cf-website', form).value,
        formStartedAt: startedAt
      };
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (sending) return;

      if (!validate()) {
        setStatus('Please fix the highlighted fields.', 'err');
        return;
      }

      if (fallback) fallback.hidden = true;
      setSending(true);
      setStatus('Sending your message…');

      var data = payload();
      var done = function (kind, text) {
        setSending(false);
        setStatus(text, kind);
      };

      /* No API configured: hand the visitor straight to their mail app. */
      if (!base) {
        mailto.href = buildMailto(data);
        if (fallback) fallback.hidden = false;
        setStatus('The form is not connected to an API yet, so this will open your email app instead.', 'warn');
        setSending(false);
        return;
      }

      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);

      fetch(base + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (result) {
          clearTimeout(timer);

          if (result.ok && result.body && result.body.success) {
            form.reset();
            startedAt = Date.now();
            updateCount();
            $$('.field__err', form).forEach(function (b) { b.textContent = ''; });
            $$('.field__input', form).forEach(function (i) { i.removeAttribute('aria-invalid'); });
            done('ok', 'Thanks — your message reached me. I reply to everything within a day.');
            return;
          }

          var detail = result.body && result.body.error;
          if (Array.isArray(detail)) detail = detail.join(' ');
          if (result.status === 400 && detail) {
            done('err', detail);
            return;
          }
          if (result.status === 429) {
            offerEmail(data, 'The form is rate limited right now.');
            return;
          }
          offerEmail(data, 'The form could not be sent.');
        })
        .catch(function () {
          clearTimeout(timer);
          offerEmail(data, 'The form could not reach the server.');
        });
    });

    /* Point at a live API in production, otherwise a localhost URL would just
       produce a confusing failure for every real visitor. */
    if (base && /localhost|127\.0\.0\.1/i.test(base) && !isLocal) {
      base = '';
      setStatus('Send me a message below, or email me directly.', '');
    }

    updateCount();
  })();

  /* ==================================================== case study modal */

  (function modal() {
    var box = $('#modal');
    var body = $('#modalBody');
    var title = $('#modalTitle');
    var closeBtn = $('.modal__close', box);
    if (!box || !body) return;
    var lastFocus = null;

    function open(card, trigger) {
      var detail = $('.detail', card);
      if (!detail) return;
      var h3 = $('.project__title', card);
      title.textContent = h3 ? h3.textContent : 'Case study';
      body.innerHTML = '';
      var frag = doc.createDocumentFragment();
      Array.prototype.slice.call(detail.childNodes).forEach(function (n) { frag.appendChild(n.cloneNode(true)); });
      body.appendChild(frag);
      box.hidden = false;
      doc.documentElement.style.overflow = 'hidden';
      window.__kmModal = true;
      /* a programmatic click may not have focused the trigger: fall back to it
         explicitly so focus can always be handed back on close */
      var active = doc.activeElement;
      lastFocus = (active && active !== doc.body && active !== doc.documentElement) ? active : (trigger || null);
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      box.hidden = true;
      body.innerHTML = '';
      doc.documentElement.style.overflow = '';
      window.__kmModal = false;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    $$('[data-modal-open]').forEach(function (btn) {
      on(btn, 'click', function () {
        var card = btn.closest ? btn.closest('.project') : null;
        if (card) open(card, btn);
      });
    });

    $$('[data-modal-close]').forEach(function (el) { on(el, 'click', close); });

    on(doc, 'keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', box)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ==================================================== copy + toast */

  (function copy() {
    var toast = $('#toast');
    var timer = 0;
    function say(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('is-on');
      clearTimeout(timer);
      timer = setTimeout(function () { toast.classList.remove('is-on'); }, 1900);
    }
    $$('[data-copy]').forEach(function (el) {
      on(el, 'click', function () {
        var value = el.getAttribute('data-copy');
        var done = function () {
          say('Copied ' + value);
          el.classList.add('is-copied');
          setTimeout(function () { el.classList.remove('is-copied'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, function () { say(value); });
        } else {
          var ta = doc.createElement('textarea');
          ta.value = value; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;opacity:0';
          doc.body.appendChild(ta); ta.select();
          try { doc.execCommand('copy'); done(); } catch (err) { say(value); }
          doc.body.removeChild(ta);
        }
      });
    });
    window.__kmToast = say;
  })();

  /* ========================================================== marquee */

  (function marquee() {
    var track = $('#marqueeTrack');
    if (!track) return;
    var words = ['MongoDB', 'Express.js', 'React.js', 'Node.js', 'TypeScript', 'Mongoose',
                 'Three.js', 'React Three Fiber', 'GSAP', 'Vercel', 'Render', 'Atlas',
                 'JWT Auth', 'REST APIs', 'WebGL', 'Tailwind CSS'];
    var html = words.map(function (w) { return '<i aria-hidden="true"></i>' + w; }).join('');
    track.innerHTML = '<span>' + html + '</span><span aria-hidden="true">' + html + '</span>';
  })();

  /* ============================================================== 3D */

  var gl3d = null;
  var stage = $('#stage');
  var fallback = $('#stageFallback');
  var labelsBox = $('#netLabels');
  var labelEls = [];
  var hoverIdx = -1;

  function buildNetwork() {
    var cards = $$('#skillsGrid .skill');
    if (!cards.length) return null;
    return cards.map(function (card) {
      var rgb = (card.getAttribute('data-color') || '102,148,255').split(',').map(Number);
      return {
        label: ($('.skill__title', card) || {}).textContent || 'Skills',
        color: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255],
        skills: (card.getAttribute('data-skills') || '').split('|').filter(Boolean)
      };
    });
  }

  function init3D() {
    if (reduced || !stage || !window.KMGL) return;

    var canvas = $('#gl');
    if (!canvas) return;

    var lowPower = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 760;
    var api;
    try {
      api = window.KMGL.create(canvas, { lowPower: lowPower });
    } catch (err) {
      api = null;
    }

    if (!api) {
      stage.style.display = 'none';
      if (fallback) fallback.classList.add('is-on');
      return;
    }

    gl3d = api;
    var cats = buildNetwork();
    if (cats) gl3d.setNetwork(cats);

    /* The constellation's floating labels are only built if that scene is ever
       used, so the current aurora ships without a layer of dead elements. */
    var labelsBuilt = false;
    function ensureLabels() {
      if (labelsBuilt || !labelsBox || !cats) return;
      labelsBuilt = true;
      cats.forEach(function (c) {
        var el = doc.createElement('span');
        el.className = 'netlabel netlabel--hub';
        el.textContent = c.label;
        labelsBox.appendChild(el);
        labelEls.push(el);
      });
      var tip = doc.createElement('span');
      tip.className = 'netlabel';
      labelsBox.appendChild(tip);
      labelEls.push(tip);
    }

    /* pointer parallax */
    var tx = 0, ty = 0, px = 0, py = 0;
    on(window, 'pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    /* hover picking against the constellation */
    on(window, 'pointermove', function (e) {
      if (!gl3d || gl3d.state.scene !== 'network' || !gl3d.nodeCount()) return;
      ensureLabels();
      var idx = gl3d.pick(e.clientX, e.clientY);
      if (idx !== hoverIdx) {
        hoverIdx = idx;
        gl3d.setHighlight(idx);
        var tip = labelEls[labelEls.length - 1];
        if (tip) {
          var n = idx >= 0 ? gl3d.node(idx) : null;
          tip.textContent = n ? n.label : '';
          tip.classList.toggle('is-on', !!n);
        }
      }
    }, { passive: true });

    window.__kmGLTick = function (dt) {
      if (gl3d.lost) return;
      px = lerp(px, tx, clamp(dt * 3.2, 0, 1));
      py = lerp(py, ty, clamp(dt * 3.2, 0, 1));
      gl3d.state.pointerX = px;
      gl3d.state.pointerY = py;
      if (labelsBox) labelsBox.classList.toggle('is-on', gl3d.state.scene === 'network');
      if (gl3d.state.scene === 'network' && labelsBox) { ensureLabels(); positionLabels(); }
    };

    window.__kmGLResize = function () { gl3d.resize(); };
    on(window, 'resize', function () { gl3d.resize(); }, { passive: true });
  }

  function positionLabels() {
    if (!gl3d || !labelEls.length) return;
    var hubs = labelEls.length - 1;
    for (var i = 0; i < hubs; i++) {
      var p = gl3d.project(i);
      var el = labelEls[i];
      if (!p) { el.style.opacity = '0'; continue; }
      el.style.opacity = '';
      el.style.left = p.x.toFixed(1) + 'px';
      el.style.top = p.y.toFixed(1) + 'px';
    }
    if (hoverIdx >= 0) {
      var hp = gl3d.project(hoverIdx);
      var tip = labelEls[labelEls.length - 1];
      if (hp && tip) { tip.style.left = hp.x.toFixed(1) + 'px'; tip.style.top = hp.y.toFixed(1) + 'px'; }
    }
  }

  /* ================================================== master rAF loop */

  (function loop() {
    var scrollFill = $('#scrollFill');
    var heroEl = $('#hero');
    var skillsEl = $('#skills');
    var sections = $$('#main section[id]');
    var navLinks = $$('#nav a');
    var heroH = 1, skillsTop = 0, skillsH = 1, measured = 0;

    function measure() {
      heroH = heroEl ? heroEl.offsetHeight : window.innerHeight;
      skillsTop = skillsEl ? skillsEl.offsetTop : 0;
      skillsH = skillsEl ? skillsEl.offsetHeight : window.innerHeight;
      measured = performance.now();
    }
    measure();
    on(window, 'resize', measure, { passive: true });
    on(window, 'load', measure);

    function stageState(y, vh) {
      var op = 0, scene = 'core';

      if (y < heroH * 1.02) {
        op = Math.max(op, 1 - smoothstep(0.45, 0.98, y / heroH));
        scene = 'core';
      }

      var sIn = skillsTop - vh * 0.28;
      var sOut = skillsTop + skillsH - vh * 0.30;
      if (y > sIn && y < sOut) {
        /* ramp over a pixel distance, not a percentage: the skills section is far
           taller on mobile, and a 20% ramp there leaves the constellation dim
           for most of the scroll */
        var range = Math.max(sOut - sIn, 1);
        var d = y - sIn;
        var fadeIn = Math.min(range * 0.20, vh * 0.55);
        var fadeOut = Math.min(range * 0.30, vh * 0.55);
        op = Math.max(op, smoothstep(0, fadeIn, d) * (1 - smoothstep(range - fadeOut, range, d)));
        scene = 'aurora';
      }

      return { opacity: op, scene: scene };
    }

    var last = performance.now();
    var ticking = true;

    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      var y = window.pageYOffset || doc.documentElement.scrollTop || 0;
      var vh = window.innerHeight;
      var docH = Math.max(doc.body.scrollHeight - vh, 1);

      if (scrollFill) scrollFill.style.width = (clamp(y / docH, 0, 1) * 100).toFixed(2) + '%';

      var head = window.__kmHeader;
      if (head) head.classList.toggle('is-stuck', y > 12);

      var tt = window.__kmToTop;
      if (tt) tt.classList.toggle('is-on', y > vh * 0.9);

      /* active nav link */
      var activeId = null;
      for (var s = 0; s < sections.length; s++) {
        var r = sections[s].getBoundingClientRect();
        if (r.top <= vh * 0.36 && r.bottom > vh * 0.36) { activeId = sections[s].id; break; }
      }
      if (activeId !== frame._active) {
        frame._active = activeId;
        for (var n = 0; n < navLinks.length; n++) {
          navLinks[n].classList.toggle('is-active', navLinks[n].getAttribute('href') === '#' + activeId);
        }
      }

      /* 3D — the fade is done in CSS so the shader always draws at full alpha */
      /* a full-screen modal covers the scene completely: no point burning GPU */
      if (window.__kmModal) {
        if (gl3d) gl3d.state.visible = false;
        if (ticking) requestAnimationFrame(frame);
        return;
      }

      if (gl3d) {
        var s2 = stageState(y, vh);
        if (s2.opacity < 0.005) {
          gl3d.state.visible = false;
        } else {
          gl3d.state.visible = true;
          gl3d.state.opacity = 1;
          if (gl3d.state.scene !== s2.scene) {
            gl3d.state.scene = s2.scene;
            if (s2.scene === 'core') gl3d.setHighlight(-1);
          }
          stage.style.opacity = s2.opacity.toFixed(3);
          /* hero scroll drives the core's dolly + hue; skills scroll drives the network spin */
          gl3d.state.scroll = s2.scene === 'core'
            ? clamp(y / Math.max(heroH, 1), 0, 1)
            : clamp((y - skillsTop) / Math.max(skillsH, 1), 0, 1);
          gl3d.render(now / 1000);
        }
      }

      if (window.__kmCursorTick) window.__kmCursorTick(dt);
      if (window.__kmGLTick) window.__kmGLTick(dt);

      if (ticking) requestAnimationFrame(frame);
    }

    on(doc, 'visibilitychange', function () {
      if (doc.hidden) {
        ticking = false;
      } else if (!ticking) {
        ticking = true;
        last = performance.now();
        if (measured && performance.now() - measured > 800) measure();
        requestAnimationFrame(frame);
      }
    });

    /* keep measurements honest as lazy content expands */
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { measure(); });
      if (doc.body) ro.observe(doc.body);
    }

    requestAnimationFrame(frame);
  })();

  /* ============================================================== misc */

  (function misc() {
    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    /* start the 3D only after first paint so text is never blocked */
    var go = function () { init3D(); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 900 });
    else setTimeout(go, 260);
  })();

})();
