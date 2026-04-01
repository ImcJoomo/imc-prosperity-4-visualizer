export function microPriceFromTopOfBook(
  bidPrices: number[],
  bidVolumes: number[],
  askPrices: number[],
  askVolumes: number[],
  fallback: number,
): number {
  const pb = bidPrices[0];
  const pa = askPrices[0];
  const vb = bidVolumes[0];
  const va = askVolumes[0];
  if (
    pb === undefined ||
    pa === undefined ||
    vb === undefined ||
    va === undefined ||
    !Number.isFinite(pb) ||
    !Number.isFinite(pa) ||
    !Number.isFinite(vb) ||
    !Number.isFinite(va)
  ) {
    return Number.isFinite(fallback) ? fallback : 0;
  }
  const denom = vb + va;
  if (denom <= 0) {
    const mid = (pb + pa) / 2;
    return Number.isFinite(mid) ? mid : (Number.isFinite(fallback) ? fallback : 0);
  }
  const micro = (vb * pa + va * pb) / denom;
  return Number.isFinite(micro) ? micro : (Number.isFinite(fallback) ? fallback : 0);
}
