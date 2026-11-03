import { describe, expect, test } from "bun:test";
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  parseThemePreference,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from "./theme";

describe("parseThemePreference", () => {
  test("accepts light, dark, and system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  test("defaults missing or unknown values to system", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
    expect(parseThemePreference("Dim")).toBe("system");
  });
});

describe("resolveTheme", () => {
  test("explicit modes ignore the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("system follows prefers-color-scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("storage helpers", () => {
  test("readStoredTheme uses the shared key and falls back", () => {
    const storage = {
      getItem(key: string) {
        expect(key).toBe(THEME_STORAGE_KEY);
        return "dark";
      },
    };
    expect(readStoredTheme(storage)).toBe("dark");
    expect(
      readStoredTheme({
        getItem() {
          throw new Error("blocked");
        },
      }),
    ).toBe("system");
  });

  test("writeStoredTheme persists an explicit choice", () => {
    const written: Record<string, string> = {};
    writeStoredTheme("light", {
      setItem(key, value) {
        written[key] = value;
      },
      removeItem() {
        throw new Error("should not remove");
      },
    });
    expect(written[THEME_STORAGE_KEY]).toBe("light");
  });

  test("writeStoredTheme clears storage for system", () => {
    const removed: string[] = [];
    writeStoredTheme("system", {
      setItem() {
        throw new Error("should not set");
      },
      removeItem(key) {
        removed.push(key);
      },
    });
    expect(removed).toEqual([THEME_STORAGE_KEY]);
  });

  test("writeStoredTheme ignores storage failures so listeners can still attach", () => {
    expect(() =>
      writeStoredTheme("dark", {
        setItem() {
          throw new Error("blocked");
        },
        removeItem() {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});

describe("applyThemeToDocument", () => {
  function fakeRoot() {
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    return {
      attrs,
      style,
      root: {
        setAttribute(name: string, value: string) {
          attrs[name] = value;
        },
        removeAttribute(name: string) {
          delete attrs[name];
        },
        style,
      },
    };
  }

  test("explicit dark sets data-theme and color-scheme", () => {
    const { attrs, style, root } = fakeRoot();
    expect(applyThemeToDocument("dark", false, root)).toBe("dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(style.colorScheme).toBe("dark");
  });

  test("system leaves data-theme unset so CSS can follow prefers-color-scheme", () => {
    const { attrs, style, root } = fakeRoot();
    expect(applyThemeToDocument("system", true, root)).toBe("dark");
    expect(attrs["data-theme"]).toBeUndefined();
    expect(style.colorScheme).toBe("dark");
  });
});

describe("theme boot script", () => {
  test("index.html applies the stored theme before the app module loads", async () => {
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const scriptAt = html.indexOf("localStorage.getItem");
    const rootAt = html.indexOf('id="root"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(rootAt).toBeGreaterThan(scriptAt);
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(html).toContain('stored === "light"');
    expect(html).toContain('stored === "dark"');
    expect(html).toContain('stored === "system"');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("colorScheme");
  });
});
