import { describe, expect, it } from "vitest";

import { calculateEarningsCents } from "@/server/services/payout";

describe("payout math — floor(views / 1000) * payout_per_1k_views_cents", () => {
  it("floors partial thousands to zero", () => {
    expect(calculateEarningsCents(0, 150)).toBe(0);
    expect(calculateEarningsCents(1, 150)).toBe(0);
    expect(calculateEarningsCents(999, 150)).toBe(0);
  });

  it("ticks exactly at each full thousand", () => {
    expect(calculateEarningsCents(1000, 150)).toBe(150);
    expect(calculateEarningsCents(1999, 150)).toBe(150);
    expect(calculateEarningsCents(2000, 150)).toBe(300);
  });

  it("stays exact at realistic magnitudes (integer cents, no floats)", () => {
    // 250M views at $20.00/1k = $5,000,000.00
    expect(calculateEarningsCents(250_000_000, 2000)).toBe(500_000_000);
    expect(Number.isInteger(calculateEarningsCents(123_456_789, 137))).toBe(
      true,
    );
  });

  it("rejects invalid inputs loudly rather than mis-paying", () => {
    expect(() => calculateEarningsCents(-1, 100)).toThrow();
    expect(() => calculateEarningsCents(10.5, 100)).toThrow();
    expect(() => calculateEarningsCents(1000, 0)).toThrow();
    expect(() => calculateEarningsCents(1000, -100)).toThrow();
    expect(() => calculateEarningsCents(1000, 1.5)).toThrow();
  });
});
