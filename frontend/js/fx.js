/* Shared motion: aurora background, scroll reveals and pointer spotlight. Collapses to static under reduced motion. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!document.querySelector(".aurora")) {
    var a = document.createElement("div");
    a.className = "aurora";
    a.setAttribute("aria-hidden", "true");
    a.innerHTML = "<i></i><i></i><i></i>";
    document.body.insertBefore(a, document.body.firstChild);
  }
  if (reduce) return;

  document.documentElement.classList.add("fx");

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

  var raf = 0, ev = null;
  document.addEventListener("pointermove", function (e) {
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var t = ev.target && ev.target.closest ? ev.target.closest(".spot") : null;
      if (!t) return;
      var r = t.getBoundingClientRect();
      t.style.setProperty("--mx", (ev.clientX - r.left) + "px");
      t.style.setProperty("--my", (ev.clientY - r.top) + "px");
    });
  }, { passive: true });
})();
