/* Arterion accounts: sign in / sign up, JWT handling, account menu and "saved to history" toasts.
   Loads after config.js and account-config.js, before app.js. The token is kept in localStorage
   (fine for a prototype; use httpOnly cookies behind HTTPS for a real deployment). */
(function () {
  "use strict";
  var APP = window.ARTERION_APP || { slug: "app", name: "Arterion", home: "index.html", tasks: {} };
  var API = String(window.API_BASE || "http://localhost:8000").replace(/\/$/, "");
  var KEY = "arterion." + APP.slug + ".session";
  var state = { token: null, user: null };
  var listeners = [];
  var nativeFetch = window.fetch.bind(window);
  var lastFocus = null;

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.token) { state.token = saved.token; state.user = saved.user || null; }
  } catch (e) { /* storage unavailable: stay signed out */ }

  function persist() {
    try { if (state.token) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function fmtDetail(d) {
    if (Array.isArray(d)) return d.map(function (x) { return (x.msg || "").replace(/^Value error, /, ""); }).join(" ");
    return typeof d === "string" ? d : "Something went wrong.";
  }

  /* ---------- API ---------- */
  function call(method, path, body) {
    var headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    return nativeFetch(API + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
      .catch(function () { throw new Error("Cannot reach the server. Is the API running?"); })
      .then(function (res) {
        if (res.status === 204) return null;
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            if (res.status === 401 && state.token && path.indexOf("/auth/login") < 0) signOut(true);
            var err = new Error(fmtDetail(data.detail));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  function setSession(resp) {
    state.token = resp.access_token;
    state.user = resp.user;
    persist();
    emit();
  }

  function signOut(expired) {
    state.token = null; state.user = null;
    persist(); emit();
    toast(expired ? "Your session expired. Please sign in again." : "Signed out.");
  }

  function emit() {
    renderBar();
    listeners.forEach(function (fn) { try { fn(state.user); } catch (e) { /* ignore */ } });
  }

  /* ---------- fetch hook: attach the token, react to 401, announce saved results ---------- */
  var nudged = false;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var ours = url.indexOf(API) === 0;
    if (ours && state.token) {
      init = Object.assign({}, init);
      var hd = new Headers(init.headers || {});
      if (!hd.has("Authorization")) hd.set("Authorization", "Bearer " + state.token);
      init.headers = hd;
    }
    return nativeFetch(input, init).then(function (res) {
      if (!ours) return res;
      var path = url.slice(API.length);
      if (res.status === 401 && path.indexOf("/auth/") < 0) {
        if (state.token) signOut(true); else openModal("login", "Sign in to continue.");
      }
      if (res.ok && /\/(predict|report|predict-video)$/.test(path.split("?")[0])) {
        var hid = res.headers.get("X-History-Id");
        if (hid) toast("Saved to your history.", "View", historyUrl());
        else if (!state.token && !nudged) {
          nudged = true;
          toast("Sign in to keep this result in your history.", "Sign in", null, function () { openModal("login"); });
        }
      }
      return res;
    });
  };

  function historyUrl() { return "history.html"; }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(text, linkText, href, onClick) {
    var box = document.getElementById("acc-toast");
    if (!box) { box = h("div", { id: "acc-toast", class: "acc-toast", role: "status", "aria-live": "polite" }); document.body.appendChild(box); }
    box.textContent = "";
    box.appendChild(h("span", {}, text));
    if (linkText) {
      var a = href ? h("a", { href: href }, linkText) : h("button", { type: "button" }, linkText);
      if (onClick) a.addEventListener("click", function () { box.classList.remove("show"); onClick(); });
      box.appendChild(a);
    }
    box.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove("show"); }, 6000);
  }

  /* ---------- account bar ---------- */
  function renderBar() {
    document.querySelectorAll("[data-acc-open]").forEach(function (b) { b.hidden = !!state.user; });
    // inside the page navigation when it has a slot, else a floating bar
    var slot = document.getElementById("acc-slot");
    var bar = slot || document.getElementById("acc-bar");
    if (!bar) { bar = h("div", { id: "acc-bar", class: "acc-bar" }); document.body.appendChild(bar); }
    bar.textContent = "";
    if (!state.user) {
      bar.appendChild(h("button", { type: "button", class: slot ? "acc-signin" : "acc-chip", onclick: function () { openModal("login"); } }, slot ? "Sign In" : "Sign in"));
      place();
      return;
    }
    var u = state.user;
    var isDoc = u.role === "doctor";
    var menu = h("div", { class: "acc-menu", role: "menu", hidden: true },
      h("a", { role: "menuitem", href: historyUrl() }, isDoc ? "Doctor dashboard" : "My history"),
      isDoc ? h("a", { role: "menuitem", href: historyUrl() + "#mine" }, "My analyses") : null,
      h("a", { role: "menuitem", href: historyUrl() + "#account" }, "Account"),
      h("button", { role: "menuitem", type: "button", onclick: function () { signOut(false); } }, "Sign out"));
    var chip = h("button", { type: "button", class: "acc-chip signed", "aria-haspopup": "true", "aria-expanded": "false" },
      h("span", { class: "acc-name" }, u.name), h("span", { class: "acc-role" }, isDoc ? "Doctor" : "Patient"));
    chip.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var open = menu.hasAttribute("hidden");
      menu.toggleAttribute("hidden", !open);
      chip.setAttribute("aria-expanded", String(open));
    });
    bar.appendChild(chip);
    bar.appendChild(menu);
    place();
  }

  /* Keep the bar clear of the site's own status pill when that sits in the top-right corner. */
  function place() {
    if (document.getElementById("acc-slot")) return;
    var bar = document.getElementById("acc-bar");
    if (!bar) return;
    var right = 12;
    var s = document.getElementById("status");
    if (window.innerWidth <= 560) { bar.style.right = ""; return; }
    if (s) {
      var r = s.getBoundingClientRect();
      var top = r.top + (window.pageYOffset || 0);
      if (r.width && top < 80 && r.right > window.innerWidth - 240) right = Math.max(12, Math.round(window.innerWidth - r.left + 10));
    }
    bar.style.right = right + "px";
  }
  window.addEventListener("resize", place);
  window.addEventListener("load", place);

  document.addEventListener("click", function (ev) {
    var menu = document.querySelector("#acc-bar .acc-menu");
    if (menu && !menu.hasAttribute("hidden") && !ev.target.closest("#acc-bar")) {
      menu.setAttribute("hidden", "");
      var chip = document.querySelector("#acc-bar .acc-chip");
      if (chip) chip.setAttribute("aria-expanded", "false");
    }
  });

  /* ---------- sign-in / sign-up dialog ---------- */
  var overlay;
  function field(id, label, type, extra) {
    return h("label", { class: "acc-field", for: id }, h("span", {}, label),
      h("input", Object.assign({ id: id, name: id, type: type, required: true, autocomplete: "off" }, extra || {})));
  }

  function buildModal() {
    var mode = "login";
    var errBox = h("p", { class: "acc-error", role: "alert", hidden: true });
    var title = h("h2", { id: "acc-title" }, "Sign in");
    var tabLogin = h("button", { type: "button", role: "tab", "aria-selected": "true" }, "Sign in");
    var tabReg = h("button", { type: "button", role: "tab", "aria-selected": "false" }, "Create account");
    var nameF = field("acc-name", "Full name", "text", { autocomplete: "name", maxlength: "80" });
    var emailF = field("acc-email", "Email", "email", { autocomplete: "email" });
    var passF = field("acc-pass", "Password", "password", { autocomplete: "current-password", minlength: "8", maxlength: "128" });
    var hint = h("p", { class: "acc-hint" }, "At least 8 characters.");
    var roleP = h("button", { type: "button", role: "radio", "aria-checked": "true", "data-role": "patient" }, "Patient");
    var roleD = h("button", { type: "button", role: "radio", "aria-checked": "false", "data-role": "doctor" }, "Doctor");
    var roleBox = h("div", { class: "acc-roles", role: "radiogroup", "aria-label": "Account type" }, roleP, roleD);
    var inviteF = field("acc-invite", "Doctor invite code", "text", { required: false, maxlength: "200" });
    var role = "patient";
    var submit = h("button", { type: "submit", class: "acc-primary" }, "Sign in");
    var form = h("form", { class: "acc-form", novalidate: true }, nameF, emailF, passF, hint, roleBox, inviteF, errBox, submit);

    function setRole(r) {
      role = r;
      roleP.setAttribute("aria-checked", String(r === "patient"));
      roleD.setAttribute("aria-checked", String(r === "doctor"));
      inviteF.hidden = r !== "doctor" || mode !== "register";
    }
    function setMode(m, message) {
      mode = m;
      var reg = m === "register";
      tabLogin.setAttribute("aria-selected", String(!reg));
      tabReg.setAttribute("aria-selected", String(reg));
      title.textContent = reg ? "Create your account" : "Sign in";
      submit.textContent = reg ? "Create account" : "Sign in";
      nameF.hidden = !reg; hint.hidden = !reg; roleBox.hidden = !reg;
      passF.querySelector("input").setAttribute("autocomplete", reg ? "new-password" : "current-password");
      setRole(role);
      showError(message || "");
    }
    function showError(msg) { errBox.textContent = msg; errBox.hidden = !msg; }

    tabLogin.addEventListener("click", function () { setMode("login"); });
    tabReg.addEventListener("click", function () { setMode("register"); });
    roleP.addEventListener("click", function () { setRole("patient"); });
    roleD.addEventListener("click", function () { setRole("doctor"); });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      showError("");
      var email = form.querySelector("#acc-email").value.trim();
      var password = form.querySelector("#acc-pass").value;
      if (!email || !password) { showError("Enter your email and password."); return; }
      var body = { email: email, password: password };
      if (mode === "register") {
        body.name = form.querySelector("#acc-name").value.trim();
        body.role = role;
        if (role === "doctor") body.invite_code = form.querySelector("#acc-invite").value.trim();
        if (!body.name) { showError("Enter your name."); return; }
      }
      submit.disabled = true;
      call("POST", mode === "register" ? "/auth/register" : "/auth/login", body)
        .then(function (resp) { setSession(resp); closeModal(); toast("Welcome, " + resp.user.name + "."); })
        .catch(function (e) { showError(e.message); })
        .then(function () { submit.disabled = false; });
    });

    var closeBtn = h("button", { type: "button", class: "acc-x", "aria-label": "Close", onclick: closeModal }, "×");
    var dialog = h("div", { class: "acc-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "acc-title" },
      closeBtn, h("p", { class: "acc-brand" }, APP.name || "Arterion"), title,
      h("div", { class: "acc-tabs", role: "tablist" }, tabLogin, tabReg), form);
    overlay = h("div", { class: "acc-overlay", hidden: true }, dialog);
    overlay.addEventListener("mousedown", function (ev) { if (ev.target === overlay) closeModal(); });
    overlay.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { closeModal(); return; }
      if (ev.key !== "Tab") return;
      var f = dialog.querySelectorAll("button, input, a[href]");
      var vis = Array.prototype.filter.call(f, function (n) { return !n.disabled && !n.closest("[hidden]") && n.offsetParent !== null; });
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    document.body.appendChild(overlay);
    overlay._setMode = setMode;
    // never keep a previous person's email or password around, especially on a shared computer
    overlay._reset = function () { form.reset(); role = "patient"; };
    setMode("login");
  }

  function openModal(mode, message) {
    if (!overlay) buildModal();
    lastFocus = document.activeElement;
    overlay._reset();
    overlay._setMode(mode || "login", message);
    overlay.hidden = false;
    var first = overlay.querySelector(mode === "register" ? "#acc-name" : "#acc-email");
    if (first) first.focus();
  }
  function closeModal() {
    if (!overlay) return;
    overlay._reset();
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- public API ---------- */
  window.ArterionAuth = {
    app: APP,
    get user() { return state.user; },
    get token() { return state.token; },
    api: call,
    open: openModal,
    signOut: function () { signOut(false); },
    onChange: function (fn) { listeners.push(fn); fn(state.user); },
    toast: toast,
    h: h,
  };

  function start() {
    renderBar();
    document.querySelectorAll("[data-acc-open]").forEach(function (b) { b.addEventListener("click", function () { openModal("login"); }); });
    if (state.token) {
      call("GET", "/auth/me").then(function (u) { state.user = u; persist(); emit(); }).catch(function () { /* offline: keep what we have */ });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
