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

// Mobile nav toggle — opens/closes the drawer, syncs aria-expanded, and closes
// on link click or Escape so keyboard users aren't stuck inside the panel.
{
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", (e) => {
      if (e.target instanceof HTMLAnchorElement) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener("pointerdown", (e) => {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      const t = e.target;
      if (t instanceof Node && (nav.contains(t) || toggle.contains(t))) return;
      setOpen(false);
    });
  }
}

// Theme toggle — cycles auto → light → dark → auto, persists choice in
// localStorage, and updates the button's aria-label. The active icon is
// driven by CSS [data-theme] selectors, so we just have to flip the
// attribute on <html>. The inline <head> script already restored any
// saved theme before paint.
{
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    const root = document.documentElement;
    const cycle = ["auto", "light", "dark"];
    const getState = () => root.getAttribute("data-theme") || "auto";
    const refreshLabel = () => {
      const state = getState();
      const next = cycle[(cycle.indexOf(state) + 1) % cycle.length];
      toggle.setAttribute(
        "aria-label",
        `Theme: ${state}. Click to switch to ${next}.`,
      );
    };
    refreshLabel();

    toggle.addEventListener("click", () => {
      const state = getState();
      const next = cycle[(cycle.indexOf(state) + 1) % cycle.length];
      if (next === "auto") {
        root.removeAttribute("data-theme");
        try { localStorage.removeItem("theme"); } catch (e) {}
      } else {
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) {}
      }
      refreshLabel();
    });
  }
}

// Scroll-reveal: section cards + section headings fade + rise as they
// enter the viewport. The hidden state is applied by CSS gated on `.js`
// (set by an inline <head> script) so it never flashes for no-JS users.
{
  const targets = document.querySelectorAll(".section .card, .section > h2");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduced && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
    );
    targets.forEach((el) => observer.observe(el));
  } else if (!("IntersectionObserver" in window)) {
    // Old browsers without IO — reveal everything immediately.
    targets.forEach((el) => el.classList.add("is-visible"));
  }
  // For reduced-motion, CSS handles the visibility — no JS work needed.
}
