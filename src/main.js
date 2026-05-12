// Tiny progressive enhancements. No frameworks, no dependencies.

// Keep the footer year fresh without baking a build-time value into the HTML.
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// Smooth, focus-friendly in-page anchor scrolling (the browser already does
// the scroll thanks to CSS `scroll-behavior`; we just move focus so keyboard
// users land on the target section).
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    history.pushState(null, "", href);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (target instanceof HTMLElement) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });
});
