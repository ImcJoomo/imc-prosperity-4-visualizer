import { SegmentedControl, Stack } from '@mantine/core';
import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { useServerChartData } from '../../hooks/use-server-chart-data.ts';
import { CachedOrderPoint, ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { buildBaselineLookup, normalizationDeltaAxisTitle, normalizePoint } from '../../utils/priceNormalization.ts';
import { applyDeltaToOrdersSeries, deltaModeSuffix, type DeltaValueMode } from '../../utils/seriesDelta.ts';
import { Chart } from './Chart.tsx';
import { ChartDeltaBar } from './ChartDeltaBar.tsx';

export interface OrdersChartProps {
  symbol: ProsperitySymbol;
}

export function OrdersChart({ symbol }: OrdersChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const symbolCache = algorithm.chartCache?.bySymbol[symbol];
  const normEnabled = useStore(state => state.visualizerPriceNormalization);
  const normRef = useStore(state => state.visualizerNormalizationReference);
  const tradeQtyMin = useStore(state => state.visualizerTradeQtyMin);
  const tradeQtyMax = useStore(state => state.visualizerTradeQtyMax);
  const showOwnTrades = useStore(state => state.visualizerOrdersShowOwnTrades);
  const showOtherTrades = useStore(state => state.visualizerOrdersShowOtherTrades);
  const showUnfilledBuys = useStore(state => state.visualizerOrdersShowUnfilledBuys);
  const showUnfilledSells = useStore(state => state.visualizerOrdersShowUnfilledSells);
  const [deltaEnabled, setDeltaEnabled] = useState(false);
  const [deltaValueMode, setDeltaValueMode] = useState<DeltaValueMode>('raw');

  const [priceMode, setPriceMode] = useState<'micro' | 'bidask'>('micro');
  const serverData = useServerChartData<{
    series: {
      micro: [number, number][];
      bid1: [number, number][];
      bid2: [number, number][];
      bid3: [number, number][];
      ask1: [number, number][];
      ask2: [number, number][];
      ask3: [number, number][];
      filledBuy: CachedOrderPoint[];
      filledSell: CachedOrderPoint[];
      other: CachedOrderPoint[];
      orderBuy: CachedOrderPoint[];
      orderSell: CachedOrderPoint[];
    };
  }>('orders', { symbol, priceMode, qtyMin: tradeQtyMin, qtyMax: tradeQtyMax }, [
    symbol,
    priceMode,
    tradeQtyMin,
    tradeQtyMax,
  ]);

  const baseline = useMemo(
    () => buildBaselineLookup(algorithm, symbol, normRef),
    [algorithm, symbol, normRef],
  );

  const { series, chartOptions, chartTitle } = useMemo(() => {
    const nPrice = (ts: number, y: number): number => {
      if (!normEnabled) {
        return y;
      }
      return normalizePoint(baseline, ts, y) ?? y;
    };

    const qtyOk = (q: number): boolean => {
      if (tradeQtyMin != null && q < tradeQtyMin) {
        return false;
      }
      if (tradeQtyMax != null && q > tradeQtyMax) {
        return false;
      }
      return true;
    };

    const mapXYSeries = (points: [number, number][]): [number, number][] =>
      points.map(([timestamp, value]) => [timestamp, nPrice(timestamp, value)]);

    const mapScatterSeries = (points: CachedOrderPoint[]): Highcharts.PointOptionsObject[] =>
      points
        .filter(point => qtyOk(point.quantity))
        .map(point => ({
          x: point.x,
          y: nPrice(point.x, point.y),
          custom: { quantity: point.quantity, buyer: point.buyer, seller: point.seller },
        }));

    const remoteSeries = serverData.data?.series;
    const microPriceData = mapXYSeries(remoteSeries?.micro ?? symbolCache?.priceLevels.micro ?? []);
    const bid1Data = mapXYSeries(remoteSeries?.bid1 ?? symbolCache?.priceLevels.bid[0] ?? []);
    const bid2Data = mapXYSeries(remoteSeries?.bid2 ?? symbolCache?.priceLevels.bid[1] ?? []);
    const bid3Data = mapXYSeries(remoteSeries?.bid3 ?? symbolCache?.priceLevels.bid[2] ?? []);
    const ask1Data = mapXYSeries(remoteSeries?.ask1 ?? symbolCache?.priceLevels.ask[0] ?? []);
    const ask2Data = mapXYSeries(remoteSeries?.ask2 ?? symbolCache?.priceLevels.ask[1] ?? []);
    const ask3Data = mapXYSeries(remoteSeries?.ask3 ?? symbolCache?.priceLevels.ask[2] ?? []);

    const filledBuyData = showOwnTrades ? mapScatterSeries(remoteSeries?.filledBuy ?? symbolCache?.trades.filledBuy ?? []) : [];
    const filledSellData = showOwnTrades ? mapScatterSeries(remoteSeries?.filledSell ?? symbolCache?.trades.filledSell ?? []) : [];
    const otherTradeData = showOtherTrades ? mapScatterSeries(remoteSeries?.other ?? symbolCache?.trades.other ?? []) : [];
    const unfilledBuyData = showUnfilledBuys ? mapScatterSeries(remoteSeries?.orderBuy ?? symbolCache?.orders.buy ?? []) : [];
    const unfilledSellData = showUnfilledSells ? mapScatterSeries(remoteSeries?.orderSell ?? symbolCache?.orders.sell ?? []) : [];

    const filledBuyTooltip: Highcharts.SeriesTooltipOptionsObject = {
      pointFormatter(this: Highcharts.Point) {
        const { quantity, buyer, seller } = (this as any).custom ?? {};
        return `<span style="color:${this.color}">▲</span> Buy (filled): <b>${this.y}</b> (qty: ${quantity}, buyer: ${buyer}, seller: ${seller})<br/>`;
      },
    };

    const filledSellTooltip: Highcharts.SeriesTooltipOptionsObject = {
      pointFormatter(this: Highcharts.Point) {
        const { quantity, buyer, seller } = (this as any).custom ?? {};
        return `<span style="color:${this.color}">▼</span> Sell (filled): <b>${this.y}</b> (qty: ${quantity}, buyer: ${buyer}, seller: ${seller})<br/>`;
      },
    };

    const unfilledBuyTooltip: Highcharts.SeriesTooltipOptionsObject = {
      pointFormatter(this: Highcharts.Point) {
        const qty = (this as any).custom?.quantity;
        return `<span style="color:${this.color}">▲</span> Buy (order): <b>${this.y}</b> (qty: ${qty})<br/>`;
      },
    };

    const unfilledSellTooltip: Highcharts.SeriesTooltipOptionsObject = {
      pointFormatter(this: Highcharts.Point) {
        const qty = (this as any).custom?.quantity;
        return `<span style="color:${this.color}">▼</span> Sell (order): <b>${this.y}</b> (qty: ${qty})<br/>`;
      },
    };

    const otherTradeTooltip: Highcharts.SeriesTooltipOptionsObject = {
      pointFormatter(this: Highcharts.Point) {
        const { quantity, buyer, seller } = (this as any).custom ?? {};
        return `<span style="color:${this.color}">◆</span> Trade: <b>${this.y}</b> (qty: ${quantity}, buyer: ${buyer}, seller: ${seller})<br/>`;
      },
    };

    const priceSeries: Highcharts.SeriesOptionsType[] =
      priceMode === 'micro'
        ? [
            {
              type: 'line',
              name: 'Micro-price',
              color: 'gray',
              dashStyle: 'Dash',
              data: microPriceData,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
          ]
        : [
            {
              type: 'line',
              name: 'Bid 3',
              color: getBidColor(0.5),
              data: bid3Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
            {
              type: 'line',
              name: 'Bid 2',
              color: getBidColor(0.75),
              data: bid2Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
            {
              type: 'line',
              name: 'Bid 1',
              color: getBidColor(1.0),
              data: bid1Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
            {
              type: 'line',
              name: 'Ask 1',
              color: getAskColor(1.0),
              data: ask1Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
            {
              type: 'line',
              name: 'Ask 2',
              color: getAskColor(0.75),
              data: ask2Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
            {
              type: 'line',
              name: 'Ask 3',
              color: getAskColor(0.5),
              data: ask3Data,
              marker: { enabled: false },
              enableMouseTracking: false,
            },
          ];

    const nextSeries: Highcharts.SeriesOptionsType[] = [
      ...priceSeries,
      {
        type: 'scatter',
        name: 'Buy (filled)',
        color: getBidColor(1.0),
        data: filledBuyData,
        marker: { symbol: 'triangle', radius: 6 },
        tooltip: filledBuyTooltip,
        dataGrouping: { enabled: false },
        visible: showOwnTrades,
      },
      {
        type: 'scatter',
        name: 'Buy (order)',
        color: getBidColor(0.3),
        data: unfilledBuyData,
        marker: { symbol: 'triangle', radius: 4 },
        tooltip: unfilledBuyTooltip,
        dataGrouping: { enabled: false },
        visible: showUnfilledBuys,
      },
      {
        type: 'scatter',
        name: 'Sell (filled)',
        color: getAskColor(1.0),
        data: filledSellData,
        marker: { symbol: 'triangle-down', radius: 6 },
        tooltip: filledSellTooltip,
        dataGrouping: { enabled: false },
        visible: showOwnTrades,
      },
      {
        type: 'scatter',
        name: 'Sell (order)',
        color: getAskColor(0.3),
        data: unfilledSellData,
        marker: { symbol: 'triangle-down', radius: 4 },
        tooltip: unfilledSellTooltip,
        dataGrouping: { enabled: false },
        visible: showUnfilledSells,
      },
      {
        type: 'scatter',
        name: 'Other trades',
        color: '#a855f7',
        data: otherTradeData,
        marker: { symbol: 'diamond', radius: 6 },
        tooltip: otherTradeTooltip,
        dataGrouping: { enabled: false },
        visible: showOtherTrades,
      },
    ];

    const finalSeries = deltaEnabled ? applyDeltaToOrdersSeries(nextSeries, deltaValueMode) : nextSeries;

    const deltaSuffix = deltaEnabled ? ' (Δ)' : '';
    const nextTitle = `${normEnabled ? `${symbol} - Order Book (normalized)` : `${symbol} - Order Book`}${deltaSuffix}`;

    const yParts: string[] = [];
    if (normEnabled) {
      yParts.push(normalizationDeltaAxisTitle(normRef));
    }
    if (deltaEnabled) {
      yParts.push(`step Δ (time-ordered)${deltaModeSuffix(deltaValueMode)}`);
    }
    const nextOptions: Highcharts.Options | undefined =
      yParts.length > 0
        ? {
            yAxis: {
              title: { text: yParts.join(' · ') },
              allowDecimals: true,
            },
          }
        : undefined;

    return { series: finalSeries, chartOptions: nextOptions, chartTitle: nextTitle };
  }, [
    priceMode,
    normEnabled,
    normRef,
    baseline,
    tradeQtyMin,
    tradeQtyMax,
    showOwnTrades,
    showOtherTrades,
    showUnfilledBuys,
    showUnfilledSells,
    deltaEnabled,
    deltaValueMode,
    symbolCache,
    serverData.data,
  ]);

  const controls = (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        value={priceMode}
        onChange={value => setPriceMode(value as 'micro' | 'bidask')}
        data={[
          { label: 'Micro-price', value: 'micro' },
          { label: 'Bid/Ask', value: 'bidask' },
        ]}
      />
      <ChartDeltaBar
        enabled={deltaEnabled}
        onEnabledChange={setDeltaEnabled}
        valueMode={deltaValueMode}
        onValueModeChange={setDeltaValueMode}
      />
    </Stack>
  );

  return <Chart title={chartTitle} series={series} options={chartOptions} controls={controls} />;
}
