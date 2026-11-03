import { describe, expect, test } from "bun:test";
import { splitMatches } from "./typeahead";

describe("splitMatches", () => {
  test("marks case-insensitive matches of each query word", () => {
    expect(splitMatches("NVIDIA Corporation", "nvidia corp")).toEqual([
      { text: "NVIDIA", match: true },
      { text: " ", match: false },
      { text: "Corp", match: true },
      { text: "oration", match: false },
    ]);
  });

  test("treats regex characters in the query literally", () => {
    expect(splitMatches("AT&T Inc. (US)", "(us")).toEqual([
      { text: "AT&T Inc. ", match: false },
      { text: "(US", match: true },
      { text: ")", match: false },
    ]);
  });

  test("returns one unmatched run when nothing matches", () => {
    expect(splitMatches("Apple Inc.", "zzz")).toEqual([{ text: "Apple Inc.", match: false }]);
    expect(splitMatches("Apple Inc.", "   ")).toEqual([{ text: "Apple Inc.", match: false }]);
  });
});
