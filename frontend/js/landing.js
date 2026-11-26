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
