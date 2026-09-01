const THEME_STORAGE_KEY = "trustedcert-theme";
const THEMES = new Set(["dark", "light"]);

function getStoredTheme() {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.has(theme) ? theme : null;
  } catch (error) {
    return null;
  }
}

function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Theme persistence is a convenience; the switch should still work without storage.
  }
}

function getCurrentTheme() {
  const activeTheme = document.documentElement.dataset.theme || getStoredTheme();
  return THEMES.has(activeTheme) ? activeTheme : "dark";
}

function syncThemeToggle(button, theme) {
  const nextTheme = theme === "light" ? "dark" : "light";
  const label = button.querySelector("[data-theme-toggle-label]");

  button.setAttribute("aria-pressed", String(theme === "light"));
  button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  button.title = `Switch to ${nextTheme} mode`;
  if (label) label.textContent = theme === "light" ? "Light" : "Dark";
}

function setTheme(theme, shouldSave = true) {
  const safeTheme = THEMES.has(theme) ? theme : "dark";
  document.documentElement.dataset.theme = safeTheme;
  document.documentElement.style.colorScheme = safeTheme;
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    syncThemeToggle(button, safeTheme);
  });

  if (shouldSave) saveTheme(safeTheme);
}

function attachThemeToggles() {
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    syncThemeToggle(button, getCurrentTheme());
    button.addEventListener("click", () => {
      setTheme(getCurrentTheme() === "light" ? "dark" : "light");
    });
  });
}

setTheme(getCurrentTheme(), false);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attachThemeToggles, { once: true });
} else {
  attachThemeToggles();
}
