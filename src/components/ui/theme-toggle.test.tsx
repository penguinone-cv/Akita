import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemeToggle } from "./theme-toggle";

function mockSystemTheme(isDark: boolean) {
  const mediaQuery = {
    matches: isDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => mediaQuery),
  });
}

let themeColorMeta: HTMLMetaElement;

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  mockSystemTheme(false);

  themeColorMeta = document.createElement("meta");
  themeColorMeta.name = "theme-color";
  document.head.append(themeColorMeta);
});

afterEach(() => {
  cleanup();
  themeColorMeta.remove();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

describe("ThemeToggle", () => {
  it("uses the system theme when no preference has been saved", async () => {
    mockSystemTheme(true);
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "ダークモード" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(themeColorMeta.content).toBe(THEME_COLORS.dark);
  });

  it("rechecks the system theme when subscribing after bootstrap", async () => {
    document.documentElement.dataset.theme = "light";
    mockSystemTheme(true);
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "ダークモード" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(themeColorMeta.content).toBe(THEME_COLORS.dark);
  });

  it("switches to dark mode and saves the preference", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "ダークモード" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("title", "ライトモードに切り替える");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(themeColorMeta.content).toBe(THEME_COLORS.dark);
  });

  it("switches from dark mode to light mode", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "ダークモード" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("title", "ダークモードに切り替える");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(themeColorMeta.content).toBe(THEME_COLORS.light);
  });

  it("restores a saved light preference even when the system is dark", async () => {
    mockSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "ダークモード" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(themeColorMeta.content).toBe(THEME_COLORS.light);
  });
});
