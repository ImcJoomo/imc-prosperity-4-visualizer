import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { useStore } from '../../store.ts';
import { aggregateSumByX, type DeltaValueMode, deltaXYSeries } from '../../utils/seriesDelta.ts';
import { Chart } from './Chart.tsx';
import { ChartDeltaBar } from './ChartDeltaBar.tsx';

export interface ProfitLossChartProps {
  symbols: string[];
}

export function ProfitLossChart({ symbols }: ProfitLossChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const [deltaEnabled, setDeltaEnabled] = useState(false);
  const [deltaValueMode, setDeltaValueMode] = useState<DeltaValueMode>('raw');

  const series = useMemo((): Highcharts.SeriesOptionsType[] => {
    const dataByTimestamp = new Map<number, number>();
    for (const row of algorithm.activityLogs) {
      if (!dataByTimestamp.has(row.timestamp)) {
        dataByTimestamp.set(row.timestamp, row.profitLoss);
      } else {
        dataByTimestamp.set(row.timestamp, dataByTimestamp.get(row.timestamp)! + row.profitLoss);
      }
    }

    const sortedTs = [...dataByTimestamp.keys()].sort((a, b) => a - b);
    const totalTuples: [number, number][] = sortedTs.map(t => [t, dataByTimestamp.get(t)!]);

    const nextSeries: Highcharts.SeriesOptionsType[] = [
      {
        type: 'line',
        name: 'Total',
        data: deltaEnabled ? deltaXYSeries(totalTuples, deltaValueMode) : totalTuples,
      },
    ];

    symbols.forEach(symbol => {
      const symMap = new Map<number, number>();
      for (const row of algorithm.activityLogs) {
        if (row.product === symbol) {
          symMap.set(row.timestamp, (symMap.get(row.timestamp) ?? 0) + row.profitLoss);
        }
      }
      const symTuples = aggregateSumByX([...symMap.entries()]);
      nextSeries.push({
        type: 'line',
        name: symbol,
        data: deltaEnabled ? deltaXYSeries(symTuples, deltaValueMode) : symTuples,
        dashStyle: 'Dash',
      });
    });

    return nextSeries;
  }, [algorithm, symbols, deltaEnabled, deltaValueMode]);

  const title = deltaEnabled
    ? deltaValueMode === 'percent'
      ? 'Profit / Loss (Δ% vs prior tick)'
      : 'Profit / Loss (Δ per tick)'
    : 'Profit / Loss';

  return (
    <Chart
      title={title}
      series={series}
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
