import { describe, expect, test, beforeEach } from "bun:test";

declare const Bun: {
  file(path: URL): {
    text(): Promise<string>;
  };
};

let systemPrefersDark = false;
let storageReadFails = false;
let storageWriteFails = false;

const store = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    if (storageReadFails) throw new Error("Access denied");
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    if (storageWriteFails) throw new Error("Access denied");
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
    matches: systemPrefersDark,
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

const indexHtml = await Bun.file(new URL("../index.html", import.meta.url)).text();

describe("theme", () => {
  beforeEach(() => {
    store.clear();
    html.dataset = {};
    systemPrefersDark = false;
    storageReadFails = false;
    storageWriteFails = false;
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

  test("defaults to system when storage is unavailable", () => {
    storageReadFails = true;
    expect(getStoredThemePreference()).toBe("system");
  });

  test("resolveEffectiveTheme honors explicit light/dark", () => {
    expect(resolveEffectiveTheme("light")).toBe("light");
    expect(resolveEffectiveTheme("dark")).toBe("dark");
  });

  test("resolveEffectiveTheme uses system when preference is system", () => {
    expect(resolveEffectiveTheme("system")).toBe("light");

    systemPrefersDark = true;
    expect(resolveEffectiveTheme("system")).toBe("dark");
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

  test("setThemePreference persists system and applies effective theme", () => {
    systemPrefersDark = true;

    expect(setThemePreference("system")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(html.dataset.theme).toBe("dark");
  });

  test("applies preference when storage is unavailable", () => {
    storageWriteFails = true;

    expect(setThemePreference("dark")).toBe("dark");
    expect(html.dataset.theme).toBe("dark");
  });
});

describe("pre-paint theme script", () => {
  const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/);

  function runPrePaintScript(stored: string | null, matches: boolean, storageThrows = false) {
    const documentElement = { dataset: {} as Record<string, string> };
    const localStorage = {
      getItem(key: string) {
        expect(key).toBe(THEME_STORAGE_KEY);
        if (storageThrows) throw new Error("Access denied");
        return stored;
      },
    };
    const window = {
      localStorage,
      matchMedia(query: string) {
        expect(query).toBe("(prefers-color-scheme: dark)");
        return { matches };
      },
    };

    expect(scriptMatch).not.toBeNull();
    new Function("window", "document", "localStorage", scriptMatch![1])(window, { documentElement }, localStorage);

    return documentElement.dataset.theme;
  }

  test("runs before the module script", () => {
    expect(indexHtml.indexOf("<script>")).toBeLessThan(indexHtml.indexOf('<script type="module"'));
  });

  test("applies stored preference before React loads", () => {
    expect(runPrePaintScript("dark", false)).toBe("dark");
  });

  test("falls back to system preference when unset", () => {
    expect(runPrePaintScript(null, true)).toBe("dark");
  });

  test("falls back to system preference when storage is unavailable", () => {
    expect(runPrePaintScript(null, true, true)).toBe("dark");
  });
});
