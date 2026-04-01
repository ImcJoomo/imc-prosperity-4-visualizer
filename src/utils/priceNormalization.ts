import { Algorithm, OrderDepth } from '../models.ts';

export type NormalizationReference = 'micro' | 'mid' | 'wall_mid' | string;

export const WALL_MID_REFERENCE = 'wall_mid' as const;

export const MICRO_PRICE_REFERENCE = 'micro' as const;

export function wallMidFromOrderDepth(depth: OrderDepth): number | undefined {
  const buys = Object.entries(depth.buyOrders);
  const sells = Object.entries(depth.sellOrders);
  if (buys.length === 0 || sells.length === 0) {
    return undefined;
  }

  let bwPrice = Number(buys[0][0]);
  let bwVol = buys[0][1];
  for (const [p, v] of buys) {
    if (v > bwVol) {
      bwVol = v;
      bwPrice = Number(p);
    }
  }

  let awPrice = Number(sells[0][0]);
  let awVol = sells[0][1];
  for (const [p, v] of sells) {
    if (v < awVol) {
      awVol = v;
      awPrice = Number(p);
    }
  }

  return (bwPrice + awPrice) / 2;
}

function baselineFromForwardFilledPairs(pairs: [number, number][]): (timestamp: number) => number | undefined {
  return ts => {
    let lo = 0;
    let hi = pairs.length - 1;
    let best: number | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = pairs[mid][0];
      if (t <= ts) {
        best = pairs[mid][1];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  };
}

export function normalizationDeltaAxisTitle(reference: NormalizationReference): string {
  if (reference === MICRO_PRICE_REFERENCE || reference === 'mid') {
    return 'Δ vs activity log micro-price';
  }
  if (reference === WALL_MID_REFERENCE) {
    return 'Δ vs wall mid';
  }
  return `Δ vs ${reference}`;
}

export function collectPlainValueObservationKeys(algorithm: Algorithm): string[] {
  const keys = new Set<string>();
  for (const row of algorithm.data) {
    for (const k of Object.keys(row.state.observations.plainValueObservations)) {
      keys.add(k);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function buildBaselineLookup(
  algorithm: Algorithm,
  symbol: string,
  reference: NormalizationReference,
): (timestamp: number) => number | undefined {
  if (reference === MICRO_PRICE_REFERENCE || reference === 'mid') {
    const map = new Map<number, number>();
    for (const row of algorithm.activityLogs) {
      if (row.product === symbol) {
        map.set(row.timestamp, row.microPrice);
      }
    }
    return ts => map.get(ts);
  }

  if (reference === WALL_MID_REFERENCE) {
    const pairs: [number, number][] = [];
    let last: number | undefined;
    for (const row of algorithm.data) {
      const depth = row.state.orderDepths[symbol];
      if (depth) {
        const wm = wallMidFromOrderDepth(depth);
        if (wm !== undefined) {
          last = wm;
        }
      }
      if (last !== undefined) {
        pairs.push([row.state.timestamp, last]);
      }
    }
    return baselineFromForwardFilledPairs(pairs);
  }

  const pairs: [number, number][] = [];
  let last: number | undefined;
  for (const row of algorithm.data) {
    const v = row.state.observations.plainValueObservations[reference];
    if (v !== undefined) {
      last = v;
    }
    if (last !== undefined) {
      pairs.push([row.state.timestamp, last]);
    }
  }

  return baselineFromForwardFilledPairs(pairs);
}

export function normalizePoint(
  baseline: (timestamp: number) => number | undefined,
  timestamp: number,
  value: number,
): number | undefined {
  const b = baseline(timestamp);
  if (b === undefined) return undefined;
  return value - b;
}
