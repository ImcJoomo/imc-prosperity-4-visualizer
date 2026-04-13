import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { Chart } from './Chart.tsx';

export interface EnvironmentChartProps {
  symbol: ProsperitySymbol;
}

export function EnvironmentChart({ symbol }: EnvironmentChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const symbolCache = algorithm.chartCache?.bySymbol[symbol];
  const serverData = useServerChartData<{ series: { sugarPrice: [number, number][]; sunlightIndex: [number, number][] } }>(
    'environment',
    { symbol },
    [symbol],
  );
  const sugarPriceData = serverData.data?.series.sugarPrice ?? symbolCache?.conversion.sugarPrice ?? [];
  const sunlightIndexData = serverData.data?.series.sunlightIndex ?? symbolCache?.conversion.sunlightIndex ?? [];

  const series: Highcharts.SeriesOptionsType[] = [
    { type: 'line', name: 'Sugar Price', marker: { symbol: 'square' }, yAxis: 0, data: sugarPriceData },
    { type: 'line', name: 'Sunlight Index', marker: { symbol: 'circle' }, yAxis: 1, data: sunlightIndexData },
  ];

  const options: Highcharts.Options = {
    yAxis: [{}, { opposite: true }],
  };

  return <Chart title={`${symbol} - Environment`} options={options} series={series} />;
}
