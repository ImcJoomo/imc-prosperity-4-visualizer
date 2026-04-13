import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { Chart } from './Chart.tsx';

export interface TransportChartProps {
  symbol: ProsperitySymbol;
}

export function TransportChart({ symbol }: TransportChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const symbolCache = algorithm.chartCache?.bySymbol[symbol];
  const serverData = useServerChartData<{
    series: { transportFees: [number, number][]; importTariff: [number, number][]; exportTariff: [number, number][] };
  }>('transport', { symbol }, [symbol]);
  const transportFeesData = serverData.data?.series.transportFees ?? symbolCache?.conversion.transportFees ?? [];
  const importTariffData = serverData.data?.series.importTariff ?? symbolCache?.conversion.importTariff ?? [];
  const exportTariffData = serverData.data?.series.exportTariff ?? symbolCache?.conversion.exportTariff ?? [];

  const series: Highcharts.SeriesOptionsType[] = [
    { type: 'line', name: 'Transport fees', data: transportFeesData },
    { type: 'line', name: 'Import tariff', marker: { symbol: 'triangle' }, data: importTariffData },
    { type: 'line', name: 'Export tariff', marker: { symbol: 'triangle-down' }, data: exportTariffData },
  ];

  return <Chart title={`${symbol} - Transport`} series={series} />;
}
