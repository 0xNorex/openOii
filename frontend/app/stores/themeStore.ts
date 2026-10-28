import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

/** 首次访问跟随系统；用户切换后写入 localStorage。 */
function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** 旧版本存的是 doodle / doodle-dark。 */
export function migrateTheme(stored: unknown): Theme {
  if (stored === "dark" || stored === "doodle-dark") return "dark";
  if (stored === "light" || stored === "doodle") return "light";
  return systemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: systemTheme(),
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        applyTheme(next);
        set({ theme: next });
      },
      setTheme: (theme: Theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "openoii-theme",
      version: 1,
      migrate: (persisted) => ({
        theme: migrateTheme((persisted as { theme?: unknown } | null)?.theme),
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);
