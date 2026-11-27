/* History for patients; dashboard (awaiting review, all analyses, patients, own analyses) for doctors. */
(function () {
  "use strict";
  var A = window.ArterionAuth, APP = A.app, h = A.h;
  var root = document.getElementById("acc-root");
  var tabId = null;
  var patientFilter = null;

  function taskName(t) { return (APP.tasks && APP.tasks[t]) || t; }
  function when(iso) { try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return iso || ""; } }
  var ACRONYMS = { ef: "EF", lv: "LV", ecg: "ECG", bpm: "BPM", rca: "RCA", lca: "LCA", id: "ID", url: "URL" };
  function pretty(k) {
    var words = String(k).replace(/_/g, " ").split(" ").map(function (w) { return ACRONYMS[w.toLowerCase()] || w; });
    var s = words.join(" ");
    return s.charAt(0) === s.charAt(0).toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function msg(text, kind) { return h("p", { class: "acc-msg" + (kind ? " " + kind : ""), role: kind === "err" ? "alert" : null }, text); }

  function exportButton(path, filename, label) {
    var b = h("button", { type: "button", class: "acc-btn" }, label || "Export CSV");
    b.addEventListener("click", function () {
      b.disabled = true;
      A.download(path(), filename)
        .catch(function (e) { A.toast(e.message); })
        .then(function () { b.disabled = false; });
    });
    return b;
  }
  function query(p) {
    var s = Object.keys(p).filter(function (k) { return p[k] !== null && p[k] !== undefined && p[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
    return s ? "?" + s : "";
  }

  /* ---------- trend chart (inline SVG, follows the page theme) ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function svg(name, attrs, kids) {
    var el = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function num(v) { return String(Math.round(v * 10) / 10); }
  function day(iso) { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return ""; } }

  function chart(s) {
    var pts = s.points || [], unit = s.unit ? " " + s.unit : "";
    if (!pts.length) return h("div", { class: "acc-empty" }, "No saved results with this measurement yet.");
    var W = 640, H = 250, L = 48, R = 20, T = 20, B = 36;
    var vals = pts.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var lo = min, hi = max;
    if (lo === hi) { lo -= 1; hi += 1; } else { var pad = (hi - lo) * 0.2; lo -= pad; hi += pad; }
    if (min >= 0 && lo < 0) lo = 0;
    var x = function (i) { return pts.length === 1 ? (L + (W - L - R) / 2) : L + i * (W - L - R) / (pts.length - 1); };
    var y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };

    var g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": (s.label || "Value") + " across " + pts.length + " saved analyses, from " + num(vals[0]) + unit + " to " + num(vals[vals.length - 1]) + unit });
    for (var t = 0; t <= 3; t++) {
      var v = lo + (hi - lo) * t / 3, yy = y(v);
      g.appendChild(svg("line", { class: "grid", x1: L, x2: W - R, y1: yy, y2: yy }));
      g.appendChild(svg("text", { class: "tick", x: L - 8, y: yy + 4, "text-anchor": "end" }, [num(v)]));
    }
    if (pts.length > 1) {
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1); }).join(" ");
      g.appendChild(svg("path", { class: "area", d: d + " L" + x(pts.length - 1).toFixed(1) + " " + (H - B) + " L" + x(0).toFixed(1) + " " + (H - B) + " Z" }));
      g.appendChild(svg("path", { class: "line", d: d }));
    }
    pts.forEach(function (p, i) {
      g.appendChild(svg("circle", { class: "dot", cx: x(i), cy: y(p.value), r: 4.5 }, [svg("title", {}, [num(p.value) + unit + ", " + when(p.created_at)])]));
    });
    g.appendChild(svg("text", { class: "tick", x: x(0), y: H - 10, "text-anchor": pts.length === 1 ? "middle" : "start" }, [day(pts[0].created_at)]));
    if (pts.length > 1) g.appendChild(svg("text", { class: "tick", x: x(pts.length - 1), y: H - 10, "text-anchor": "end" }, [day(pts[pts.length - 1].created_at)]));

    var last = vals[vals.length - 1], change = last - vals[0];
    var stat = function (k, v) { return h("div", {}, h("span", {}, k), h("b", {}, v)); };
    var stats = h("div", { class: "acc-stats" },
      stat("Latest", num(last) + unit),
      stat("Lowest", num(min) + unit),
      stat("Highest", num(max) + unit),
      pts.length > 1 ? stat("Change since first", (change > 0 ? "+" : "") + num(change) + unit) : stat("Analyses", "1"));
    var out = h("div", { class: "acc-chart" }, stats, g);
    if (pts.length === 1) out.appendChild(h("p", { class: "acc-msg" }, "Run another analysis to see how this changes over time."));
    return out;
  }

  /* ---------- result rendering ---------- */
  function scalar(v) {
    if (v === null || v === undefined) return "-";
    if (typeof v === "number") return String(Math.round(v * 10000) / 10000);
    return String(v);
  }
  function kv(obj) {
    var dl = h("dl", { class: "acc-kv" });
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        dl.appendChild(h("dt", {}, pretty(k)));
        dl.appendChild(h("dd", {}, v.length + (v.length === 1 ? " item" : " items")));
        v.slice(0, 20).forEach(function (item, i) {
          var box = h("div", { class: "nested" }, h("b", {}, pretty(k) + " " + (i + 1)), kv(item));
          dl.appendChild(box);
        });
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        dl.appendChild(h("dt", {}, pretty(k)));
        dl.appendChild(h("dd", {}, ""));
        dl.appendChild(h("div", { class: "nested" }, kv(v)));
      } else {
        dl.appendChild(h("dt", {}, pretty(k)));
        dl.appendChild(h("dd", {}, Array.isArray(v) ? (v.length ? v.map(scalar).join(", ") : "-") : scalar(v)));
      }
    });
    return dl;
  }

  /* ---------- one analysis card ---------- */
  function card(item, o) {
    var li = h("li", { class: "acc-card" });
    var badge = h("span", { class: "acc-badge " + (item.reviewed ? "ok" : "wait") }, item.reviewed ? "Reviewed" : "Awaiting review");
    var top = h("div", { class: "top" }, h("span", { class: "task" }, taskName(item.task)), h("span", { class: "when" }, when(item.created_at)));
    var meta = h("div", { class: "meta" }, item.input_name + (o.doctor && item.patient ? ", " + item.patient.name + " (" + item.patient.email + ")" : ""));
    var sum = h("p", { class: "sum" }, item.summary || "No summary recorded.");
    var detail = h("div", { class: "acc-detail", hidden: true });
    var toggle = h("button", { type: "button", class: "acc-btn", "aria-expanded": "false" }, "Details");
    var actions = h("div", { class: "actions" }, toggle, badge);
    var loaded = false;

    function fill(d) {
      clear(detail);
      var head = typeof APP.headline === "function" ? safeHeadline(d.result) : "";
      if (head) detail.appendChild(h("p", {}, h("b", {}, head)));
      detail.appendChild(kv(d.result));
      var noteBox = h("div", { class: "acc-note", hidden: !d.doctor_note },
        h("b", {}, d.reviewed_by ? "Doctor's note, " + d.reviewed_by + ", " + when(d.reviewed_at) : "Doctor's note"),
        h("span", {}, d.doctor_note || ""));
      detail.appendChild(noteBox);
      if (o.doctor) detail.appendChild(reviewForm(item, d, noteBox, badge, o));
    }
    toggle.addEventListener("click", function () {
      var open = detail.hasAttribute("hidden");
      detail.toggleAttribute("hidden", !open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Hide details" : "Details";
      if (open && !loaded) {
        detail.appendChild(msg("Loading…"));
        A.api("GET", (o.doctor ? "/doctor/analyses/" : "/history/") + item.id)
          .then(function (d) { loaded = true; fill(d); })
          .catch(function (e) { clear(detail).appendChild(msg(e.message, "err")); });
      }
    });
    if (o.canDelete) {
      actions.appendChild(h("button", { type: "button", class: "acc-btn danger", onclick: function () {
        if (!window.confirm("Delete this saved analysis? This cannot be undone.")) return;
        A.api("DELETE", "/history/" + item.id).then(function () {
          var list = li.parentNode; li.remove();
          if (list && !list.children.length && o.onEmpty) o.onEmpty();
        }).catch(function (e) { A.toast(e.message); });
      } }, "Delete"));
    }
    li.appendChild(top); li.appendChild(meta); li.appendChild(sum); li.appendChild(actions); li.appendChild(detail);
    return li;
  }

  function safeHeadline(r) { try { return APP.headline(r) || ""; } catch (e) { return ""; } }

  function reviewForm(item, d, noteBox, badge, o) {
    var ta = h("textarea", { id: "note-" + item.id, maxlength: "2000", "aria-label": "Review note", placeholder: "Write a note for the patient…" });
    ta.value = d.doctor_note || "";
    var out = h("div", {});
    var save = h("button", { type: "button", class: "acc-primary" }, d.doctor_note ? "Update review" : "Save review");
    save.addEventListener("click", function () {
      clear(out);
      var note = ta.value.trim();
      if (!note) { out.appendChild(msg("Write a note first.", "err")); return; }
      save.disabled = true;
      A.api("POST", "/doctor/analyses/" + item.id + "/review", { note: note }).then(function (res) {
        badge.className = "acc-badge ok"; badge.textContent = "Reviewed";
        noteBox.hidden = false;
        noteBox.lastChild.textContent = res.doctor_note;
        noteBox.firstChild.textContent = "Doctor's note, " + res.reviewed_by + ", " + when(res.reviewed_at);
        save.textContent = "Update review";
        out.appendChild(msg("Saved. The patient can now see this note.", "ok"));
        if (o.onReviewed) o.onReviewed();
      }).catch(function (e) { out.appendChild(msg(e.message, "err")); }).then(function () { save.disabled = false; });
    });
    return h("div", { class: "acc-review" }, h("label", { for: "note-" + item.id }, h("b", {}, "Your review")), ta, save, out);
  }

  /* ---------- paged lists ---------- */
  function pagedList(host, path, params, o) {
    var ul = h("ul", { class: "acc-list" });
    var more = h("button", { type: "button", class: "acc-btn acc-more", hidden: true }, "Load more");
    var offset = 0, size = 20;
    function qs() {
      var p = Object.assign({ limit: size, offset: offset }, params);
      return "?" + Object.keys(p).filter(function (k) { return p[k] !== null && p[k] !== undefined && p[k] !== ""; })
        .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
    }
    function empty() { clear(host); host.appendChild(h("div", { class: "acc-empty" }, o.emptyText || "Nothing here yet.")); }
    function load() {
      more.disabled = true;
      A.api("GET", path + qs()).then(function (res) {
        if (offset === 0 && !res.items.length) { empty(); return; }
        res.items.forEach(function (it) { ul.appendChild(card(it, Object.assign({ onEmpty: empty }, o))); });
        offset += res.items.length;
        more.hidden = offset >= res.total;
        more.disabled = false;
        if (o.onTotal) o.onTotal(res.total);
      }).catch(function (e) { host.appendChild(msg(e.message, "err")); });
    }
    clear(host).appendChild(ul); host.appendChild(more);
    more.addEventListener("click", load);
    load();
  }

  /* ---------- tabs ---------- */
  function patientsTab(host, goto) {
    var search = h("input", { type: "search", placeholder: "Search patients by name or email", "aria-label": "Search patients" });
    var out = h("div", {});
    var timer;
    function load() {
      A.api("GET", "/doctor/patients" + (search.value.trim() ? "?q=" + encodeURIComponent(search.value.trim()) : "")).then(function (res) {
        clear(out);
        if (!res.items.length) { out.appendChild(h("div", { class: "acc-empty" }, "No patients found.")); return; }
        var ul = h("ul", { class: "acc-patients" });
        res.items.forEach(function (p) {
          ul.appendChild(h("li", {}, h("button", { type: "button", onclick: function () { patientFilter = p; goto("all"); } },
            h("span", { class: "n" }, p.name), h("span", { class: "e" }, p.email),
            h("span", { class: "c" }, p.analyses + (p.analyses === 1 ? " analysis" : " analyses") + (p.awaiting_review ? ", " + p.awaiting_review + " awaiting review" : "") + (p.last_activity ? ", last " + when(p.last_activity) : "")))));
        });
        out.appendChild(ul);
      }).catch(function (e) { clear(out).appendChild(msg(e.message, "err")); });
    }
    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 250); });
    host.appendChild(h("div", { class: "acc-tools" }, search));
    host.appendChild(out);
    load();
  }

  function allTab(host, awaitingOnly, refreshCount) {
    var tasks = Object.keys(APP.tasks || {});
    var taskSel = h("select", { "aria-label": "Filter by analysis type" }, h("option", { value: "" }, "All analysis types"));
    tasks.forEach(function (t) { taskSel.appendChild(h("option", { value: t }, taskName(t))); });
    var statusSel = h("select", { "aria-label": "Filter by review status" },
      h("option", { value: "" }, "Any status"), h("option", { value: "false" }, "Awaiting review"), h("option", { value: "true" }, "Reviewed"));
    if (awaitingOnly) { statusSel.value = "false"; statusSel.disabled = true; }
    var chip = h("button", { type: "button", class: "acc-btn", hidden: !patientFilter, onclick: function () { patientFilter = null; render(); } },
      patientFilter ? "Patient: " + patientFilter.name + " ✕" : "");
    var list = h("div", {});
    function reload() {
      pagedList(list, "/doctor/analyses", { patient_id: patientFilter && patientFilter.id, task: taskSel.value, reviewed: statusSel.value },
        { doctor: true, onReviewed: refreshCount, emptyText: awaitingOnly ? "Nothing is waiting for review." : "No analyses match." });
    }
    taskSel.addEventListener("change", reload); statusSel.addEventListener("change", reload);
    var trend = h("button", { type: "button", class: "acc-btn", hidden: !patientFilter, onclick: function () { goto("trends"); } }, "Trends");
    var exp = exportButton(function () {
      return "/doctor/analyses/export.csv" + query({ patient_id: patientFilter && patientFilter.id, task: taskSel.value, reviewed: statusSel.value });
    }, "arterion-analyses.csv");
    host.appendChild(h("div", { class: "acc-tools" }, taskSel, awaitingOnly ? null : statusSel, chip, trend, exp));
    host.appendChild(list);
    reload();
  }

  function trendsTab(host) {
    var doctor = A.user.role === "doctor";
    if (doctor && !patientFilter) {
      host.appendChild(h("div", { class: "acc-empty" }, "Choose a patient on the Patients tab to see how their results change over time."));
      return;
    }
    var base = doctor ? "/doctor/patients/" + patientFilter.id + "/series" : "/history/series";
    if (doctor) host.appendChild(h("p", { class: "acc-msg" }, "Showing results for " + patientFilter.name + "."));
    Object.keys(APP.tasks || {}).forEach(function (t) {
      var box = h("div", { class: "acc-section" }, h("h2", {}, taskName(t)), msg("Loading…"));
      host.appendChild(box);
      A.api("GET", base + "?task=" + encodeURIComponent(t)).then(function (s) {
        clear(box);
        box.appendChild(h("h2", {}, (s.label || taskName(t)) + " over time"));
        box.appendChild(chart(s));
      }).catch(function (e) { clear(box).appendChild(msg(e.message, "err")); });
    });
  }

  function accountTab(host) {
    var u = A.user;
    host.appendChild(h("div", { class: "acc-section" }, h("h2", {}, "Your account"),
      kv({ name: u.name, email: u.email, account_type: u.role === "doctor" ? "Doctor" : "Patient", member_since: when(u.created_at) })));

    var out1 = h("div", {});
    var old = h("input", { type: "password", id: "pw-old", autocomplete: "current-password", required: true });
    var nw = h("input", { type: "password", id: "pw-new", autocomplete: "new-password", minlength: "8", required: true });
    var f1 = h("form", { novalidate: true },
      h("label", { class: "acc-field", for: "pw-old" }, h("span", {}, "Current password"), old),
      h("label", { class: "acc-field", for: "pw-new" }, h("span", {}, "New password (8+ characters)"), nw),
      h("button", { type: "submit", class: "acc-primary" }, "Change password"), out1);
    f1.addEventListener("submit", function (ev) {
      ev.preventDefault(); clear(out1);
      A.api("POST", "/auth/password", { old_password: old.value, new_password: nw.value })
        .then(function () { old.value = ""; nw.value = ""; out1.appendChild(msg("Password changed.", "ok")); })
        .catch(function (e) { out1.appendChild(msg(e.message, "err")); });
    });
    host.appendChild(h("div", { class: "acc-section" }, h("h2", {}, "Change password"), f1));

    var out2 = h("div", {});
    host.appendChild(h("div", { class: "acc-section" }, h("h2", {}, "Delete account"),
      h("p", { class: "acc-msg" }, "This permanently removes your account and every saved analysis. Uploaded files already on the server are not linked to you afterwards."),
      h("button", { type: "button", class: "acc-btn danger", onclick: function () {
        if (!window.confirm("Delete your account and all saved analyses? This cannot be undone.")) return;
        A.api("DELETE", "/auth/me").then(function () {
          A.signOut(); window.location.href = APP.home || "index.html";
        }).catch(function (e) { clear(out2).appendChild(msg(e.message, "err")); });
      } }, "Delete my account and data"), out2));
  }

  /* ---------- page ---------- */
  function goto(id) { tabId = id; render(); }

  function render() {
    clear(root);
    var u = A.user;
    if (!u) {
      root.appendChild(h("div", { class: "acc-empty" }, h("p", {}, "Sign in to see your saved analyses."),
        h("button", { type: "button", class: "acc-primary", onclick: function () { A.open("login"); } }, "Sign in")));
      return;
    }
    var doctor = u.role === "doctor";
    var tabs = doctor
      ? [["awaiting", "Awaiting review"], ["all", "All analyses"], ["patients", "Patients"], ["trends", "Trends"], ["mine", "My analyses"], ["account", "Account"]]
      : [["history", "My history"], ["trends", "Trends"], ["account", "Account"]];
    var hash = (location.hash || "").slice(1);
    if (!tabId) tabId = tabs.some(function (t) { return t[0] === hash; }) ? hash : tabs[0][0];
    var bar = h("div", { class: "acc-tabbar", role: "tablist" });
    var countEl = h("span", { class: "count", hidden: true });
    tabs.forEach(function (t) {
      var b = h("button", { type: "button", role: "tab", "aria-selected": String(t[0] === tabId) }, t[1]);
      if (t[0] === "awaiting") b.appendChild(countEl);
      b.addEventListener("click", function () { tabId = t[0]; render(); });
      bar.appendChild(b);
    });
    var host = h("div", { role: "tabpanel" });
    root.appendChild(bar); root.appendChild(host);

    function refreshCount() {
      if (!doctor) return;
      A.api("GET", "/doctor/analyses?reviewed=false&limit=1").then(function (r) { countEl.textContent = r.total; countEl.hidden = !r.total; }).catch(function () {});
    }
    refreshCount();
    if (tabId === "history" || tabId === "mine") {
      var list = h("div", {});
      host.appendChild(h("div", { class: "acc-tools" }, exportButton(function () { return "/history/export.csv"; }, "arterion-history.csv")));
      host.appendChild(list);
      pagedList(list, "/history", {}, { canDelete: true, emptyText: "No saved analyses yet. Sign in and run an analysis; it will appear here." });
    } else if (tabId === "trends") trendsTab(host);
    else if (tabId === "awaiting") allTab(host, true, refreshCount);
    else if (tabId === "all") allTab(host, false, refreshCount);
    else if (tabId === "patients") patientsTab(host, goto);
    else if (tabId === "account") accountTab(host);
  }

  window.addEventListener("hashchange", function () { tabId = null; render(); });
  A.onChange(function () { tabId = null; patientFilter = null; render(); });
})();
