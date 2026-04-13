import Highcharts from 'highcharts';
import { ReactNode, useMemo } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { buildBaselineLookup, normalizationDeltaAxisTitle, normalizePoint } from '../../utils/priceNormalization.ts';
import { Chart } from './Chart.tsx';

export interface ConversionPriceChartProps {
  symbol: ProsperitySymbol;
}

export function ConversionPriceChart({ symbol }: ConversionPriceChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const symbolCache = algorithm.chartCache?.bySymbol[symbol];
  const normEnabled = useStore(state => state.visualizerPriceNormalization);
  const normRef = useStore(state => state.visualizerNormalizationReference);
  const serverData = useServerChartData<{ series: { bid: [number, number][]; ask: [number, number][] } }>(
    'conversion',
    { symbol },
    [symbol],
  );

  const baseline = useMemo(
    () => buildBaselineLookup(algorithm, symbol, normRef),
    [algorithm, symbol, normRef],
  );

  const { series, options, title } = useMemo(() => {
    const nPrice = (ts: number, y: number): number => {
      if (!normEnabled) {
        return y;
      }
      return normalizePoint(baseline, ts, y) ?? y;
    };

    const bidPriceData = (serverData.data?.series.bid ?? symbolCache?.conversion.bid ?? []).map(([timestamp, value]) => [
      timestamp,
      nPrice(timestamp, value),
    ]);
    const askPriceData = (serverData.data?.series.ask ?? symbolCache?.conversion.ask ?? []).map(([timestamp, value]) => [
      timestamp,
      nPrice(timestamp, value),
    ]);

    const nextSeries: Highcharts.SeriesOptionsType[] = [
      { type: 'line', name: 'Bid', color: getBidColor(1.0), marker: { symbol: 'triangle' }, data: bidPriceData },
      { type: 'line', name: 'Ask', color: getAskColor(1.0), marker: { symbol: 'triangle-down' }, data: askPriceData },
    ];

    const yAxisTitle = normEnabled ? normalizationDeltaAxisTitle(normRef) : undefined;

    const nextOptions: Highcharts.Options = {
      yAxis: {
        opposite: true,
        allowDecimals: true,
        ...(yAxisTitle ? { title: { text: yAxisTitle } } : {}),
      },
    };

    const nextTitle = normEnabled ? `${symbol} - Conversion price (normalized)` : `${symbol} - Conversion price`;

    return { series: nextSeries, options: nextOptions, title: nextTitle };
  }, [normEnabled, normRef, baseline, symbol, symbolCache, serverData.data]);

  return <Chart title={title} options={options} series={series} />;
}
