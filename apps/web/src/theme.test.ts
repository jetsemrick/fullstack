import { describe, expect, test, beforeEach } from "bun:test";

const store = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
  clear() {
    store.clear();
  },
  removeItem(key: string) {
    store.delete(key);
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

Object.defineProperty(globalThis, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
  configurable: true,
});

const html = { dataset: {} as Record<string, string> };
Object.defineProperty(globalThis, "document", {
  value: { documentElement: html },
  configurable: true,
});

const {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredThemePreference,
  resolveEffectiveTheme,
  setThemePreference,
} = await import("./theme");

describe("theme", () => {
  beforeEach(() => {
    store.clear();
    html.dataset = {};
  });

  test("defaults to system when unset", () => {
    expect(getStoredThemePreference()).toBe("system");
  });

  test("reads valid stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getStoredThemePreference()).toBe("dark");
  });

  test("ignores invalid stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(getStoredThemePreference()).toBe("system");
  });

  test("resolveEffectiveTheme honors explicit light/dark", () => {
    expect(resolveEffectiveTheme("light")).toBe("light");
    expect(resolveEffectiveTheme("dark")).toBe("dark");
  });

  test("resolveEffectiveTheme uses system when preference is system", () => {
    expect(resolveEffectiveTheme("system")).toBe("light");
  });

  test("applyTheme sets data-theme on documentElement", () => {
    expect(applyTheme("dark")).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
  });

  test("setThemePreference persists and applies", () => {
    expect(setThemePreference("light")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(html.dataset.theme).toBe("light");
  });
});
