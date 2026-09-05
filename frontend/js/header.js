function initHeader() {
  const siteHeader = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const headerPanel = document.querySelector(".header-panel");

  function setMenuOpen(isOpen) {
    if (!siteHeader || !menuToggle || !headerPanel) return;

    siteHeader.classList.toggle("is-menu-open", isOpen);
    headerPanel.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  }

  window.TrustedCertHeader = {
    setMenuOpen
  };

  menuToggle?.addEventListener("click", () => {
    setMenuOpen(!siteHeader?.classList.contains("is-menu-open"));
  });

  headerPanel?.querySelectorAll(".site-nav a, .header-action").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.querySelectorAll("[data-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.dataset.scrollTarget);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `/${window.location.search}`);
      setMenuOpen(false);
    });
  });

  document.addEventListener("click", (event) => {
    if (!siteHeader?.classList.contains("is-menu-open")) return;
    if (siteHeader.contains(event.target)) return;
    setMenuOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setMenuOpen(false);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeader, { once: true });
} else {
  initHeader();
}
