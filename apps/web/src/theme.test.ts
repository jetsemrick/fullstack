import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { applyTheme, getResolvedTheme, getStoredTheme, setTheme } from "./theme";

const store = new Map<string, string>();

beforeAll(() => {
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  } as Storage;

  const root = { dataset: {} as DOMStringMap };
  globalThis.document = { documentElement: root } as Document;
});

afterEach(() => {
  store.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme", () => {
  test("setTheme persists and applies data-theme", () => {
    setTheme("dark");
    expect(getStoredTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getResolvedTheme()).toBe("dark");
  });

  test("applyTheme with null removes data-theme", () => {
    setTheme("light");
    applyTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test("toggle between light and dark", () => {
    setTheme("light");
    expect(getResolvedTheme()).toBe("light");
    setTheme("dark");
    expect(getResolvedTheme()).toBe("dark");
  });
});
