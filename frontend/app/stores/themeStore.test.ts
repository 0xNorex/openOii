import { describe, it, expect, vi } from "vitest";

vi.mock("zustand/middleware", () => ({
  persist: (fn: any) => fn,
}));

// Import after mock so persist is a no-op (no localStorage needed)
const { useThemeStore, migrateTheme } = await import("./themeStore");

describe("themeStore", () => {
  it("defaults to the system scheme (light in jsdom)", () => {
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggleTheme switches between light and dark", () => {
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("migrates the old doodle theme names", () => {
    expect(migrateTheme("doodle")).toBe("light");
    expect(migrateTheme("doodle-dark")).toBe("dark");
    expect(migrateTheme("dark")).toBe("dark");
    expect(migrateTheme(undefined)).toBe("light");
  });
});
