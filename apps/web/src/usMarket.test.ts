import { describe, expect, test } from "bun:test";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

describe("regularSessionDomainUtcMs", () => {
  test("returns regular session bounds during Eastern Standard Time", () => {
    expect(regularSessionDomainUtcMs(Date.UTC(2024, 0, 2, 17, 0))).toEqual([
      Date.UTC(2024, 0, 2, 14, 30),
      Date.UTC(2024, 0, 2, 21, 0),
    ]);
  });

  test("returns regular session bounds during Eastern Daylight Time", () => {
    expect(regularSessionDomainUtcMs(Date.UTC(2024, 5, 3, 17, 0))).toEqual([
      Date.UTC(2024, 5, 3, 13, 30),
      Date.UTC(2024, 5, 3, 20, 0),
    ]);
  });
});

describe("hourlySessionTicksUtcMs", () => {
  test("returns hourly ticks within the supplied session", () => {
    const open = Date.UTC(2024, 5, 3, 13, 30);
    const close = Date.UTC(2024, 5, 3, 20, 0);

    expect(hourlySessionTicksUtcMs(open, close)).toEqual([
      Date.UTC(2024, 5, 3, 14, 0),
      Date.UTC(2024, 5, 3, 15, 0),
      Date.UTC(2024, 5, 3, 16, 0),
      Date.UTC(2024, 5, 3, 17, 0),
      Date.UTC(2024, 5, 3, 18, 0),
      Date.UTC(2024, 5, 3, 19, 0),
      Date.UTC(2024, 5, 3, 20, 0),
    ]);
  });
});
