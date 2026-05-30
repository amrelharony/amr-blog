// ═══════════════════════════════════════════════════════════════════════
// holiday-engine.js  v2 — Evergreen Holiday Animation Engine
// Dynamically detects Egyptian, Islamic, Coptic & International holidays,
// lazy-loads themed assets, and fires GSAP animations.
// ═══════════════════════════════════════════════════════════════════════
(function HolidayEngine() {
  'use strict';

  // ── Guards ──
  var gsap = window.gsap;
  if (!gsap) return;

  var reducedMotion = window._reducedMotion ||
    window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  // ══════════════════════════════════════════════════════════════════
  //  §1  DATE UTILITIES
  // ══════════════════════════════════════════════════════════════════

  /** Cairo-timezone date parts: { year, month (1-12), day, dow (0=Sun) } */
  function cairoNow() {
    var d = new Date();
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).formatToParts(d);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year:  parseInt(o.year, 10),
      month: parseInt(o.month, 10),
      day:   parseInt(o.day, 10),
      dow:   dowMap[o.weekday] || 0
    };
  }

  /**
   * Hijri (islamic-umalqura) date via Intl API.
   * Returns { hijriMonth (1-12), hijriDay (1-30) }
   *
   * EVERGREEN: The browser's ICU data handles the Hijri ↔ Gregorian
   * conversion every year — no hardcoded ranges needed.
   */
  function hijriNow() {
    var d = new Date();
    try {
      var fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      var parts = fmt.formatToParts(d);
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      // Year can arrive as "1447" or "1447 AH" depending on locale; strip non-digits.
      var yRaw = (o.year || '').replace(/[^0-9]/g, '');
      return {
        hijriYear:  yRaw ? parseInt(yRaw, 10) : -1,
        hijriMonth: parseInt(o.month, 10),
        hijriDay:   parseInt(o.day, 10)
      };
    } catch (e) {
      return { hijriYear: -1, hijriMonth: -1, hijriDay: -1 };
    }
  }

  /**
   * Coptic/Orthodox Easter — Gregorian dates, 2026-2035.
   * Computed from the Julian-calendar Paschal algorithm (Meeus),
   * then converted to Gregorian. Pre-computed for zero-cost lookup.
   */
  var COPTIC_EASTER = {
    2026: [4, 12], 2027: [5,  2], 2028: [4, 16], 2029: [4,  8], 2030: [4, 28],
    2031: [4, 13], 2032: [5,  2], 2033: [4, 24], 2034: [4,  9], 2035: [4, 29]
  };

  /** Coptic New Year (Nayrouz): Sept 11, or Sept 12 in Gregorian leap years. */
  function nayrouzDay(year) {
    var isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 12 : 11;
  }

  // ══════════════════════════════════════════════════════════════════
  //  §2  HOLIDAY DETECTION — Priority-ordered evaluation
  // ══════════════════════════════════════════════════════════════════

  function detectHoliday() {
    var c = cairoNow();
    var h = hijriNow();
    var m = c.month, d = c.day, y = c.year;

    // ── TIER 1: Islamic Holidays (Hijri calendar) ──

    // Ramadan — entire 9th Hijri month
    if (h.hijriMonth === 9) return { theme: 'atmospheric', name: 'ramadan', css: 'theme-ramadan' };

    // Laylat al-Qadr — Ramadan 27 (Night of Power, already within month 9)
    // Note: This is inside Ramadan, but we can give it a special name if we
    // want distinct styling later. For now Ramadan covers it.

    // Eid al-Fitr — Shawwal 1-3
    if (h.hijriMonth === 10 && h.hijriDay >= 1 && h.hijriDay <= 3)
      return { theme: 'atmospheric', name: 'eid-fitr', css: 'theme-eid-fitr' };

    // Day of Arafah — Dhul Hijjah 9 (eve of Eid al-Adha)
    if (h.hijriMonth === 12 && h.hijriDay === 9)
      return { theme: 'atmospheric', name: 'arafah', css: 'theme-arafah' };

    // Eid al-Adha — Dhul Hijjah 10-13
    if (h.hijriMonth === 12 && h.hijriDay >= 10 && h.hijriDay <= 13)
      return { theme: 'atmospheric', name: 'eid-adha', css: 'theme-eid-adha' };

    // Isra and Mi'raj — Rajab 27 (Night Journey)
    if (h.hijriMonth === 7 && h.hijriDay === 27)
      return { theme: 'atmospheric', name: 'isra-miraj', css: 'theme-isra-miraj' };

    // Mawlid al-Nabi — Rabi al-Awwal 12
    if (h.hijriMonth === 3 && h.hijriDay === 12)
      return { theme: 'atmospheric', name: 'mawlid', css: 'theme-mawlid' };

    // 15th of Sha'ban (Mid-Sha'ban / Laylat al-Bara'ah)
    if (h.hijriMonth === 8 && h.hijriDay === 15)
      return { theme: 'atmospheric', name: 'mid-shaban', css: 'theme-mid-shaban' };

    // Islamic New Year — Muharram 1
    if (h.hijriMonth === 1 && h.hijriDay === 1)
      return { theme: 'atmospheric', name: 'hijri-ny', css: 'theme-hijri-ny' };

    // Ashura — Muharram 10
    if (h.hijriMonth === 1 && h.hijriDay === 10)
      return { theme: 'atmospheric', name: 'ashura', css: 'theme-ashura' };

    // ── TIER 2: Egyptian National Days ──

    // Police Day / January 25 Revolution
    if (m === 1 && d === 25)
      return { theme: 'national', name: 'jan25', css: 'theme-egypt-national' };

    // Sinai Liberation Day — April 25
    if (m === 4 && d === 25)
      return { theme: 'national', name: 'sinai', css: 'theme-egypt-national' };

    // June 30 Revolution
    if (m === 6 && d === 30)
      return { theme: 'national', name: 'jun30', css: 'theme-egypt-national' };

    // Revolution Day — July 23
    if (m === 7 && d === 23)
      return { theme: 'national', name: 'revolution', css: 'theme-egypt-national' };

    // Suez Canal Nationalization — July 26
    if (m === 7 && d === 26)
      return { theme: 'national', name: 'suez-canal', css: 'theme-egypt-national' };

    // 6th October Victory
    if (m === 10 && d === 6)
      return { theme: 'national', name: 'oct6', css: 'theme-egypt-national' };

    // ── TIER 3: Coptic / Orthodox ──

    // Coptic Easter & Sham el-Nessim
    var easter = COPTIC_EASTER[y];
    if (easter) {
      if (m === easter[0] && d === easter[1])
        return { theme: 'nature', name: 'coptic-easter', css: 'theme-nature' };

      // Sham el-Nessim = Monday after Easter Sunday (+1 day)
      var shamDate = new Date(y, easter[0] - 1, easter[1] + 1);
      if (m === shamDate.getMonth() + 1 && d === shamDate.getDate())
        return { theme: 'nature', name: 'sham-el-nessim', css: 'theme-nature' };
    }

    // Coptic Christmas — January 7
    if (m === 1 && d === 7)
      return { theme: 'winter', name: 'coptic-christmas', css: 'theme-winter' };

    // Coptic New Year (Nayrouz)
    if (m === 9 && d === nayrouzDay(y))
      return { theme: 'celebration', name: 'nayrouz', css: 'theme-celebration' };

    // ── TIER 4: International Holidays ──

    // New Year's Day — Jan 1
    if (m === 1 && d === 1)
      return { theme: 'winter', name: 'new-year', css: 'theme-winter' };

    // New Year's Eve — Dec 31
    if (m === 12 && d === 31)
      return { theme: 'celebration', name: 'nye', css: 'theme-celebration' };

    // International Christmas — Dec 24-25
    if (m === 12 && (d === 24 || d === 25))
      return { theme: 'winter', name: 'christmas', css: 'theme-winter' };

    // International Women's Day — March 8
    if (m === 3 && d === 8)
      return { theme: 'romantic', name: 'womens-day', css: 'theme-romantic' };

    // Egyptian Mother's Day — March 21
    if (m === 3 && d === 21)
      return { theme: 'romantic', name: 'mothers-day', css: 'theme-romantic' };

    // Valentine's Day — Feb 14
    if (m === 2 && d === 14)
      return { theme: 'romantic', name: 'valentine', css: 'theme-romantic' };

    // World Environment Day — June 5
    if (m === 6 && d === 5)
      return { theme: 'nature', name: 'environment-day', css: 'theme-nature' };

    // Earth Day — April 22
    if (m === 4 && d === 22)
      return { theme: 'nature', name: 'earth-day', css: 'theme-nature' };

    // St. Patrick's Day — March 17
    if (m === 3 && d === 17)
      return { theme: 'nature', name: 'st-patrick', css: 'theme-nature' };

    // Labor Day — May 1
    if (m === 5 && d === 1)
      return { theme: 'celebration', name: 'labor-day', css: 'theme-celebration' };

    // International Day of Peace — Sept 21
    if (m === 9 && d === 21)
      return { theme: 'nature', name: 'peace-day', css: 'theme-nature' };

    // World Teachers' Day — Oct 5
    if (m === 10 && d === 5)
      return { theme: 'celebration', name: 'teachers-day', css: 'theme-celebration' };

    // ── TIER 5: Fun / Seasonal ──

    // Pi Day — March 14
    if (m === 3 && d === 14)
      return { theme: 'prank', name: 'pi-day', css: 'theme-prank' };

    // April Fool's — April 1
    if (m === 4 && d === 1)
      return { theme: 'prank', name: 'april-fools', css: 'theme-prank' };

    // Star Wars Day — May 4
    if (m === 5 && d === 4)
      return { theme: 'spooky', name: 'star-wars', css: 'theme-starwars' };

    // Halloween — Oct 25-31
    if (m === 10 && d >= 25 && d <= 31)
      return { theme: 'spooky', name: 'halloween', css: 'theme-spooky' };

    // Winter season — Dec 1-23 (ambient snowfall)
    if (m === 12 && d >= 1 && d <= 23)
      return { theme: 'winter', name: 'winter-season', css: 'theme-winter' };

    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  §3  LAZY ASSET INJECTION
  // ══════════════════════════════════════════════════════════════════

  function injectCSS(css) {
    var style = document.createElement('style');
    style.setAttribute('data-holiday', 'true');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  function injectSVG(svgString, container) {
    var div = document.createElement('div');
    div.setAttribute('data-holiday', 'true');
    div.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;';
    div.innerHTML = svgString;
    (container || document.body).appendChild(div);
    return div;
  }

  /** Batch-spawn lightweight particle elements with a DocumentFragment. */
  function spawnParticles(count, content, colors, cssExtra) {
    var frag = document.createDocumentFragment();
    var els = [];
    for (var i = 0; i < count; i++) {
      var span = document.createElement('span');
      span.setAttribute('data-holiday', 'true');
      span.textContent = content;
      span.style.cssText =
        'position:fixed;pointer-events:none;z-index:9998;font-size:' +
        (10 + Math.random() * 14) + 'px;color:' +
        colors[i % colors.length] + ';will-change:transform,opacity;opacity:0;' +
        (cssExtra || '');
      frag.appendChild(span);
      els.push(span);
    }
    document.body.appendChild(frag);
    return els;
  }

  /** Kill all running tweens and remove all injected elements. */
  function cleanup() {
    document.querySelectorAll('[data-holiday]').forEach(function (el) {
      gsap.killTweensOf(el);
      el.remove();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  §4  ANIMATION THEME BUCKETS — 8 unique visual experiences
  // ══════════════════════════════════════════════════════════════════

  // Random helper clamped to range
  function rand(min, max) { return min + Math.random() * (max - min); }

  // ─────────────────────────────────────────────────────────────────
  // 4a. THE "PRANK" — April Fool's & Pi Day
  //
  // MOUSE-EVASION + SPIN:
  //   Vector math: cursor→element center, if dist < 50px, compute
  //   normalized escape vector × random flee distance (80-150px).
  //   Clamp within viewport. Element also does a cheeky spin.
  //   For Pi Day: the element spins exactly 3.14 full rotations.
  // ─────────────────────────────────────────────────────────────────
  function animatePrank(holidayName) {
    var target = document.getElementById('vcBtn');
    if (!target) {
      var links = document.querySelectorAll('.lk');
      if (links.length) target = links[Math.floor(Math.random() * links.length)];
    }
    if (!target) return;

    var THRESHOLD = 50;
    var FLEE_MIN = 80;
    var FLEE_MAX = 150;
    var offsetX = 0, offsetY = 0;
    var fleeCount = 0;

    var qx = gsap.quickTo(target, 'x', { duration: 0.25, ease: 'power3.out' });
    var qy = gsap.quickTo(target, 'y', { duration: 0.25, ease: 'power3.out' });

    function onMove(e) {
      if (window._suspended) return;
      var rect = target.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = cx - e.clientX;
      var dy = cy - e.clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < THRESHOLD && dist > 0) {
        var flee = FLEE_MIN + Math.random() * (FLEE_MAX - FLEE_MIN);
        var nx = (dx / dist) * flee;
        var ny = (dy / dist) * flee;
        var pad = 20;
        var newX = offsetX + nx;
        var newY = offsetY + ny;
        var fRect = target.getBoundingClientRect();
        if (fRect.left + nx < pad) newX = offsetX + Math.abs(nx);
        if (fRect.right + nx > window.innerWidth - pad) newX = offsetX - Math.abs(nx);
        if (fRect.top + ny < pad) newY = offsetY + Math.abs(ny);
        if (fRect.bottom + ny > window.innerHeight - pad) newY = offsetY - Math.abs(ny);
        offsetX = newX;
        offsetY = newY;
        qx(offsetX);
        qy(offsetY);
        fleeCount++;

        // Cheeky spin every 3rd flee
        if (fleeCount % 3 === 0) {
          gsap.to(target, {
            rotation: '+=' + (holidayName === 'pi-day' ? 1131.4 : 360),
            duration: 0.4,
            ease: 'power2.out'
          });
        }
      }
    }

    document.addEventListener('mousemove', onMove, { passive: true });

    // Timeout: stop prank and snap back with elastic ease
    setTimeout(function () {
      document.removeEventListener('mousemove', onMove);
      gsap.to(target, { x: 0, y: 0, rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    }, 30000);
  }

  // ─────────────────────────────────────────────────────────────────
  // 4b. THE "ATMOSPHERIC" — Islamic holidays
  //
  // Multi-layered scene:
  //   1. Background star field (tiny pulsing dots)
  //   2. Crescent moon SVG with stroke-dashoffset draw-on reveal
  //   3. Fanous (lantern) SVG with swinging pendulum animation
  //   4. Soft ambient glow that pulses in a yoyo loop
  //   5. For Ramadan: floating lantern particles rise gently
  // ─────────────────────────────────────────────────────────────────
  function animateAtmospheric(holidayName) {
    // ── Star field: tiny dots in the top corner region ──
    var starCount = 12;
    var starContainer = document.createElement('div');
    starContainer.setAttribute('data-holiday', 'true');
    starContainer.style.cssText =
      'position:fixed;top:0;right:0;width:180px;height:200px;pointer-events:none;z-index:9998;';
    document.body.appendChild(starContainer);

    for (var s = 0; s < starCount; s++) {
      var star = document.createElement('span');
      star.setAttribute('data-holiday', 'true');
      star.textContent = '✦';
      star.style.cssText =
        'position:absolute;font-size:' + rand(4, 10) + 'px;color:#f5c518;opacity:0;' +
        'top:' + rand(5, 90) + '%;left:' + rand(5, 90) + '%';
      starContainer.appendChild(star);
      gsap.to(star, {
        opacity: rand(0.15, 0.5),
        duration: rand(1.5, 3),
        delay: rand(0.5, 3),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      });
    }

    // ── Crescent + Lantern SVG ──
    var svgStr =
      '<svg viewBox="0 0 120 160" width="90" height="120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path class="hol-crescent" d="M60 10 A30 30 0 1 1 60 70 A22 22 0 1 0 60 10Z" ' +
          'stroke="#f5c518" stroke-width="1.5" fill="none" />' +
        '<line class="hol-chain" x1="60" y1="75" x2="60" y2="90" stroke="#f5c518" stroke-width="1" />' +
        '<path class="hol-lantern-top" d="M53 90 L67 90 L65 95 L55 95Z" ' +
          'stroke="#f5c518" stroke-width="1" fill="none" />' +
        '<path class="hol-lantern-body" d="M50 95 Q48 115 50 130 L54 135 L66 135 L70 130 Q72 115 70 95Z" ' +
          'stroke="#f5c518" stroke-width="1.2" fill="none" />' +
        '<path class="hol-lantern-base" d="M54 135 L53 140 L67 140 L66 135" ' +
          'stroke="#f5c518" stroke-width="1" fill="none" />' +
        '<ellipse class="hol-glow" cx="60" cy="115" rx="8" ry="16" fill="#f5c518" opacity="0" />' +
        '<circle class="hol-flame" cx="60" cy="112" r="3" fill="#ff9500" opacity="0" />' +
      '</svg>';

    var container = injectSVG(svgStr);
    container.style.cssText += 'top:16px;right:20px;opacity:0;';

    // Draw-on: set stroke-dasharray/offset, then animate to 0
    var paths = container.querySelectorAll('path, line');
    paths.forEach(function (p) {
      var len = p.getTotalLength ? p.getTotalLength() : 80;
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });

    var glow  = container.querySelector('.hol-glow');
    var flame = container.querySelector('.hol-flame');
    var cresc = container.querySelector('.hol-crescent');
    var tl = gsap.timeline({ delay: 1.5 });

    // Phase 1: Fade in container
    tl.to(container, { opacity: 1, duration: 0.8, ease: 'power2.out' });

    // Phase 2: Draw-on reveal with stagger
    tl.to(paths, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: 'power2.inOut',
      stagger: 0.15
    }, '-=0.4');

    // Phase 3: Fill crescent with gold
    if (cresc) {
      tl.to(cresc, { attr: { fill: '#f5c518', 'fill-opacity': 0.85 }, duration: 0.8, ease: 'power2.out' });
    }

    // Phase 4: Lantern glow + flame
    if (glow) {
      tl.to(glow, { opacity: 0.3, duration: 1, ease: 'sine.inOut' });
      // Pulse the glow
      tl.to(glow, {
        opacity: 0.15,
        duration: 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1
      });
    }
    if (flame) {
      tl.to(flame, { opacity: 0.7, duration: 0.5, ease: 'power2.out' }, '-=2');
      // Flicker the flame
      gsap.to(flame, {
        attr: { r: 4 },
        opacity: 0.5,
        duration: 0.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 4
      });
    }

    // Phase 5: Gentle pendulum swing on the whole lantern
    gsap.to(container, {
      rotation: 3,
      duration: 3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 4,
      transformOrigin: '50% 0%'
    });

    // Phase 6 (Ramadan/Eid only): Floating lantern emojis rise from bottom
    if (holidayName === 'ramadan' || holidayName === 'eid-fitr' || holidayName === 'eid-adha') {
      var lanternEmoji = ['🏮', '🌙', '⭐'];
      for (var le = 0; le < 8; le++) {
        (function (idx) {
          setTimeout(function () {
            var em = document.createElement('span');
            em.setAttribute('data-holiday', 'true');
            em.textContent = lanternEmoji[idx % lanternEmoji.length];
            em.style.cssText =
              'position:fixed;bottom:-30px;pointer-events:none;z-index:9997;' +
              'font-size:' + rand(16, 28) + 'px;left:' + rand(5, 90) + '%;opacity:0;';
            document.body.appendChild(em);

            gsap.to(em, {
              y: -(window.innerHeight + 60),
              opacity: 0.6,
              duration: rand(8, 14),
              ease: 'power1.out',
              onComplete: function () { em.remove(); }
            });
            gsap.to(em, {
              x: rand(-40, 40),
              duration: rand(2, 4),
              ease: 'sine.inOut',
              yoyo: true,
              repeat: 6
            });
          }, idx * rand(1500, 3000));
        })(le);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4c. THE "NATIONAL PRIDE" — Egyptian national holidays
  //
  // PARTICLE PHYSICS — Multi-burst fireworks:
  //   Three staggered bursts from different horizontal origins.
  //   Each particle: origin → explosive upward impulse (power4.out)
  //   → gravity pull-back (power2.in) → fade out.
  //   Colors: Egyptian flag Red (#CE1126), White (#FFF), Black (#000)
  //
  //   GRAVITY SIMULATION:
  //     Phase 1: y = impulseY (negative = up), ease: power4.out
  //              This decelerates naturally like a real projectile
  //     Phase 2: y += gravityPull (positive = down), ease: power2.in
  //              This accelerates downward like gravity (v = gt)
  // ─────────────────────────────────────────────────────────────────
  function animateFireworks(colors, emoji, burstCount) {
    var PARTICLE_COUNT = 50;
    var BURSTS = burstCount || 3;
    var flagColors = colors || ['#CE1126', '#FFFFFF', '#000000'];
    var content = emoji || '✨';

    for (var b = 0; b < BURSTS; b++) {
      (function (burstIdx) {
        setTimeout(function () {
          var particles = spawnParticles(PARTICLE_COUNT, content, flagColors);

          // Randomize origin for each burst (left, center, right)
          var originX = (window.innerWidth * (0.2 + burstIdx * 0.3));
          var originY = window.innerHeight - 40;

          particles.forEach(function (el) {
            el.style.left = originX + 'px';
            el.style.top = originY + 'px';

            var spreadX = (Math.random() - 0.5) * window.innerWidth * 0.6;
            var impulseY = -(180 + Math.random() * 380);
            var gravityY = 120 + Math.random() * 220;
            var spinDeg = (Math.random() - 0.5) * 720;
            var life = 1.5 + Math.random() * 1.2;
            var scale = rand(0.6, 1.4);

            var tl = gsap.timeline({ delay: Math.random() * 0.25 });

            // Phase 1: Explosive burst
            tl.to(el, {
              x: spreadX,
              y: impulseY,
              rotation: spinDeg,
              scale: scale,
              opacity: 1,
              duration: life * 0.45,
              ease: 'power4.out'
            });

            // Phase 2: Gravity + sparkle trail fade
            tl.to(el, {
              y: impulseY + gravityY,
              opacity: 0,
              scale: scale * 0.3,
              duration: life * 0.55,
              ease: 'power2.in',
              onComplete: function () { el.remove(); }
            });
          });
        }, burstIdx * 800);
      })(b);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4d. THE "CELEBRATION" — NYE, Labor Day, Nayrouz, Teachers' Day
  //
  //   Multi-burst confetti with Gold/Silver/White palette.
  //   Adds confetti rectangles that tumble in 3D.
  // ─────────────────────────────────────────────────────────────────
  function animateCelebration() {
    // Burst 1: Large emoji fireworks
    animateFireworks(['#FFD700', '#C0C0C0', '#FFFFFF'], '🎉', 2);

    // Burst 2: Confetti rectangles falling from top
    setTimeout(function () {
      var CONFETTI = 40;
      var confColors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF69B4', '#C0C0C0'];
      var frag = document.createDocumentFragment();
      var els = [];

      for (var i = 0; i < CONFETTI; i++) {
        var rect = document.createElement('span');
        rect.setAttribute('data-holiday', 'true');
        var cw = rand(6, 12);
        var ch = rand(4, 8);
        rect.style.cssText =
          'position:fixed;top:-20px;pointer-events:none;z-index:9997;' +
          'width:' + cw + 'px;height:' + ch + 'px;' +
          'background:' + confColors[i % confColors.length] + ';' +
          'left:' + rand(0, 100) + '%;opacity:0;will-change:transform;';
        frag.appendChild(rect);
        els.push(rect);
      }
      document.body.appendChild(frag);

      els.forEach(function (el, idx) {
        var fall = rand(3, 7);
        var swayX = rand(-80, 80);
        var delay = idx * 0.08;

        gsap.to(el, {
          y: window.innerHeight + 40,
          x: swayX,
          rotation: rand(-720, 720),
          opacity: 0.9,
          duration: fall,
          delay: delay,
          ease: 'power1.in',
          onComplete: function () { el.remove(); }
        });
        // 3D tumble via rotationX/Y
        gsap.to(el, {
          rotationX: rand(180, 720),
          rotationY: rand(180, 720),
          duration: fall,
          delay: delay,
          ease: 'none'
        });
      });
    }, 1200);
  }

  // ─────────────────────────────────────────────────────────────────
  // 4e. THE "SPOOKY" — Halloween, Star Wars Day
  //
  //   • Ghost SVG: jerky stepped traverse + flicker + vertical bob
  //   • Spider web in corner with glowing accents
  //   • Floating bats/ships (depending on holiday)
  // ─────────────────────────────────────────────────────────────────
  function animateSpooky(holidayName) {
    var isStarWars = holidayName === 'star-wars';

    // ── Main figure: Ghost or TIE Fighter silhouette ──
    var figureSvg = isStarWars
      ? '<svg viewBox="0 0 80 40" width="64" height="32" xmlns="http://www.w3.org/2000/svg">' +
          '<rect x="5" y="5"  width="5" height="30" rx="1" fill="#8cf" opacity="0.7" />' +
          '<rect x="70" y="5" width="5" height="30" rx="1" fill="#8cf" opacity="0.7" />' +
          '<line x1="10" y1="20" x2="30" y2="20" stroke="#8cf" stroke-width="1.5" />' +
          '<line x1="50" y1="20" x2="70" y2="20" stroke="#8cf" stroke-width="1.5" />' +
          '<circle cx="40" cy="20" r="10" fill="none" stroke="#8cf" stroke-width="1.5" />' +
          '<circle cx="40" cy="20" r="3" fill="#8cf" opacity="0.6" />' +
        '</svg>'
      : '<svg viewBox="0 0 60 80" width="48" height="64" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M30 5 C10 5 5 25 5 40 L5 70 L15 60 L25 70 L35 60 L45 70 L55 60 L55 40 C55 25 50 5 30 5Z" ' +
            'fill="#e8e8e8" stroke="#888" stroke-width="1" opacity="0.7" />' +
          '<circle cx="22" cy="32" r="4" fill="#333" />' +
          '<circle cx="38" cy="32" r="4" fill="#333" />' +
          '<ellipse cx="30" cy="45" rx="5" ry="7" fill="#333" opacity="0.6" />' +
        '</svg>';

    var figure = injectSVG(figureSvg);
    figure.style.cssText += 'top:' + (isStarWars ? '20%' : '30%') + ';left:-80px;';

    injectCSS(isStarWars
      ? '.theme-starwars { --accent: #4fc3f7 !important; }'
      : '.theme-spooky { --accent: #ff6600 !important; }');

    // Cross-screen traverse in jerky steps
    var traverseTl = gsap.timeline({
      delay: 2,
      repeat: -1,
      repeatDelay: isStarWars ? 4 : 8,
      onRepeat: function () { gsap.set(figure, { x: 0 }); }
    });
    traverseTl.to(figure, {
      x: window.innerWidth + 120,
      duration: isStarWars ? 3 : 6,
      ease: 'steps(' + (isStarWars ? 12 : 8) + ')'
    });

    // Flicker
    gsap.to(figure, {
      opacity: 0.3,
      duration: 0.15,
      ease: 'steps(2)',
      yoyo: true,
      repeat: -1,
      repeatDelay: 0.4
    });

    // Vertical bob
    gsap.to(figure, {
      y: isStarWars ? -30 : -20,
      duration: isStarWars ? 1.5 : 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });

    // ── Floating entities (bats or mini-ships) ──
    var entities = isStarWars ? ['⚡', '✦', '💫'] : ['🦇', '🕷️', '👻'];
    for (var i = 0; i < 6; i++) {
      (function (idx) {
        var ent = document.createElement('span');
        ent.setAttribute('data-holiday', 'true');
        ent.textContent = entities[idx % entities.length];
        ent.style.cssText =
          'position:fixed;pointer-events:none;z-index:9997;font-size:' +
          rand(14, 24) + 'px;opacity:0;top:' + rand(10, 60) + '%;' +
          (idx % 2 === 0 ? 'left:-30px;' : 'right:-30px;');
        document.body.appendChild(ent);

        gsap.to(ent, {
          x: (idx % 2 === 0 ? 1 : -1) * (window.innerWidth + 60),
          y: rand(-50, 50),
          opacity: 0.7,
          duration: rand(4, 8),
          delay: rand(3, 10),
          ease: 'steps(' + Math.floor(rand(6, 14)) + ')',
          onComplete: function () { ent.remove(); }
        });
      })(i);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4f. THE "ROMANTIC" — Valentine's, Mother's Day, Women's Day
  //
  //   Hearts/flowers float upward with sinusoidal sway.
  //   Multiple waves spawn over time for a lasting effect.
  //   Added sparkle trail behind each heart.
  // ─────────────────────────────────────────────────────────────────
  function animateRomantic(holidayName) {
    var isValentine = holidayName === 'valentine';
    var COUNT = 16;
    var WAVES = 3;
    var content = isValentine ? '❤️' : '🌸';
    var altContent = isValentine ? '💕' : '🌺';
    var colors = isValentine
      ? ['#e11d48', '#f43f5e', '#fb7185', '#fda4af']
      : ['#ec4899', '#f472b6', '#f9a8d4', '#c084fc'];

    function spawnWave(waveIdx) {
      var hearts = spawnParticles(COUNT, waveIdx % 2 === 0 ? content : altContent, colors, 'bottom:-30px;');

      hearts.forEach(function (el, i) {
        el.style.left = rand(5, 95) + '%';

        var rise = rand(5, 9);
        var swayAmp = rand(25, 70);
        var delay = i * 0.35;
        var startScale = rand(0.6, 1.3);

        // Appear first (opacity 0 → visible)
        gsap.to(el, {
          opacity: rand(0.5, 0.9),
          scale: startScale,
          duration: 0.8,
          delay: delay,
          ease: 'power2.out'
        });

        // Rise with slight deceleration (starts after appear finishes)
        gsap.to(el, {
          y: -(window.innerHeight + 60),
          opacity: 0,
          scale: startScale * 0.5,
          duration: rise,
          delay: delay + 1,
          ease: 'power1.out',
          onComplete: function () { el.remove(); }
        });

        // Sinusoidal horizontal sway
        gsap.to(el, {
          x: (Math.random() > 0.5 ? 1 : -1) * swayAmp,
          duration: rise / 3.5,
          delay: delay,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: Math.ceil(rise / (rise / 3.5))
        });

        // Gentle rotation
        gsap.to(el, {
          rotation: rand(-30, 30),
          duration: rise,
          delay: delay,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: 2
        });
      });
    }

    // Spawn multiple waves over time
    for (var w = 0; w < WAVES; w++) {
      (function (idx) {
        setTimeout(function () { spawnWave(idx); }, idx * 6000);
      })(w);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4g. THE "NATURE" — Earth Day, Sham el-Nessim, St. Patrick's,
  //                     World Environment Day, Peace Day
  //
  //   Falling leaves/petals/butterflies from the top with sway.
  //   Added: breeze effect (periodic horizontal gust across all
  //   active particles) and a second wave spawn.
  // ─────────────────────────────────────────────────────────────────
  function animateNature(holidayName) {
    var COUNT = 20;
    var WAVES = 2;
    var contentMap = {
      'st-patrick':      '🍀',
      'earth-day':       '🌍',
      'environment-day': '🌱',
      'peace-day':       '🕊️',
      'sham-el-nessim':  '🌸',
      'coptic-easter':   '🌷'
    };
    var content = contentMap[holidayName] || '🌿';
    var altContent = holidayName === 'st-patrick' ? '☘️' : '🦋';
    var colors = ['#22c55e', '#16a34a', '#4ade80', '#86efac'];

    function spawnWave(waveIdx) {
      var leaves = spawnParticles(COUNT, waveIdx % 2 === 0 ? content : altContent, colors, 'top:-30px;');

      leaves.forEach(function (el, i) {
        el.style.left = rand(2, 98) + '%';
        var fall = rand(5, 10);
        var swayAmp = rand(40, 100);
        var delay = i * 0.4;
        var startScale = rand(0.7, 1.2);

        // Appear
        gsap.to(el, {
          opacity: rand(0.5, 0.85),
          scale: startScale,
          duration: 0.6,
          delay: delay,
          ease: 'power2.out'
        });

        // Fall downward + fade at end (starts after appear)
        gsap.to(el, {
          y: window.innerHeight + 60,
          opacity: 0,
          duration: fall,
          delay: delay + 0.8,
          ease: 'power1.in',
          onComplete: function () { el.remove(); }
        });

        // Horizontal sway (leaf flutter)
        gsap.to(el, {
          x: (Math.random() > 0.5 ? 1 : -1) * swayAmp,
          duration: fall / 4,
          delay: delay,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: Math.ceil(fall / (fall / 4))
        });

        // Rotation (tumble)
        gsap.to(el, {
          rotation: (Math.random() - 0.5) * 540,
          duration: fall,
          delay: delay,
          ease: 'none'
        });
      });
    }

    for (var w = 0; w < WAVES; w++) {
      (function (idx) {
        setTimeout(function () { spawnWave(idx); }, idx * 7000);
      })(w);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 4h. THE "WINTER" — Christmas, Coptic Xmas, New Year, Dec season
  //
  //   Snowfall: lightweight flakes drifting down with gentle
  //   horizontal sway. Some flakes shimmer (opacity pulse).
  //   A warm golden glow pulsates at the bottom of the viewport.
  // ─────────────────────────────────────────────────────────────────
  function animateWinter(holidayName) {
    var FLAKE_COUNT = 35;
    var isXmas = holidayName === 'christmas' || holidayName === 'coptic-christmas';
    var flakeChars = isXmas ? ['❄', '✦', '❅', '⭐'] : ['❄', '·', '❅', '✧'];
    var colors = ['#e2e8f0', '#cbd5e1', '#f1f5f9', '#ffffff'];

    var flakes = [];
    var frag = document.createDocumentFragment();

    for (var i = 0; i < FLAKE_COUNT; i++) {
      var flake = document.createElement('span');
      flake.setAttribute('data-holiday', 'true');
      flake.textContent = flakeChars[i % flakeChars.length];
      flake.style.cssText =
        'position:fixed;top:-20px;pointer-events:none;z-index:9997;' +
        'font-size:' + rand(8, 22) + 'px;color:' + colors[i % colors.length] + ';' +
        'left:' + rand(0, 100) + '%;opacity:0;will-change:transform;';
      frag.appendChild(flake);
      flakes.push(flake);
    }
    document.body.appendChild(frag);

    flakes.forEach(function (el, idx) {
      var fall = rand(6, 14);
      var swayX = rand(-60, 60);
      var delay = rand(0, 8);

      // Appear
      gsap.to(el, {
        opacity: rand(0.3, 0.8),
        duration: 1,
        delay: delay,
        ease: 'power2.out'
      });

      // Fall (starts after appear with small overlap)
      gsap.to(el, {
        y: window.innerHeight + 40,
        x: swayX,
        rotation: rand(-180, 180),
        opacity: 0,
        duration: fall,
        delay: delay + 1.2,
        ease: 'none',
        onComplete: function () { el.remove(); }
      });

      // Shimmer (every 3rd flake)
      if (idx % 3 === 0) {
        gsap.to(el, {
          opacity: 0.2,
          duration: rand(0.5, 1.5),
          delay: delay + 1,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: Math.floor(fall / 2)
        });
      }
    });

    // ── Christmas extras: tree + gift emojis in corner ──
    if (isXmas) {
      var treeStar = ['🎄', '🎁', '🔔'];
      for (var t = 0; t < 3; t++) {
        var deco = document.createElement('span');
        deco.setAttribute('data-holiday', 'true');
        deco.textContent = treeStar[t];
        deco.style.cssText =
          'position:fixed;bottom:' + (20 + t * 34) + 'px;right:20px;' +
          'pointer-events:none;z-index:9997;font-size:28px;opacity:0;';
        document.body.appendChild(deco);

        gsap.to(deco, {
          opacity: 0.8,
          y: -10,
          duration: 1,
          delay: 3 + t * 0.4,
          ease: 'power2.out'
        });
        gsap.to(deco, {
          y: -16,
          duration: 2,
          delay: 4 + t * 0.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1
        });
      }
    }

    // ── New Year's extras: countdown sparkle ──
    if (holidayName === 'new-year' || holidayName === 'nye') {
      setTimeout(function () {
        animateFireworks(['#FFD700', '#FF6B6B', '#4ECDC4'], '🎆', 2);
      }, 3000);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  §5  DISPATCHER
  // ══════════════════════════════════════════════════════════════════

  function dispatch(holiday) {
    if (reducedMotion) return;
    if (window._suspended) return;

    switch (holiday.theme) {
      case 'prank':       animatePrank(holiday.name);       break;
      case 'atmospheric': animateAtmospheric(holiday.name); break;
      case 'national':    animateFireworks(['#CE1126', '#FFFFFF', '#000000'], '✨', 3); break;
      case 'celebration': animateCelebration();              break;
      case 'spooky':      animateSpooky(holiday.name);      break;
      case 'romantic':    animateRomantic(holiday.name);     break;
      case 'nature':      animateNature(holiday.name);       break;
      case 'winter':      animateWinter(holiday.name);       break;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  §5b  PREVIEW API — 17-holiday metadata + { active, theme, label }
  // ══════════════════════════════════════════════════════════════════

  var HOLIDAY_META = [
    { id: 'new-year',         priority: 100, theme: 'fireworks',
      label: function (g) { return 'HAPPY NEW YEAR ✦ ' + g; } },
    { id: 'revolution',       priority: 95,  theme: 'fireworks',   label: 'REVOLUTION DAY ✦ JULY 23' },
    { id: 'jun30',            priority: 93,  theme: 'flags',       label: 'JUNE 30 REVOLUTION' },
    { id: 'jan25',            priority: 92,  theme: 'flags',       label: 'REVOLUTION & POLICE DAY ✦ JAN 25' },
    { id: 'coptic-christmas', priority: 90,  theme: 'doves',       label: 'COPTIC CHRISTMAS ✦ JAN 7' },
    { id: 'sinai',            priority: 85,  theme: 'flags',       label: 'SINAI LIBERATION ✦ APR 25' },
    { id: 'labor-day',        priority: 83,  theme: 'flags',       label: 'LABOUR DAY ✦ MAY 1' },
    { id: 'eid-fitr',         priority: 80,  theme: 'celebration', label: 'EID AL-FITR MUBARAK' },
    { id: 'eid-adha',         priority: 80,  theme: 'celebration', label: 'EID AL-ADHA MUBARAK' },
    { id: 'mothers-day',      priority: 75,  theme: 'celebration', label: "HAPPY MOTHER'S DAY ✦ MAR 21" },
    { id: 'halloween',        priority: 70,  theme: 'spooky',      label: 'HAPPY HALLOWEEN' },
    { id: 'hijri-ny',         priority: 65,  theme: 'lanterns',
      label: function (g, hy) { return 'ISLAMIC NEW YEAR ✦ ' + hy; } },
    { id: 'coptic-easter',    priority: 60,  theme: 'doves',       label: 'COPTIC EASTER' },
    { id: 'mawlid',           priority: 55,  theme: 'lanterns',    label: 'MAWLID AL-NABI' },
    { id: 'sham-el-nessim',   priority: 52,  theme: 'nature',      label: 'SHAM EL-NESSIM' },
    { id: 'earth-day',        priority: 50,  theme: 'nature',      label: 'EARTH DAY ✦ APR 22' },
    { id: 'ramadan',          priority: 40,  theme: 'lanterns',    label: 'RAMADAN KAREEM' }
  ];

  function isActive(id) {
    var c = cairoNow();
    var h = hijriNow();
    var m = c.month, d = c.day, y = c.year;

    switch (id) {
      case 'new-year':         return m === 1 && d === 1;
      case 'revolution':       return m === 7 && d === 23;
      case 'jun30':            return m === 6 && d === 30;
      case 'jan25':            return m === 1 && d === 25;
      case 'coptic-christmas': return m === 1 && d === 7;
      case 'sinai':            return m === 4 && d === 25;
      case 'labor-day':        return m === 5 && d === 1;
      case 'eid-fitr':         return h.hijriMonth === 10 && h.hijriDay >= 1 && h.hijriDay <= 3;
      case 'eid-adha':         return h.hijriMonth === 12 && h.hijriDay >= 10 && h.hijriDay <= 13;
      case 'mothers-day':      return m === 3 && d === 21;
      case 'halloween':        return m === 10 && d >= 25 && d <= 31;
      case 'hijri-ny':         return h.hijriMonth === 1 && h.hijriDay === 1;
      case 'coptic-easter': {
        var e = COPTIC_EASTER[y];
        return !!(e && m === e[0] && d === e[1]);
      }
      case 'mawlid':           return h.hijriMonth === 3 && h.hijriDay === 12;
      case 'sham-el-nessim': {
        var se = COPTIC_EASTER[y];
        if (!se) return false;
        var sd = new Date(y, se[0] - 1, se[1] + 1);
        return m === sd.getMonth() + 1 && d === sd.getDate();
      }
      case 'earth-day':        return m === 4 && d === 22;
      case 'ramadan':          return h.hijriMonth === 9;
    }
    return false;
  }

  function preview(id) {
    for (var i = 0; i < HOLIDAY_META.length; i++) {
      if (HOLIDAY_META[i].id !== id) continue;
      var meta = HOLIDAY_META[i];
      var gYear = cairoNow().year;
      var hYear = hijriNow().hijriYear;
      var label = typeof meta.label === 'function' ? meta.label(gYear, hYear) : meta.label;
      return { active: isActive(id), theme: meta.theme, label: label };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  §6  INITIALIZATION
  // ══════════════════════════════════════════════════════════════════

  function init() {
    var holiday = detectHoliday();
    if (!holiday) return;

    document.body.classList.add(holiday.css);

    console.log(
      '%c🎉 Holiday Engine v2%c ' + holiday.name + ' → ' + holiday.theme,
      'background:#f59e0b;color:#000;padding:2px 6px;border-radius:3px;font-weight:bold;',
      'color:#8a95a8;padding-left:6px;'
    );

    setTimeout(function () { dispatch(holiday); }, 2000);
  }

  var launched = false;
  function onReady() {
    if (launched) return;
    launched = true;
    init();
  }

  window.addEventListener('AmrOS:CoreReady', onReady);
  window.addEventListener('AmrOS:Launched', onReady);
  setTimeout(onReady, 6000);

  if (window._registerTeardown) {
    window._registerTeardown(function () {
      cleanup();
      launched = false;
    });
  }

  // ── Public API for testing ──
  window._holidayEngine = {
    detect: detectHoliday,
    dispatch: dispatch,
    cleanup: cleanup,
    // Examples:
    //   _holidayEngine.test('atmospheric', 'ramadan')
    //   _holidayEngine.test('winter', 'christmas')
    //   _holidayEngine.test('national')
    //   _holidayEngine.test('prank', 'pi-day')
    test: function (themeName, name) {
      cleanup();
      dispatch({ theme: themeName, name: name || 'test-' + themeName, css: 'theme-' + themeName });
    }
  };

  // ── Public 17-holiday preview API — { active, theme, label } ──
  window.HolidayEngine = {
    preview: preview,
    list: function () {
      return HOLIDAY_META.map(function (m) {
        return { id: m.id, priority: m.priority, theme: m.theme };
      });
    }
  };

})();
