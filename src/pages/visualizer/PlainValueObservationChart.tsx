import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { Chart } from './Chart.tsx';

export interface PlainValueObservationChartProps {
  symbol: ProsperitySymbol;
}

export function PlainValueObservationChart({ symbol }: PlainValueObservationChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const serverData = useServerChartData<{ series: { value: [number, number][] } }>('plain', { symbol }, [symbol]);
  const values = serverData.data?.series.value ?? algorithm.chartCache?.bySymbol[symbol]?.plainValueObservation ?? [];

  const options: Highcharts.Options = {
    yAxis: {
      allowDecimals: true,
    },
  };

  const series: Highcharts.SeriesOptionsType[] = [{ type: 'line', name: 'Value', data: values }];

  return <Chart title={`${symbol} - Plain value observation`} options={options} series={series} />;
}
