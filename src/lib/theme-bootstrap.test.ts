import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { THEME_INIT_SCRIPT } from "./theme-bootstrap";
import { THEME_COLORS } from "./theme";

function runThemeBootstrap({
  storedTheme,
  systemDark,
}: {
  storedTheme: string | null;
  systemDark: boolean;
}) {
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const setThemeColor = vi.fn();

  runInNewContext(THEME_INIT_SCRIPT, {
    document: {
      documentElement: root,
      querySelector: () => ({ setAttribute: setThemeColor }),
    },
    window: {
      localStorage: { getItem: () => storedTheme },
      matchMedia: () => ({ matches: systemDark }),
    },
  });

  return { root, setThemeColor };
}

describe("theme bootstrap", () => {
  it("applies a saved light theme before paint when the system is dark", () => {
    const { root, setThemeColor } = runThemeBootstrap({ storedTheme: "light", systemDark: true });

    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(setThemeColor).toHaveBeenCalledWith("content", THEME_COLORS.light);
  });

  it("uses the system dark theme when there is no saved preference", () => {
    const { root, setThemeColor } = runThemeBootstrap({ storedTheme: null, systemDark: true });

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(setThemeColor).toHaveBeenCalledWith("content", THEME_COLORS.dark);
  });
});
