/* Shared motion engine. Principles borrowed from film and animation practice:
   one clock drives everything, motion has anticipation / overshoot / settle, layers sit at different depths,
   reveals pull focus. Every graphic is a pure function of time. Collapses to static under reduced motion. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var APP = window.ARTERION_APP || {};
  var root = document.documentElement;
  var TAU = Math.PI * 2;
  var BRANCH = [
    [[0.9, -0.05], [0.84, 0.18], [0.7, 0.3], [0.6, 0.62]],
    [[0.9, -0.05], [0.9, 0.22], [0.86, 0.4], [0.76, 0.72]],
    [[0.9, -0.05], [0.8, 0.12], [0.56, 0.2], [0.42, 0.5]],
    [[0.84, 0.18], [0.78, 0.3], [0.8, 0.46], [0.92, 0.6]],
  ];

  /* ---------- depth-layered aurora ---------- */
  if (!document.querySelector(".aurora")) {
    var a = document.createElement("div");
    a.className = "aurora";
    a.setAttribute("aria-hidden", "true");
    a.innerHTML = "<i></i><i></i><i></i>";
    document.body.insertBefore(a, document.body.firstChild);
  }
  if (reduce) { drawStatic(); return; }
  root.classList.add("fx");

  /* ---------- choreographed headline: words land with anticipation, overshoot and settle ---------- */
  var h1 = document.querySelector(".intro h1, .hero h1, .masthead h1");
  if (h1 && !h1.dataset.split) {
    h1.dataset.split = "1";
    var k = 0, frag = document.createDocumentFragment();
    h1.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span");
          w.className = "w"; w.style.setProperty("--k", k++); w.textContent = part; frag.appendChild(w);
        });
      } else {
        var w2 = document.createElement("span");
        w2.className = "w"; w2.style.setProperty("--k", k++); w2.appendChild(n.cloneNode(true)); frag.appendChild(w2);
      }
    });
    h1.textContent = "";
    h1.appendChild(frag);
    h1.classList.remove("rise");
    h1.style.animation = "none";
    h1.style.opacity = "1";
    h1.classList.add("split");
  }

  /* ---------- focus-pull reveals ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll("[data-reveal]").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- pointer: card spotlight + parallax depth (one rAF, transforms only) ---------- */
  var raf = 0, ev = null, px = 0, py = 0, tx = 0, ty = 0, parallaxOn = false;
  document.addEventListener("pointermove", function (e) {
    ev = e;
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
    parallaxOn = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  function tick() {
    raf = 0;
    if (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest(".spot") : null;
      if (t) {
        var r = t.getBoundingClientRect();
        t.style.setProperty("--mx", (ev.clientX - r.left) + "px");
        t.style.setProperty("--my", (ev.clientY - r.top) + "px");
      }
    }
    // ease the camera toward the pointer: slow follow-through, never a snap
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    root.style.setProperty("--px", px.toFixed(3));
    root.style.setProperty("--py", py.toFixed(3));
    if (Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002) raf = requestAnimationFrame(tick);
  }

  /* ---------- time-driven graphic behind the hero ---------- */
  var cfg = APP.graphic, cv = null, ctx = null, visible = true, W = 0, H = 0, start = performance.now();
  var hero = document.querySelector(".hero, .intro, .masthead");
  if (cfg && hero) {
    cv = document.createElement("canvas");
    cv.className = "fx-graphic";
    cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.querySelector(".aurora").nextSibling);
    ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) requestAnimationFrame(loop); }).observe(cv);
    }
    requestAnimationFrame(loop);
  }
  function resize() {
    if (!cv) return;
    var d = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = Math.min(660, Math.round(window.innerHeight * 0.85));
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    cv.style.height = H + "px";
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  // 30 fps cap; if frames keep arriving slowly (weak or CPU-only graphics), freeze on a good frame instead of dragging the page down
  var last = 0, slow = 0, frozen = false;
  function loop(now) {
    if (!cv || !visible || document.hidden || frozen) return;
    requestAnimationFrame(loop);
    if (now - last < 33) return;
    if (last && now - last > 90) { if (++slow > 12) { frozen = true; paint(2.4); return; } } else slow = Math.max(0, slow - 1);
    last = now;
    paint((now - start) / 1000);
  }
  function drawStatic() {
    var h = document.querySelector(".hero, .intro, .masthead");
    if (!APP.graphic || !h) return;
    cfg = APP.graphic;
    cv = document.createElement("canvas");
    cv.className = "fx-graphic";
    cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.querySelector(".aurora").nextSibling);
    ctx = cv.getContext("2d");
    var d = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = Math.min(660, Math.round(window.innerHeight * 0.85));
    cv.width = Math.round(W * d); cv.height = Math.round(H * d); cv.style.height = H + "px";
    ctx.setTransform(d, 0, 0, d, 0, 0);
    paint(2.4);
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function paint(t) {
    ctx.clearRect(0, 0, W, H);
    var c = cfg.colors || ["#888"];
    if (cfg.type === "ecg") ecg(t, c[0]);
    else if (cfg.type === "rings") rings(t, c);
    else if (cfg.type === "contour") contour(t, c);
    else flow(t, c);
    var fade = ctx.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(0.55, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "source-over";
  }
  function g(x, m, s) { var d = (x - m) / s; return Math.exp(-d * d); }

  // ECG: a PQRST waveform, bright at a sweeping head and fading behind it
  function ecg(t, col) {
    var base = H * 0.42, amp = H * 0.2, span = 3.4, head = ((t * 0.16) % 1.25) * W;
    [0, 1].forEach(function (row) {
      var y0 = base + row * H * 0.3, a0 = row ? 0.5 : 1;
      ctx.lineWidth = row ? 1.4 : 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      for (var x = 0; x < W; x += 3) {
        var u = ((x / W) * span - t * 0.9 * (row ? 0.8 : 1)) % 1; if (u < 0) u += 1;
        var v = 0.12 * g(u, 0.2, 0.04) - 0.1 * g(u, 0.385, 0.012) + 1 * g(u, 0.42, 0.014) - 0.26 * g(u, 0.46, 0.014) + 0.3 * g(u, 0.72, 0.06);
        var u2 = (((x + 3) / W) * span - t * 0.9 * (row ? 0.8 : 1)) % 1; if (u2 < 0) u2 += 1;
        var v2 = 0.12 * g(u2, 0.2, 0.04) - 0.1 * g(u2, 0.385, 0.012) + 1 * g(u2, 0.42, 0.014) - 0.26 * g(u2, 0.46, 0.014) + 0.3 * g(u2, 0.72, 0.06);
        var dist = head - x, fade = dist >= 0 ? Math.max(0, 1 - dist / (W * 0.5)) : 0;
        var lf = Math.min(1, Math.max(0, (x / W - 0.3) / 0.35));   // keep the headline side clear
        var al = (0.06 + 0.5 * fade) * a0 * lf;
        ctx.strokeStyle = rgba(col, al);
        ctx.beginPath(); ctx.moveTo(x, y0 - v * amp); ctx.lineTo(x + 3, y0 - v2 * amp); ctx.stroke();
      }
    });
  }

  // Rings: ejection pulses expanding from a focal point with eased decay
  function rings(t, c) {
    var cx = W * 0.8, cy = H * 0.34, n = 6, period = 4.2;
    for (var i = 0; i < n; i++) {
      var p = ((t / period) + i / n) % 1, e = 1 - Math.pow(1 - p, 3);
      var r = 40 + e * Math.min(W, 900) * 0.5;
      ctx.lineWidth = 2.2 - p * 1.4;
      ctx.strokeStyle = rgba(c[i % 2 ? 1 : 0], 0.32 * (1 - p));
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    var beat = 1 + 0.12 * Math.pow(Math.max(0, Math.sin(t * TAU / period * 1)), 6);
    ctx.fillStyle = rgba(c[0], 0.16); ctx.beginPath(); ctx.arc(cx, cy, 34 * beat, 0, TAU); ctx.fill();
  }

  // Contour: a ventricle outline contracting fast and relaxing slowly, with ghost echoes
  function contour(t, c) {
    var cx = W * 0.78, cy = H * 0.4, base = Math.min(W, 1000) * 0.13;
    function sys(x) { var p = (x % 1.15) / 1.15; return p < 0.32 ? 1 - 0.14 * Math.sin((p / 0.32) * Math.PI / 2) : 0.86 + 0.14 * (1 - Math.cos(((p - 0.32) / 0.68) * Math.PI)) / 2; }
    for (var k = 5; k >= 0; k--) {
      var tt = t - k * 0.09, s = sys(tt);
      ctx.beginPath();
      for (var a = 0; a <= 64; a++) {
        var th = (a / 64) * TAU, rr = base * s * (1 + 0.1 * Math.sin(2 * th + 0.8) + 0.05 * Math.sin(3 * th)), x = cx + Math.cos(th) * rr * 0.62, y = cy + Math.sin(th) * rr * 1.1;
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      if (k === 0) { ctx.fillStyle = rgba(c[0], 0.14); ctx.fill(); }
      ctx.lineWidth = k === 0 ? 2.4 : 1.2;
      ctx.strokeStyle = rgba(c[k === 0 ? 0 : 1], k === 0 ? 0.7 : 0.2 - k * 0.025);
      ctx.stroke();
    }
  }

  // Flow: arterial branches with pulses travelling along them
  function bez(p, s) {
    var u = 1 - s;
    return [u * u * u * p[0][0] + 3 * u * u * s * p[1][0] + 3 * u * s * s * p[2][0] + s * s * s * p[3][0],
            u * u * u * p[0][1] + 3 * u * u * s * p[1][1] + 3 * u * s * s * p[2][1] + s * s * s * p[3][1]];
  }
  function flow(t, c) {
    BRANCH.forEach(function (b, i) {
      var col = c[i % c.length];
      ctx.lineWidth = i === 0 ? 4 : 3; ctx.lineCap = "round";
      ctx.strokeStyle = rgba(col, 0.14);
      ctx.beginPath();
      for (var s = 0; s <= 1.001; s += 0.02) { var q = bez(b, s); s === 0 ? ctx.moveTo(q[0] * W, q[1] * H) : ctx.lineTo(q[0] * W, q[1] * H); }
      ctx.stroke();
      for (var n = 0; n < 3; n++) {
        var ph = ((t * 0.16 + i * 0.23 + n / 3) % 1);
        for (var tr = 0; tr < 10; tr++) {
          var sp = ph - tr * 0.012; if (sp < 0) continue;
          var pos = bez(b, sp);
          ctx.fillStyle = rgba(col, 0.5 * (1 - tr / 10));
          ctx.beginPath(); ctx.arc(pos[0] * W, pos[1] * H, 4.2 - tr * 0.3, 0, TAU); ctx.fill();
        }
      }
    });
  }
})();
