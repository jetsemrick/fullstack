import { describe, expect, test } from "bun:test";
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  parseStoredTheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from "./theme";

describe("parseStoredTheme", () => {
  test("accepts light, dark, and system", () => {
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("system")).toBe("system");
  });

  test("falls back to system when unset or invalid", () => {
    expect(parseStoredTheme(null)).toBe("system");
    expect(parseStoredTheme("")).toBe("system");
    expect(parseStoredTheme("sepia")).toBe("system");
  });
});

describe("resolveTheme", () => {
  test("explicit light and dark ignore the OS", () => {
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

  test("writeStoredTheme persists the preference", () => {
    const written: Record<string, string> = {};
    writeStoredTheme("light", {
      setItem(key, value) {
        written[key] = value;
      },
    });
    expect(written[THEME_STORAGE_KEY]).toBe("light");
  });

  test("writeStoredTheme ignores storage failures", () => {
    expect(() =>
      writeStoredTheme("dark", {
        setItem() {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});

describe("applyThemeToDocument", () => {
  test("sets data-theme to the preference and color-scheme to the resolved value", () => {
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    const resolved = applyThemeToDocument("system", true, {
      setAttribute(name, value) {
        attrs[name] = value;
      },
      style,
    });
    expect(resolved).toBe("dark");
    expect(attrs["data-theme"]).toBe("system");
    expect(style.colorScheme).toBe("dark");
  });
});
