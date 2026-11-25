(() => {
  const $ = (id) => document.getElementById(id);
  const API = window.API_BASE.replace(/\/$/, "");
  const COLORS = { mild: "var(--mild)", moderate: "var(--moderate)", severe: "var(--severe)" };
  let mode = "image";
  let report = null;

  /* ---------- status ---------- */
  async function ping() {
    const el = $("status");
    try {
      const r = await fetch(API + "/health", { cache: "no-store" });
      if (!r.ok) throw 0;
      el.className = "status ok";
      el.lastElementChild.textContent = "API online";
    } catch {
      el.className = "status bad";
      el.lastElementChild.textContent = "API offline at " + API;
    }
  }
  ping();

  /* ---------- mode + dropzone ---------- */
  document.querySelectorAll(".modes [data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      document.querySelectorAll(".modes [data-mode]").forEach((x) => {
        x.classList.toggle("on", x === b);
        x.setAttribute("aria-selected", x === b);
      });
      $("file").accept = mode === "video" ? "video/*" : "image/*";
      $("dropTitle").textContent = mode === "video" ? "Drop an angiogram video" : "Drop an angiogram frame";
      $("dropHint").textContent = mode === "video" ? "MP4 or AVI, the most affected frame is reported" : "PNG or JPG, drag it here or click to browse";
      $("samples").hidden = mode === "video";
    })
  );
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && analyse(e.dataTransfer.files[0]));
  $("file").addEventListener("change", (e) => e.target.files[0] && analyse(e.target.files[0]));
  document.querySelectorAll("[data-sample]").forEach((b) =>
    b.addEventListener("click", async () => {
      const blob = await (await fetch(b.dataset.sample)).blob();
      analyse(new File([blob], b.dataset.sample.split("/").pop(), { type: blob.type }));
    })
  );
  $("reset").addEventListener("click", reset);

  /* ---------- helpers ---------- */
  function show(el, on) { el.hidden = !on; }
  function setError(msg) { $("error").textContent = msg || ""; show($("error"), !!msg); }
  function reset() {
    show($("stage"), false); show($("drop"), true); show($("results"), false); show($("idle"), true);
    show($("reset"), false); show($("views"), false); show($("notice"), false); setError("");
    $("file").value = "";
  }
  async function post(path, body, isForm) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
    });
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error((j && j.detail) || `Request failed (${r.status})`);
    return j;
  }

  /* ---------- analysis ---------- */
  async function analyse(file) {
    setError(""); show($("notice"), false);
    const isVideo = file.type.startsWith("video/");
    if (mode === "image" && isVideo) return setError("That is a video. Switch to the Video tab to analyse it.");
    if (mode === "video" && !isVideo) return setError("That is not a video. Switch to the Still image tab, or choose an MP4/AVI file.");
    show($("busy"), true);
    $("busyText").textContent = "Uploading";
    try {
      const fd = new FormData(); fd.append("file", file);
      const { file_url } = await post("/uploads", fd, true);
      $("busyText").textContent = isVideo ? "Scanning frames" : "Segmenting vessels";
      const res = isVideo
        ? await post("/vessel-analysis/predict-video", { file_url, frame_stride: 5 })
        : await post("/vessel-analysis/report", { file_url });
      render(res, file);
    } catch (e) {
      setError(e.message === "Failed to fetch" ? `Cannot reach the API at ${API}. Is the backend running?` : e.message);
    } finally {
      show($("busy"), false);
    }
  }

  function render(res, file) {
    if (!res.overlay_image_base64) {
      show($("notice"), true);
      $("notice").innerHTML = "The model weights are not installed, so no analysis was produced. Run <code>scripts/fetch_weights</code> (or place <code>vessel_model.onnx</code> and <code>stenosis_model.onnx</code> in <code>backend/app/vessel_analysis/weights/</code>) and restart the API.";
      return;
    }
    const orig = res.original_image_base64 ? "data:image/png;base64," + res.original_image_base64 : URL.createObjectURL(file);
    $("imgOriginal").src = orig;
    $("imgOverlay").src = "data:image/png;base64," + res.overlay_image_base64;
    show($("drop"), false); show($("stage"), true); show($("views"), true); show($("reset"), true); show($("idle"), false); show($("results"), true);
    setView("split"); setSplit(50);

    const lesions = res.lesions || [];
    const peak = lesions.reduce((m, l) => Math.max(m, l.stenosis_percent), 0);
    const worst = lesions.find((l) => l.stenosis_percent === peak);
    const band = worst ? worst.severity_band : "mild";
    $("peak").textContent = lesions.length ? Math.round(peak) + "%" : "0%";
    const arc = $("arc");
    arc.style.stroke = lesions.length ? COLORS[band] : "var(--mild)";
    requestAnimationFrame(() => (arc.style.strokeDashoffset = 314 - (314 * Math.min(peak, 100)) / 100));
    $("headline").textContent = lesions.length ? `${lesions.length} lesion${lesions.length > 1 ? "s" : ""} found` : "No significant stenosis";
    $("summary").textContent = res.summary || "";
    $("meta").textContent = res.frames_analyzed ? `${res.frames_analyzed} frames scanned, key frame ${res.key_frame_index}` : "";

    $("lcount").textContent = lesions.length;
    const box = $("lesions"); box.innerHTML = "";
    if (!lesions.length) box.innerHTML = '<p class="empty">No region exceeded the stenosis detection threshold on this frame.</p>';
    lesions.forEach((l, i) => {
      const d = document.createElement("div");
      d.className = "lesion"; d.style.setProperty("--c", COLORS[l.severity_band]);
      const [x, y, w, h] = l.bbox;
      d.innerHTML = `<span class="n">#${i + 1}</span><div><b>${l.stenosis_percent}%</b><span>${l.confidence}% confidence, at (${x}, ${y}), ${w} by ${h} px</span></div><span class="badge">${l.severity_band}</span>`;
      box.appendChild(d);
    });
    report = res.report || null;
    setReport("doctor");
  }

  /* ---------- viewer controls ---------- */
  function setSplit(v) {
    $("stage").style.setProperty("--split", v + "%");
    $("slider").value = v;
  }
  $("slider").addEventListener("input", (e) => setSplit(e.target.value));
  function setView(v) {
    $("stage").dataset.view = v;
    document.querySelectorAll("#views button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $("tagL").style.display = v === "overlay" ? "none" : "";
    $("tagR").style.display = v === "original" ? "none" : "";
  }
  document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  /* ---------- report ---------- */
  document.querySelectorAll("#rtabs button").forEach((b) => b.addEventListener("click", () => setReport(b.dataset.r)));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function setReport(key) {
    document.querySelectorAll("#rtabs button").forEach((b) => b.classList.toggle("on", b.dataset.r === key));
    const el = $("report");
    if (!report) { el.innerHTML = '<p class="empty">No report was generated for this analysis.</p>'; return; }
    if (key === "doctor") {
      const d = report.doctor_report || {};
      el.innerHTML = `<h3>Clinical summary</h3><p>${esc(d.clinical_summary)}</p><h3>Findings</h3><p>${esc(d.findings)}</p><h3>Recommendation</h3><p>${esc(d.recommendation)}</p>`;
      return;
    }
    const lang = { en: "english", hi: "hindi", mr: "marathi" }[key];
    const p = (report.patient_report || {})[lang] || {};
    const sug = (p.lifestyle_suggestions || []).map((s) => `<li>${esc(s)}</li>`).join("");
    el.innerHTML = `<h3>Summary</h3><p>${esc(p.summary)}</p><h3>What it means</h3><p>${esc(p.what_it_means)}</p><h3>Suggestions</h3><ul>${sug}</ul><p class="disc">${esc((report.disclaimer || {})[lang])}</p>`;
  }
})();
