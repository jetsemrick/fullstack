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
    const classes = new Set<string>();
    const style = { colorScheme: "" };
    return {
      classes,
      style,
      root: {
        classList: {
          add(...tokens: string[]) {
            for (const token of tokens) classes.add(token);
          },
          remove(...tokens: string[]) {
            for (const token of tokens) classes.delete(token);
          },
        },
        style,
      },
    };
  }

  test("explicit dark sets the .dark class and color-scheme", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("dark", false, root)).toBe("dark");
    expect([...classes]).toEqual(["dark"]);
    expect(style.colorScheme).toBe("dark");
  });

  test("explicit light sets the .light class so OS dark does not win", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("light", true, root)).toBe("light");
    expect([...classes]).toEqual(["light"]);
    expect(style.colorScheme).toBe("light");
  });

  test("system leaves html without .dark/.light so CSS can follow prefers-color-scheme", () => {
    const { classes, style, root } = fakeRoot();
    expect(applyThemeToDocument("system", true, root)).toBe("dark");
    expect([...classes]).toEqual([]);
    expect(style.colorScheme).toBe("dark");
  });
});

describe("theme boot script", () => {
  test("index.html applies the stored theme class before the app module loads", async () => {
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
    expect(html).toContain('classList.add("dark")');
    expect(html).toContain('classList.add("light")');
    expect(html).toContain("colorScheme");
  });
});

describe("SpaceXSI light tokens", () => {
  test("light :root uses the final muted / event-div / up / down inks", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    const root = css.slice(css.indexOf(":root"), css.indexOf("html.dark"));
    expect(root).toMatch(/--fg-muted:\s*#5f6368/);
    expect(root).toMatch(/--event-div:\s*#b84300/);
    expect(root).toMatch(/--up:\s*#137638/);
    expect(root).toMatch(/--down:\s*#b81e1e/);
    expect(root).not.toMatch(/--fg-muted:\s*#676a6f/);
    expect(root).not.toMatch(/--fg-muted:\s*#3c4553/);
    expect(root).not.toMatch(/--fg-muted:\s*#7d8187/);
    expect(root).not.toContain("--muted-fg");
    expect(root).not.toMatch(/--up:\s*#15803d/);
    expect(root).not.toMatch(/--down:\s*#dc2626/);
  });

  test("dark muted is #9a9ea5, not fog, and event-div is sunset", async () => {
    const css = await Bun.file(new URL("./index.css", import.meta.url)).text();
    const dark = css.slice(css.indexOf("html.dark"), css.indexOf("@media"));
    expect(dark).toMatch(/--fg-muted:\s*#9a9ea5/);
    expect(dark).toMatch(/--event-div:\s*#ff6308/);
    expect(dark).toMatch(/--up:\s*#4ade80/);
    expect(dark).toMatch(/--down:\s*#e66565/);
    expect(dark).not.toMatch(/--fg-muted:\s*#7d8187/);
    expect(dark).not.toContain("--muted-fg");
  });
});
