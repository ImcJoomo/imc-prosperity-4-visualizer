import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
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

  const positions = algorithm.data.map(row => row.state.position[symbol] || 0);
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

  const { series, title, min, max } = useMemo(() => {
    const limits: Record<string, number> = {};
    for (const symbol of symbols) {
      limits[symbol] = getLimit(algorithm, symbol);
    }

    const data: Record<string, [number, number][]> = {};
    for (const symbol of symbols) {
      data[symbol] = [];
    }

    for (const row of algorithm.data) {
      for (const symbol of symbols) {
        const position = row.state.position[symbol] || 0;
        data[symbol].push([row.state.timestamp, (position / limits[symbol]) * 100]);
      }
    }

    const nextSeries: Highcharts.SeriesOptionsType[] = symbols.map((symbol, i) => ({
      type: 'line',
      name: symbol,
      data: deltaEnabled ? deltaXYSeries(data[symbol], deltaValueMode) : data[symbol],
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
  }, [algorithm, symbols, deltaEnabled, deltaValueMode]);

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
