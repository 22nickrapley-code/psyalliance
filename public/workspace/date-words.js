/* v13 (Nick, 15 Nov): a date box shows the device's own format, so beside each one the chosen date is written out
   US-style ("Fri, Nov 20, 2026") and can't be misread. Works for every date box, including ones drawn later. */
(function () {
  var fmt = function (v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3], 12);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };
  var words = function (input) {
    var next = input.nextElementSibling;
    if (!next || !next.classList || !next.classList.contains("date-words")) {
      next = document.createElement("small");
      next.className = "date-words";
      next.setAttribute("aria-live", "polite");
      input.insertAdjacentElement("afterend", next);
    }
    var t = fmt(input.value);
    if (next.textContent !== t) next.textContent = t;
    next.hidden = !t;
  };
  var sweep = function (root) {
    (root || document).querySelectorAll('input[type="date"]').forEach(words);
  };
  document.addEventListener("input", function (e) { if (e.target && e.target.matches && e.target.matches('input[type="date"]')) words(e.target); }, true);
  document.addEventListener("change", function (e) { if (e.target && e.target.matches && e.target.matches('input[type="date"]')) words(e.target); }, true);
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; sweep(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { sweep(); });
  else sweep();
})();
