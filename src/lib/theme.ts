export const THEME_STORAGE_KEY = "akita-color-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const THEME_COLORS = {
  light: "#edf3f0",
  dark: "#0c1210",
} as const;

export type Theme = keyof typeof THEME_COLORS;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

export function getCurrentTheme(): Theme {
  if (typeof document !== "undefined") {
    const currentTheme = document.documentElement.dataset.theme;
    if (isTheme(currentTheme)) return currentTheme;
  }

  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLORS[theme];
  });
}

export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this page when storage is unavailable.
  }
}
