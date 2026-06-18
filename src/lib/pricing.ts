import { config } from "./config";

export type DealTier = "hot" | "good" | "normal";

/**
 * Add estimated baggage surcharge to a base round-trip price. Estimates are per
 * direction and doubled for the round trip. Real prices vary by airline/fare —
 * the UI labels this as an estimate.
 */
export function withBaggage(
  basePrice: number,
  opts: { checkedBag?: boolean; trolley?: boolean },
): number {
  let total = basePrice;
  if (opts.checkedBag) total += config.baggage.checkedBagPerLeg * 2;
  if (opts.trolley) total += config.baggage.trolleyPerLeg * 2;
  return Math.round(total);
}

/**
 * Classify how good a price is for its destination. Uses the destination's
 * historical median when we have enough samples, plus absolute price ceilings so
 * genuinely cheap fares always stand out even with little history.
 */
export function dealTier(
  price: number,
  stats: { median: number | null; samples: number },
): DealTier {
  const h = config.hotness;
  if (price <= h.absoluteHotCeiling) return "hot";

  if (stats.median && stats.samples >= h.minSamples) {
    if (price <= stats.median * h.hotRatio) return "hot";
    if (price <= stats.median * h.goodRatio) return "good";
  }

  if (price <= h.absoluteGoodCeiling) return "good";
  return "normal";
}

/** Percentage below the destination median (0–100), or null when unknown. */
export function discountPct(
  price: number,
  stats: { median: number | null; samples: number },
): number | null {
  if (!stats.median || stats.samples < config.hotness.minSamples) return null;
  if (price >= stats.median) return 0;
  return Math.round((1 - price / stats.median) * 100);
}
