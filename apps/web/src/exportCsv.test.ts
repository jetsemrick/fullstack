import { describe, expect, test } from "bun:test";
import type { GetPricesResponse } from "@stock/shared";
import { buildPricesCsv } from "./exportCsv";

describe("buildPricesCsv", () => {
  test("writes a UTF-8 CSV with UTC calendar dates", () => {
    const data: GetPricesResponse = {
      ticker: "AAPL",
      currency: "USD",
      lastPrice: 197.5,
      series: [
        { timestamp: 1_704_067_200, close: 185.64, volume: 52_000_000 },
        { timestamp: 1_704_153_600, close: 184.25, volume: null },
      ],
    };

    expect(buildPricesCsv(data)).toBe(
      "\uFEFFdate,close,volume,currency,symbol\r\n" +
        "2024-01-01,185.64,52000000,USD,AAPL\r\n" +
        "2024-01-02,184.25,,USD,AAPL",
    );
  });

  test("escapes fields containing commas, quotes, and line breaks", () => {
    const data: GetPricesResponse = {
      ticker: 'BRK"B\nX',
      currency: "US,D",
      lastPrice: null,
      series: [{ timestamp: 1_704_067_200, close: 1, volume: 2 }],
    };

    expect(buildPricesCsv(data)).toBe(
      "\uFEFFdate,close,volume,currency,symbol\r\n" + '2024-01-01,1,2,"US,D","BRK""B\nX"',
    );
  });
});
