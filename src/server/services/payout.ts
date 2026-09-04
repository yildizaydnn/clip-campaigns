/**
 * Earnings for an approved submission, in integer cents:
 *   floor(views / 1000) * payout_per_1k_views_cents
 *
 * Pure and total — no I/O, no floats, no rounding modes to argue about.
 * Math.floor on the division of two non-negative integers is exact here;
 * realistic magnitudes (views < 2^31, payout in cents) stay far below
 * Number.MAX_SAFE_INTEGER.
 */
export function calculateEarningsCents(
  views: number,
  payoutPer1kViewsCents: number,
): number {
  if (!Number.isInteger(views) || views < 0)
    throw new Error(`views must be a non-negative integer, got ${views}`);
  if (!Number.isInteger(payoutPer1kViewsCents) || payoutPer1kViewsCents <= 0)
    throw new Error(
      `payoutPer1kViewsCents must be a positive integer, got ${payoutPer1kViewsCents}`,
    );
  return Math.floor(views / 1000) * payoutPer1kViewsCents;
}
