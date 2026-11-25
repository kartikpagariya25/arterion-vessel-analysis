// Per-site settings for the accounts UI (auth.js, history.js).
window.ARTERION_APP = {
  slug: "vessel-analysis",
  name: "Arterion Vessel Analysis",
  home: "index.html",
  tasks: {
    "vessel-analysis": "Vessel & stenosis scan",
    "vessel-analysis-video": "Angiogram video scan"
  },
  // One-line summary of a saved result, shown at the top of its details.
  headline: function (r) {
    var l = (r.lesions || []), worst = l.map(function (x) { return x.severity_band; }).filter(Boolean);
    return l.length ? l.length + (l.length === 1 ? ' lesion' : ' lesions') + (worst.length ? ', worst: ' + (worst.indexOf('severe') >= 0 ? 'severe' : worst.indexOf('moderate') >= 0 ? 'moderate' : 'mild') : '') : 'No stenosis detected';
  },
};
