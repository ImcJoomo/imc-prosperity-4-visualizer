import type { Algorithm } from '../models.ts';

export function collectAllProductKeysForVisibility(algorithm: Algorithm): string[] {
  if (algorithm.chartCache) {
    return [...new Set([...algorithm.chartCache.listingSymbols, ...algorithm.chartCache.plainValueObservationSymbols])]
      .sort((a, b) => a.localeCompare(b));
  }

  const keys = new Set<string>();
  for (let i = 0; i < algorithm.data.length; i += 1000) {
    const row = algorithm.data[i];
    for (const k of Object.keys(row.state.listings)) {
      keys.add(k);
    }
    for (const k of Object.keys(row.state.observations.plainValueObservations)) {
      keys.add(k);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function hiddenSymbolsForIncludedProducts(algorithm: Algorithm, includedProducts: string[]): string[] {
  const keep = new Set(includedProducts);
  return collectAllProductKeysForVisibility(algorithm).filter(k => !keep.has(k));
}
