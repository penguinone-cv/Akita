"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  getCurrentTheme,
  getStoredTheme,
  getSystemTheme,
  isTheme,
  storeTheme,
  type Theme,
} from "@/lib/theme";

import { Icon } from "./icon";

const THEME_CHANGE_EVENT = "akita:theme-change";

function subscribeToTheme(onThemeChange: () => void): () => void {
  const mediaQuery =
    typeof window.matchMedia === "function" ? window.matchMedia(THEME_MEDIA_QUERY) : null;

  function handleSystemThemeChange(event: MediaQueryListEvent) {
    if (getStoredTheme() !== null) return;
    applyTheme(event.matches ? "dark" : "light");
    onThemeChange();
  }

  function handleStoredThemeChange(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    const storedTheme = isTheme(event.newValue) ? event.newValue : null;
    applyTheme(storedTheme ?? getSystemTheme());
    onThemeChange();
  }

  mediaQuery?.addEventListener("change", handleSystemThemeChange);
  window.addEventListener("storage", handleStoredThemeChange);
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

  return () => {
    mediaQuery?.removeEventListener("change", handleSystemThemeChange);
    window.removeEventListener("storage", handleStoredThemeChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  };
}

function getServerTheme(): Theme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getCurrentTheme, getServerTheme);

  useEffect(() => {
    applyTheme(getStoredTheme() ?? getSystemTheme());
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const isDark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    storeTheme(nextTheme);
    applyTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label="ダークモード"
      aria-pressed={isDark}
      title={isDark ? "ライトモードに切り替える" : "ダークモードに切り替える"}
      onClick={toggleTheme}
    >
      <Icon name="sun" className="theme-icon theme-icon-sun" />
      <Icon name="moon" className="theme-icon theme-icon-moon" />
    </button>
  );
}
