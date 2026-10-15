import { describe, it, expect } from "vitest";
import { formatCents } from "../src/lib/money";

describe("formatCents", () => {
  it("formats integer cents into standard USD currency string", () => {
    expect(formatCents(6594)).toBe("$65.94");
    expect(formatCents(100)).toBe("$1.00");
    expect(formatCents(99)).toBe("$0.99");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("handles null or undefined gracefully", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });
});
