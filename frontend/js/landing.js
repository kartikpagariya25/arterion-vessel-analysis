/* Landing motion, part 1: Motion (the Framer Motion engine, vanilla build) for entrances, springs and count-ups. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var M = window.Motion;
  var $ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.LP = window.LP || { reduce: reduce, $: $ };
  if (reduce || !M) return;
  var animate = M.animate, stagger = M.stagger;

  // hero entrance: badge, headline lines, lead, CTAs and check-badges settle in on a spring
  var seq = [".lp-badge", ".lp-hero h1 .ln", ".lp-lead", ".lp-cta .lp-btn", ".lp-checks li"];
  seq.forEach(function (sel, i) {
    var els = $(sel); if (!els.length) return;
    els.forEach(function (e) { e.style.opacity = 0; });
    animate(els, { opacity: [0, 1], transform: ["translateY(26px)", "translateY(0px)"] },
      { delay: stagger(0.09, { startDelay: 0.15 + i * 0.16 }), type: "spring", stiffness: 140, damping: 20 });
  });
  animate(".lp-nav", { transform: ["translateY(-18px)", "translateY(0px)"] }, { duration: 0.7, ease: [0.16, 1, 0.3, 1] });

  // springy hover and press on every button
  $(".lp-btn").forEach(function (b) {
    var s = { type: "spring", stiffness: 420, damping: 22 };
    b.addEventListener("pointerenter", function () { animate(b, { scale: 1.035, y: -2 }, s); });
    b.addEventListener("pointerleave", function () { animate(b, { scale: 1, y: 0 }, s); });
    b.addEventListener("pointerdown", function () { animate(b, { scale: 0.97 }, s); });
    b.addEventListener("pointerup", function () { animate(b, { scale: 1.035 }, s); });
  });

  // count-ups for any element with data-count (animated once, when it scrolls into view)
  var seen = new WeakSet();
  function countUp(el) {
    if (seen.has(el)) return; seen.add(el);
    var to = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || "0", 10);
    animate(0, to, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: function (v) { el.textContent = v.toFixed(dec); } });
  }
  window.LP.countUp = countUp;
})();

/* Landing motion, part 2a: GSAP + ScrollTrigger for nav state, read progress and the hero. */
(function () {
  "use strict";
  var LP = window.LP || {}, $ = LP.$ || function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var nav = document.querySelector(".lp-nav");
  function navState() { if (nav) nav.classList.toggle("scrolled", window.scrollY > 24); }
  navState(); window.addEventListener("scroll", navState, { passive: true });
  if (LP.reduce || !window.gsap || !window.ScrollTrigger) return;
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  gsap.config({ nullTargetWarn: false });

  // read-progress bar across the top
  gsap.to(".lp-progress", { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.3 } });

  // hero: the motif line draws itself, then drifts and fades as you leave the hero
  var paths = $(".lp-motif path");
  paths.forEach(function (p) {
    var len = p.getTotalLength ? p.getTotalLength() : 0;
    if (!len) return;
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(p, { strokeDashoffset: 0, duration: 2.6, delay: 0.6, ease: "power2.out" });
  });
  gsap.to(".lp-motif", { yPercent: 28, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".lp-hero-in", { yPercent: -8, opacity: 0.35, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "35% top", end: "bottom top", scrub: true } });

})();

/* Landing motion, part 2b: ScrollTrigger reveals for headings, cards, steps, metric bars and the call to action. */
(function () {
  "use strict";
  var LP = window.LP || {}, $ = LP.$ || function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  if (LP.reduce || !window.gsap || !window.ScrollTrigger) {
    // static fallback: bars at full value, counters at their final number
    $(".lp-bar .f").forEach(function (f) { f.style.transform = "none"; });
    $("[data-count]").forEach(function (e) { e.textContent = (+e.dataset.count).toFixed(+(e.dataset.dec || 0)); });
    $(".lp-rail i").forEach(function (r) { r.style.transform = "none"; });
    return;
  }
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  gsap.config({ nullTargetWarn: false });

  // section headings rise as they enter
  $(".lp-head, .lp-ev > div:first-child").forEach(function (el) {
    gsap.from(el.children, { y: 34, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 82%", once: true } });
  });

  // feature cards: batched, staggered
  ST.batch(".lp-card", { start: "top 88%", once: true, onEnter: function (els) { gsap.from(els, { y: 46, opacity: 0, scale: 0.97, duration: 0.85, ease: "power3.out", stagger: 0.1, overwrite: true }); } });

  // steps: the rail fills with scroll and each numbered tile lights up as the rail reaches it
  var steps = $(".lp-step");
  if (steps.length) {
    gsap.to(".lp-rail i", { scaleX: 1, ease: "none", scrollTrigger: { trigger: ".lp-steps", start: "top 72%", end: "bottom 62%", scrub: 0.6 } });
    steps.forEach(function (s, i) {
      gsap.from(s, { y: 40, opacity: 0, duration: 0.8, ease: "power3.out", delay: i * 0.08, scrollTrigger: { trigger: s, start: "top 88%", once: true } });
      gsap.fromTo(s.querySelector(".lp-num"), { scale: 0.86 }, { scale: 1, ease: "back.out(2)", duration: 0.7, scrollTrigger: { trigger: s, start: "top 80%", toggleActions: "play none none reverse" } });
    });
  }

  // evidence: the panel slides in, bars grow with a stagger, numbers count up
  var panel = document.querySelector(".lp-panel");
  if (panel) {
    gsap.from(panel, { y: 60, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: panel, start: "top 85%", once: true } });
    gsap.set(".lp-bar .f", { scaleX: 0 });
    ST.create({ trigger: panel, start: "top 72%", once: true, onEnter: function () {
      gsap.to(".lp-bar .f", { scaleX: 1, duration: 1.4, ease: "power3.out", stagger: 0.12 });
      $(".lp-bar .n[data-count]").forEach(function (n) { if (LP.countUp) LP.countUp(n); });
    } });
  }
  // generic counters outside the panel
  $("[data-count]:not(.lp-bar .n)").forEach(function (el) { ST.create({ trigger: el, start: "top 90%", once: true, onEnter: function () { if (LP.countUp) LP.countUp(el); } }); });

  // call-to-action and tool frame
  gsap.from(".lp-cta-band .lp-wrap > *", { y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ".lp-cta-band", start: "top 80%", once: true } });
  gsap.from(".lp-tool", { y: 50, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".lp-tool", start: "top 90%", once: true } });

  // active pill follows the section in view
  var links = $(".lp-pills a");
  links.forEach(function (a) {
    var id = (a.getAttribute("href") || "").replace("#", ""), sec = id && document.getElementById(id);
    if (!sec) return;
    ST.create({ trigger: sec, start: "top 45%", end: "bottom 45%", onToggle: function (self) { if (self.isActive) { links.forEach(function (x) { x.classList.toggle("on", x === a); }); } } });
  });
  window.addEventListener("load", function () { ST.refresh(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
})();

/* Landing UI: mobile menu, hero line splitting, "try a sample" hand-off to the tool. */
(function () {
  "use strict";
  var $ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var burger = document.querySelector(".lp-burger"), menu = document.querySelector(".lp-menu");
  if (burger && menu) {
    var close = function () { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); burger.innerHTML = '<i class="ph-bold ph-list" aria-hidden="true"></i>'; };
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
      burger.innerHTML = '<i class="ph-bold ' + (open ? "ph-x" : "ph-list") + '" aria-hidden="true"></i>';
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  // secondary hero CTA can hand a sample to the tool: data-trigger="<selector of the sample button>"
  $("[data-trigger]").forEach(function (a) {
    a.addEventListener("click", function () {
      var sel = a.getAttribute("data-trigger");
      setTimeout(function () { var b = document.querySelector(sel); if (b) b.click(); }, 700);
    });
  });
})();
