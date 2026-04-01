import { SegmentedControl, Stack } from '@mantine/core';
import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { ProsperitySymbol } from '../../models.ts';
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

    const microPriceData: [number, number][] = [];
    const bid1Data: [number, number][] = [];
    const bid2Data: [number, number][] = [];
    const bid3Data: [number, number][] = [];
    const ask1Data: [number, number][] = [];
    const ask2Data: [number, number][] = [];
    const ask3Data: [number, number][] = [];

    for (const row of algorithm.activityLogs) {
      if (row.product !== symbol) continue;

      microPriceData.push([row.timestamp, nPrice(row.timestamp, row.microPrice)]);

      if (row.bidPrices.length >= 1) bid1Data.push([row.timestamp, nPrice(row.timestamp, row.bidPrices[0])]);
      if (row.bidPrices.length >= 2) bid2Data.push([row.timestamp, nPrice(row.timestamp, row.bidPrices[1])]);
      if (row.bidPrices.length >= 3) bid3Data.push([row.timestamp, nPrice(row.timestamp, row.bidPrices[2])]);
      if (row.askPrices.length >= 1) ask1Data.push([row.timestamp, nPrice(row.timestamp, row.askPrices[0])]);
      if (row.askPrices.length >= 2) ask2Data.push([row.timestamp, nPrice(row.timestamp, row.askPrices[1])]);
      if (row.askPrices.length >= 3) ask3Data.push([row.timestamp, nPrice(row.timestamp, row.askPrices[2])]);
    }

    const filledBuyData: Highcharts.PointOptionsObject[] = [];
    const filledSellData: Highcharts.PointOptionsObject[] = [];
    const otherTradeData: Highcharts.PointOptionsObject[] = [];

    for (const trade of algorithm.tradeHistory) {
      if (trade.symbol !== symbol) continue;
      if (!qtyOk(trade.quantity)) continue;

      const point: Highcharts.PointOptionsObject = {
        x: trade.timestamp,
        y: nPrice(trade.timestamp, trade.price),
        custom: { quantity: trade.quantity, buyer: trade.buyer, seller: trade.seller },
      };

      if (trade.buyer.includes('SUBMISSION')) {
        if (showOwnTrades) filledBuyData.push(point);
      } else if (trade.seller.includes('SUBMISSION')) {
        if (showOwnTrades) filledSellData.push(point);
      } else if (showOtherTrades) {
        otherTradeData.push(point);
      }
    }

    const unfilledBuyData: Highcharts.PointOptionsObject[] = [];
    const unfilledSellData: Highcharts.PointOptionsObject[] = [];

    for (const row of algorithm.data) {
      const orders = row.orders[symbol];
      if (!orders) continue;

      for (const order of orders) {
        const q = Math.abs(order.quantity);
        if (!qtyOk(q)) continue;

        const point: Highcharts.PointOptionsObject = {
          x: row.state.timestamp,
          y: nPrice(row.state.timestamp, order.price),
          custom: { quantity: q },
        };

        if (order.quantity > 0) {
          unfilledBuyData.push(point);
        } else if (order.quantity < 0) {
          unfilledSellData.push(point);
        }
      }
    }

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
    algorithm,
    symbol,
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
