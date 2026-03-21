import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { Chart } from './Chart.tsx';

export interface OrdersChartProps {
  symbol: ProsperitySymbol;
}

export function OrdersChart({ symbol }: OrdersChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const filledBuyData: Highcharts.PointOptionsObject[] = [];
  const unfilledBuyData: Highcharts.PointOptionsObject[] = [];
  const filledSellData: Highcharts.PointOptionsObject[] = [];
  const unfilledSellData: Highcharts.PointOptionsObject[] = [];
  const midPriceData: [number, number][] = [];

  for (const row of algorithm.activityLogs) {
    if (row.product !== symbol) {
      continue;
    }
    midPriceData.push([row.timestamp, row.midPrice]);
  }

  // Orders placed at timestamp T appear in ownTrades at timestamp T+100 (next row),
  // with trade.timestamp == T. Check fills per-row using the immediately next row's
  // ownTrades to avoid cross-day timestamp collisions in multi-day rounds.
  for (let i = 0; i < algorithm.data.length; i++) {
    const row = algorithm.data[i];
    const orders = row.orders[symbol];
    if (!orders) {
      continue;
    }

    const nextOwnTrades = algorithm.data[i + 1]?.state.ownTrades[symbol] ?? [];
    const filledBuyPrices = new Set<number>();
    const filledSellPrices = new Set<number>();

    for (const trade of nextOwnTrades) {
      if (trade.timestamp !== row.state.timestamp) {
        continue;
      }
      if (trade.buyer === 'SUBMISSION') {
        filledBuyPrices.add(trade.price);
      }
      if (trade.seller === 'SUBMISSION') {
        filledSellPrices.add(trade.price);
      }
    }

    for (const order of orders) {
      const point: Highcharts.PointOptionsObject = {
        x: row.state.timestamp,
        y: order.price,
        custom: { quantity: Math.abs(order.quantity) },
      };

      if (order.quantity > 0) {
        (filledBuyPrices.has(order.price) ? filledBuyData : unfilledBuyData).push(point);
      } else if (order.quantity < 0) {
        (filledSellPrices.has(order.price) ? filledSellData : unfilledSellData).push(point);
      }
    }
  }

  const buyTooltip: Highcharts.SeriesTooltipOptionsObject = {
    pointFormatter(this: Highcharts.Point) {
      const qty = (this as any).custom?.quantity;
      return `<span style="color:${this.color}">▲</span> Buy: <b>${this.y}</b> (qty: ${qty})<br/>`;
    },
  };

  const sellTooltip: Highcharts.SeriesTooltipOptionsObject = {
    pointFormatter(this: Highcharts.Point) {
      const qty = (this as any).custom?.quantity;
      return `<span style="color:${this.color}">▼</span> Sell: <b>${this.y}</b> (qty: ${qty})<br/>`;
    },
  };

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'line',
      name: 'Mid price',
      color: 'gray',
      dashStyle: 'Dash',
      data: midPriceData,
      marker: { enabled: false },
      enableMouseTracking: false,
    },
    {
      type: 'scatter',
      name: 'Buy (filled)',
      color: getBidColor(1.0),
      data: filledBuyData,
      marker: { symbol: 'triangle', radius: 6 },
      tooltip: buyTooltip,
    },
    {
      type: 'scatter',
      name: 'Buy (unfilled)',
      color: getBidColor(0.3),
      data: unfilledBuyData,
      marker: { symbol: 'triangle', radius: 4 },
      tooltip: buyTooltip,
    },
    {
      type: 'scatter',
      name: 'Sell (filled)',
      color: getAskColor(1.0),
      data: filledSellData,
      marker: { symbol: 'triangle-down', radius: 6 },
      tooltip: sellTooltip,
    },
    {
      type: 'scatter',
      name: 'Sell (unfilled)',
      color: getAskColor(0.3),
      data: unfilledSellData,
      marker: { symbol: 'triangle-down', radius: 4 },
      tooltip: sellTooltip,
    },
  ];

  return <Chart title={`${symbol} - Orders`} series={series} />;
}
