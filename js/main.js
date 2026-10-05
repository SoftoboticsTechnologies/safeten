/* ==========================================================================
   Site interactions: header, hero slider, client carousel, reveal
   ========================================================================== */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Header ---------- */
function initHeader() {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!header) return;

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (!toggle || !nav) return;
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.querySelector("i").className = open ? "fa-solid fa-xmark" : "fa-solid fa-bars";
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 900) setOpen(false); });
}

/* ---------- Hero slider ---------- */
function initHeroSlider(root = document.querySelector("[data-slider]")) {
  if (!root) return;
  const slides = [...root.querySelectorAll(".hero-slide")];
  const dotsWrap = root.querySelector(".hero-dots");
  const interval = Number(root.dataset.interval) || 6000;
  if (slides.length < 2) return;

  let index = 0;
  let timer = null;

  dotsWrap.innerHTML = slides.map((_, i) =>
    `<button type="button" class="hero-dot" aria-label="Go to slide ${i + 1}"></button>`).join("");
  const dots = [...dotsWrap.children];

  const goTo = (next) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", !active);
      slide.inert = !active;
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", i === index ? "true" : "false");
    });
  };

  // Autoplay pauses while a mouse hovers or keyboard focus is inside the slider.
  let hovering = false;
  let focused = false;
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    stop();
    if (prefersReducedMotion || hovering || focused || document.hidden) return;
    timer = setInterval(() => goTo(index + 1), interval);
  };

  root.querySelector(".hero-arrow--prev")?.addEventListener("click", () => { goTo(index - 1); start(); });
  root.querySelector(".hero-arrow--next")?.addEventListener("click", () => { goTo(index + 1); start(); });
  dots.forEach((dot, i) => dot.addEventListener("click", () => { goTo(i); start(); }));

  root.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hovering = true; stop(); } });
  root.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hovering = false; start(); } });
  root.addEventListener("focusin", () => { focused = true; stop(); });
  root.addEventListener("focusout", (e) => {
    if (root.contains(e.relatedTarget)) return;
    focused = false;
    start();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { goTo(index - 1); start(); }
    if (e.key === "ArrowRight") { goTo(index + 1); start(); }
  });

  // Touch swipe (horizontal only, so vertical page scrolling is unaffected)
  let startX = null;
  let startY = null;
  root.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    stop();
  }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) goTo(index + (dx < 0 ? 1 : -1));
    startX = startY = null;
    start();
  });

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  goTo(0);
  start();
}

/* ---------- Client carousel (CSS marquee, duplicated for a seamless loop) ---------- */
function initClientCarousel() {
  const track = document.querySelector(".client-track");
  if (!track || track.dataset.ready) return;
  track.dataset.ready = "1";
  if (prefersReducedMotion) return;
  [...track.children].forEach((item) => {
    const clone = item.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("img").forEach((img) => { img.alt = ""; });
    track.appendChild(clone);
  });
  const count = track.children.length / 2;
  track.style.setProperty("--marquee-duration", `${Math.max(20, count * 6)}s`);
}

/* ---------- Scroll reveal ----------
   Items that enter the viewport in the same frame are staggered in DOM
   order; the step comes from the nearest [data-stagger] (ms, default 90).
   [data-stagger-group] reveals all its children when the group itself
   enters. [data-reveal-children="selector"] tags children rendered later
   (e.g. featured products) with that container's reveal class. */
const REVEAL_SELECTOR = ".reveal, .reveal-up, .reveal-left, .reveal-right, .reveal-scale, .reveal-fade, .reveal-soft, [data-stagger-group]";
const REVEAL_MAX_DELAY = 0.5;

function initReveal() {
  document.documentElement.classList.add("js");
  window.__revealReady = true;
  const canAnimate = !prefersReducedMotion && "IntersectionObserver" in window;

  const show = (els) => {
    els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    els.forEach((el, i) => {
      const step = Number(el.closest("[data-stagger]")?.dataset.stagger || 90) / 1000;
      el.style.setProperty("--delay", `${Math.min(i * step, REVEAL_MAX_DELAY).toFixed(2)}s`);
      if (el.hasAttribute("data-stagger-group")) {
        const groupStep = Number(el.dataset.stagger || 80) / 1000;
        [...el.children].forEach((child, j) =>
          child.style.setProperty("--delay", `${Math.min(j * groupStep, REVEAL_MAX_DELAY).toFixed(2)}s`));
      }
      el.classList.add("is-visible");
    });
  };

  const io = canAnimate && new IntersectionObserver((entries) => {
    const entering = entries.filter((e) => e.isIntersecting).map((e) => e.target);
    entering.forEach((el) => io.unobserve(el));
    if (entering.length) show(entering);
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  const observe = (els) => (io ? els.forEach((el) => io.observe(el)) : els.forEach((el) => el.classList.add("is-visible")));
  observe([...document.querySelectorAll(REVEAL_SELECTOR)]);

  document.querySelectorAll("[data-reveal-children]").forEach((parent) => {
    const [selector, cls] = parent.dataset.revealChildren.split("|");
    new MutationObserver(() => {
      const fresh = [...parent.querySelectorAll(selector)].filter((el) => !el.classList.contains(cls));
      fresh.forEach((el) => el.classList.add(cls));
      observe(fresh);
    }).observe(parent, { childList: true });
  });
}

/* ---------- Certificate lightbox ----------
   A certificate frame becomes clickable only once its image has loaded, so
   cards still showing the text badge stay inert. */
function initCertLightbox() {
  const frames = document.querySelectorAll(".cert-media");
  if (!frames.length || typeof HTMLDialogElement !== "function") return;
  let dialog = null;

  const open = (img) => {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "cert-lightbox";
      dialog.innerHTML = `<img alt=""><div class="cert-lightbox__bar"><span class="cert-lightbox__caption"></span>
        <button type="button" class="cert-lightbox__close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
      dialog.querySelector("button").addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
      document.body.appendChild(dialog);
    }
    const big = dialog.querySelector("img");
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    dialog.querySelector(".cert-lightbox__caption").textContent = img.alt;
    dialog.showModal();
  };

  frames.forEach((frame) => {
    const img = frame.querySelector("img");
    if (!img) return;
    const enable = () => {
      if (!img.naturalWidth) return;
      frame.classList.add("is-zoomable");
      frame.setAttribute("role", "button");
      frame.tabIndex = 0;
      frame.setAttribute("aria-label", `View larger: ${img.alt}`);
      frame.addEventListener("click", () => open(img));
      frame.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(img); }
      });
    };
    if (img.complete) enable(); else img.addEventListener("load", enable, { once: true });
  });
}

function initYear() {
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initContactLinks();
  initReveal();
  initYear();

  const page = document.body.dataset.page;
  if (page === "home") {
    initHeroSlider();
    initClientCarousel();
    initCertLightbox();
    renderFeaturedProducts();
  } else if (page === "products") {
    initProductListing();
  } else if (page === "product") {
    renderProductDetails();
  }
});
