import { describe, expect, test } from "bun:test";
import { DEFAULT_INTERVAL, DEFAULT_RANGE, DEFAULT_TICKER, MAJOR_INDEX_SYMBOLS } from "../src/constants";

describe("shared defaults", () => {
  test("uses full-history daily AAPL as the default chart request", () => {
    expect(DEFAULT_TICKER).toBe("AAPL");
    expect(DEFAULT_RANGE).toBe("max");
    expect(DEFAULT_INTERVAL).toBe("1d");
  });

  test("keeps major US indexes in benchmark order", () => {
    expect(MAJOR_INDEX_SYMBOLS).toEqual(["^GSPC", "^DJI", "^IXIC"]);
  });
});
