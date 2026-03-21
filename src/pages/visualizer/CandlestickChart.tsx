import { Select } from '@mantine/core';
import Highcharts from 'highcharts';
import { ReactNode, useState } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { Chart } from './Chart.tsx';

export interface CandlestickChartProps {
  symbol: ProsperitySymbol;
}

const GROUP_SIZE_OPTIONS = [
  { value: '1', label: '1 tick' },
  { value: '5', label: '5 ticks' },
  { value: '10', label: '10 ticks' },
  { value: '25', label: '25 ticks' },
  { value: '50', label: '50 ticks' },
  { value: '100', label: '100 ticks' },
];

function defaultGroupSize(timestampCount: number): string {
  if (timestampCount >= 10000) return '100';
  return '10';
}

export function CandlestickChart({ symbol }: CandlestickChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const rows = algorithm.activityLogs.filter(row => row.product === symbol);
  const [groupSize, setGroupSize] = useState(() => defaultGroupSize(rows.length));
  const size = parseInt(groupSize);

  const candleData: [number, number, number, number, number][] = [];

  for (let i = 0; i < rows.length; i += size) {
    const group = rows.slice(i, i + size);
    if (group.length === 0) continue;

    const timestamp = group[0].timestamp;
    const open = group[0].midPrice;
    const close = group[group.length - 1].midPrice;

    let high = -Infinity;
    let low = Infinity;

    for (const row of group) {
      if (row.askPrices.length > 0) high = Math.max(high, row.askPrices[0]);
      high = Math.max(high, row.midPrice);
      if (row.bidPrices.length > 0) low = Math.min(low, row.bidPrices[0]);
      low = Math.min(low, row.midPrice);
    }

    candleData.push([timestamp, open, high, low, close]);
  }

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'candlestick',
      name: symbol,
      data: candleData,
      color: getAskColor(1.0),
      upColor: getBidColor(1.0),
      lineColor: getAskColor(1.0),
      upLineColor: getBidColor(1.0),
      dataGrouping: { enabled: false },
    } as Highcharts.SeriesCandlestickOptions,
  ];

  const controls = (
    <Select
      label="Candle size"
      data={GROUP_SIZE_OPTIONS}
      value={groupSize}
      onChange={val => val && setGroupSize(val)}
      size="xs"
      w={120}
    />
  );

  return <Chart title={`${symbol} - Price Movement`} series={series} controls={controls} />;
}
