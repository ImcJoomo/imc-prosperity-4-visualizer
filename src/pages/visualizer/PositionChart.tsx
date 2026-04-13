import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { Algorithm, ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { type DeltaValueMode, deltaXYSeries } from '../../utils/seriesDelta.ts';
import { Chart } from './Chart.tsx';
import { ChartDeltaBar } from './ChartDeltaBar.tsx';

function getLimit(algorithm: Algorithm, symbol: ProsperitySymbol): number {
  const knownLimits: Record<string, number> = {
    TOMATOES: 80,
    EMERALDS: 80
  };

  if (knownLimits[symbol] !== undefined) {
    return knownLimits[symbol];
  }

  // This code will be hit when a new product is added to the competition and the visualizer isn't updated yet
  // In that case the visualizer doesn't know the real limit yet, so we make a guess based on the algorithm's positions

  const positions = (algorithm.chartCache?.bySymbol[symbol]?.position ?? algorithm.data.map(row => [row.state.timestamp, row.state.position[symbol] || 0]))
    .map(([, position]) => position);
  const minPosition = Math.min(...positions);
  const maxPosition = Math.max(...positions);

  return Math.max(Math.abs(minPosition), maxPosition);
}

export interface PositionChartProps {
  symbols: string[];
}

export function PositionChart({ symbols }: PositionChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const [deltaEnabled, setDeltaEnabled] = useState(false);
  const [deltaValueMode, setDeltaValueMode] = useState<DeltaValueMode>('raw');
  const serverData = useServerChartData<{ series: { bySymbol: Record<string, [number, number][]> } }>(
    'position',
    { symbols: symbols.join(',') },
    [symbols.join(',')],
  );

  const { series, title, min, max } = useMemo(() => {
    const limits: Record<string, number> = {};
    for (const symbol of symbols) {
      limits[symbol] = getLimit(algorithm, symbol);
    }

    const nextSeries: Highcharts.SeriesOptionsType[] = symbols.map((symbol, i) => ({
      type: 'line',
      name: symbol,
      data: (() => {
        const sourcePoints =
          serverData.data?.series.bySymbol[symbol] ?? algorithm.chartCache?.bySymbol[symbol]?.position ?? [];
        const points = sourcePoints.map(([timestamp, position]) => [timestamp, (position / limits[symbol]) * 100]) as [
          number,
          number,
        ][];
        return deltaEnabled ? deltaXYSeries(points, deltaValueMode) : points;
      })(),
      colorIndex: (i + 1) % 10,
    }));

    return {
      series: nextSeries,
      title: deltaEnabled
        ? deltaValueMode === 'percent'
          ? 'Positions — Δ% vs prior step'
          : 'Positions — step Δ (pp of limit)'
        : 'Positions (% of limit)',
      min: deltaEnabled ? undefined : -100,
      max: deltaEnabled ? undefined : 100,
    };
  }, [algorithm, symbols, deltaEnabled, deltaValueMode, serverData.data]);

  return (
    <Chart
      title={title}
      series={series}
      min={min}
      max={max}
      controls={
        <ChartDeltaBar
          enabled={deltaEnabled}
          onEnabledChange={setDeltaEnabled}
          valueMode={deltaValueMode}
          onValueModeChange={setDeltaValueMode}
        />
      }
    />
  );
}
