import { THEME_COLORS, THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from "./theme";

export const THEME_INIT_SCRIPT = `
(() => {
  const root = document.documentElement;
  let theme = typeof window.matchMedia === "function" && window.matchMedia(${JSON.stringify(THEME_MEDIA_QUERY)}).matches
    ? "dark"
    : "light";

  try {
    const storedTheme = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (storedTheme === "light" || storedTheme === "dark") theme = storedTheme;
  } catch {}

  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", theme === "dark" ? ${JSON.stringify(THEME_COLORS.dark)} : ${JSON.stringify(THEME_COLORS.light)});
  }
})();
`;
