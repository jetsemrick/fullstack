import { describe, expect, test } from "bun:test";
import { parseThemeMode, resolveTheme, THEME_STORAGE_KEY } from "./theme";

describe("parseThemeMode", () => {
  test("accepts light, dark, and system", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("system")).toBe("system");
  });

  test("defaults missing or unknown values to system", () => {
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode("")).toBe("system");
    expect(parseThemeMode("Dim")).toBe("system");
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
    expect(html).toContain("root.dataset.theme = resolved");
  });
});
