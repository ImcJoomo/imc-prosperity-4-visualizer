import Highcharts from 'highcharts';

export type DeltaValueMode = 'raw' | 'percent';

export function deltaModeSuffix(mode: DeltaValueMode): string {
  return mode === 'percent' ? ' (% vs prior)' : '';
}

function stepDelta(mode: DeltaValueMode, prevY: number, y: number): number | null {
  if (mode === 'raw') {
    return y - prevY;
  }
  const denom = Math.abs(prevY);
  if (denom === 0 || !Number.isFinite(denom) || !Number.isFinite(y) || !Number.isFinite(prevY)) {
    return null;
  }
  return ((y - prevY) / denom) * 100;
}

export function aggregateSumByX(points: [number, number][]): [number, number][] {
  const map = new Map<number, number>();
  for (const [x, y] of points) {
    map.set(x, (map.get(x) ?? 0) + y);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function deltaXYSeries(
  points: [number, number][],
  mode: DeltaValueMode = 'raw',
): [number, number | null][] {
  const sorted = aggregateSumByX(points);
  const result: [number, number | null][] = [];
  let prevY: number | undefined;
  for (const [x, y] of sorted) {
    if (prevY === undefined) {
      result.push([x, null]);
    } else {
      result.push([x, stepDelta(mode, prevY, y)]);
    }
    prevY = y;
  }
  return result;
}

export function deltaXYSeriesVolume(
  points: [number, number][],
  mode: DeltaValueMode = 'raw',
): [number, number][] {
  const sorted = aggregateSumByX(points);
  const result: [number, number][] = [];
  let prevY: number | undefined;
  for (const [x, y] of sorted) {
    if (prevY === undefined) {
      result.push([x, 0]);
    } else {
      const d = stepDelta(mode, prevY, y);
      result.push([x, d === null ? 0 : d]);
    }
    prevY = y;
  }
  return result;
}

export type CandleTuple = [number, number, number, number, number];

export function deltaCandlestickVsPrevClose(
  candles: CandleTuple[],
  mode: DeltaValueMode = 'raw',
): CandleTuple[] {
  if (candles.length === 0) {
    return [];
  }
  const sorted = [...candles].sort((a, b) => a[0] - b[0]);
  const out: CandleTuple[] = [];
  let prevClose: number | undefined;
  for (const [t, o, h, l, c] of sorted) {
    if (prevClose === undefined) {
      out.push([t, o, h, l, c]);
    } else if (mode === 'raw') {
      out.push([t, o - prevClose, h - prevClose, l - prevClose, c - prevClose]);
    } else {
      const denom = Math.abs(prevClose);
      if (denom === 0 || !Number.isFinite(denom)) {
        out.push([t, o, h, l, c]);
      } else {
        const k = 100 / prevClose;
        out.push([
          t,
          (o - prevClose) * k,
          (h - prevClose) * k,
          (l - prevClose) * k,
          (c - prevClose) * k,
        ]);
      }
    }
    prevClose = c;
  }
  return out;
}

export function deltaScatterPoints(
  points: Highcharts.PointOptionsObject[],
  mode: DeltaValueMode = 'raw',
): Highcharts.PointOptionsObject[] {
  const sorted = [...points].sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0));
  let prevY: number | undefined;
  return sorted.map(p => {
    const y = Number(p.y);
    if (Number.isNaN(y)) {
      return p;
    }
    if (prevY === undefined) {
      prevY = y;
      return { ...p, y: null };
    }
    const d = stepDelta(mode, prevY, y);
    prevY = y;
    return { ...p, y: d };
  });
}

export function applyDeltaToOrdersSeries(
  series: Highcharts.SeriesOptionsType[],
  mode: DeltaValueMode = 'raw',
): Highcharts.SeriesOptionsType[] {
  return series.map(s => {
    if (!('data' in s) || !Array.isArray(s.data) || s.data.length === 0) {
      return s;
    }
    if (s.type === 'scatter') {
      return { ...s, data: deltaScatterPoints(s.data as Highcharts.PointOptionsObject[], mode) };
    }
    return { ...s, data: deltaXYSeries(s.data as [number, number][], mode) };
  }) as Highcharts.SeriesOptionsType[];
}
