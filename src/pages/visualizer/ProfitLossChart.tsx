import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
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
  const serverData = useServerChartData<{ series: { total: [number, number][]; bySymbol: Record<string, [number, number][]> } }>(
    'profit-loss',
    { symbols: symbols.join(',') },
    [symbols.join(',')],
  );

  const series = useMemo((): Highcharts.SeriesOptionsType[] => {
    const totalTuples = serverData.data?.series.total ?? algorithm.chartCache?.totalProfitLoss ?? [];

    const nextSeries: Highcharts.SeriesOptionsType[] = [
      {
        type: 'line',
        name: 'Total',
        data: deltaEnabled ? deltaXYSeries(totalTuples, deltaValueMode) : totalTuples,
      },
    ];

    symbols.forEach(symbol => {
      const symTuples =
        serverData.data?.series.bySymbol[symbol] ?? algorithm.chartCache?.bySymbol[symbol]?.profitLoss ?? aggregateSumByX([]);
      nextSeries.push({
        type: 'line',
        name: symbol,
        data: deltaEnabled ? deltaXYSeries(symTuples, deltaValueMode) : symTuples,
        dashStyle: 'Dash',
      });
    });

    return nextSeries;
  }, [algorithm, symbols, deltaEnabled, deltaValueMode, serverData.data]);

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
