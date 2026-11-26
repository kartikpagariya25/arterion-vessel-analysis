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
