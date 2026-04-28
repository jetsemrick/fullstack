import { describe, expect, test } from "bun:test";
import { pickFavoriteTickers } from "../src/favoritesPick";

describe("pickFavoriteTickers", () => {
  test("returns five distinct symbols excluding main ticker when possible", () => {
    const picked = pickFavoriteTickers("AAPL", 5, 42_001);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    expect(picked.includes("AAPL")).toBe(false);
  });

  test("is deterministic given the same inputs", () => {
    const a = pickFavoriteTickers("MSFT", 5, 99);
    const b = pickFavoriteTickers("MSFT", 5, 99);
    expect(a).toEqual(b);
  });
});
