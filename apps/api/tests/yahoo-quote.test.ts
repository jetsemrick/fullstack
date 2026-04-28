import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseQuoteResponse } from "../src/yahoo-quote";

describe("parseQuoteResponse", () => {
  test("parses Yahoo v7 benchmark quote fixture", async () => {
    const path = join(import.meta.dir, "fixtures", "minimal-quote.json");
    const raw = await Bun.file(path).text();
    const body = JSON.parse(raw) as unknown;
    const out = parseQuoteResponse(body);
    expect(out.errorMessage).toBeNull();
    expect(out.marketState).toBe("REGULAR");
    expect(out.indexes).toHaveLength(3);
    expect(out.indexes[0]?.symbol).toBe("^GSPC");
    expect(out.indexes[1]?.symbol).toBe("^DJI");
    expect(out.indexes[2]?.symbol).toBe("^IXIC");
  });
});
