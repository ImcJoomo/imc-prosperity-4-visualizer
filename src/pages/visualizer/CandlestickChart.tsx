import { Group, SegmentedControl, Select, Stack } from '@mantine/core';
import Highcharts from 'highcharts';
import { ReactNode, useMemo, useState } from 'react';
import { ActivityLogRow, ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { buildBaselineLookup, normalizationDeltaAxisTitle, normalizePoint } from '../../utils/priceNormalization.ts';
import {
  deltaCandlestickVsPrevClose,
  deltaModeSuffix,
  type DeltaValueMode,
  deltaXYSeries,
  deltaXYSeriesVolume,
} from '../../utils/seriesDelta.ts';
import { Chart } from './Chart.tsx';
import { ChartDeltaBar } from './ChartDeltaBar.tsx';

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

type ViewMode = 'movement' | 'price' | 'volume';

export function CandlestickChart({ symbol }: CandlestickChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const normEnabled = useStore(state => state.visualizerPriceNormalization);
  const normRef = useStore(state => state.visualizerNormalizationReference);
  const [deltaEnabled, setDeltaEnabled] = useState(false);
  const [deltaValueMode, setDeltaValueMode] = useState<DeltaValueMode>('raw');
  const [viewMode, setViewMode] = useState<ViewMode>('movement');

  const rows = algorithm.activityLogs.filter(row => row.product === symbol);
  const [groupSize, setGroupSize] = useState(() => defaultGroupSize(rows.length));
  const size = parseInt(groupSize);

  const baseline = useMemo(
    () => buildBaselineLookup(algorithm, symbol, normRef),
    [algorithm, symbol, normRef],
  );

  const { series, title, chartOptions } = useMemo(() => {
    const applyPrice = (row: ActivityLogRow, v: number): number => {
      if (!normEnabled || viewMode === 'volume') {
        return v;
      }
      return normalizePoint(baseline, row.timestamp, v) ?? v;
    };

    let nextSeries: Highcharts.SeriesOptionsType[] = [];
    let nextTitle = '';
    let nextOptions: Highcharts.Options | undefined;

    const normSuffix = normEnabled && viewMode !== 'volume' ? ' (normalized)' : '';
    const deltaSuffix = deltaEnabled ? ' (Δ)' : '';
    let yTitle =
      normEnabled && viewMode !== 'volume' ? normalizationDeltaAxisTitle(normRef) : undefined;
    if (deltaEnabled) {
      const pct = deltaModeSuffix(deltaValueMode);
      const deltaHint =
        viewMode === 'movement'
          ? `Δ vs prev close (1st bar: levels)${pct}`
          : viewMode === 'price'
            ? `Step Δ${pct}`
            : `Volume step Δ${pct}`;
      yTitle = yTitle ? `${yTitle} · ${deltaHint}` : deltaHint;
    }

    if (yTitle) {
      nextOptions = {
        yAxis: { title: { text: yTitle }, allowDecimals: viewMode !== 'volume' },
      };
    }

    if (viewMode === 'movement') {
      nextTitle = `${symbol} - Price Movement${normSuffix}${deltaSuffix}`;
      const candleData: [number, number, number, number, number][] = [];

      for (let i = 0; i < rows.length; i += size) {
        const group = rows.slice(i, i + size);
        if (group.length === 0) continue;

        const timestamp = group[0].timestamp;
        const open = applyPrice(group[0], group[0].microPrice);
        const close = applyPrice(group[group.length - 1], group[group.length - 1].microPrice);

        let high = -Infinity;
        let low = Infinity;

        for (const row of group) {
          if (row.askPrices.length > 0) {
            high = Math.max(high, applyPrice(row, row.askPrices[0]));
          }
          high = Math.max(high, applyPrice(row, row.microPrice));
          if (row.bidPrices.length > 0) {
            low = Math.min(low, applyPrice(row, row.bidPrices[0]));
          }
          low = Math.min(low, applyPrice(row, row.microPrice));
        }

        candleData.push([timestamp, open, high, low, close]);
      }

      const candlePoints = deltaEnabled
        ? deltaCandlestickVsPrevClose(candleData, deltaValueMode)
        : candleData;

      nextSeries = [
        {
          type: 'candlestick',
          name: symbol,
          data: candlePoints,
          color: getAskColor(1.0),
          upColor: getBidColor(1.0),
          lineColor: getAskColor(1.0),
          upLineColor: getBidColor(1.0),
          dataGrouping: { enabled: false },
        } as Highcharts.SeriesCandlestickOptions,
      ];
    } else if (viewMode === 'price') {
      nextTitle = `${symbol} - Price${normSuffix}${deltaSuffix}`;
      const priceSeries: Highcharts.SeriesOptionsType[] = [
        { type: 'line', name: 'Bid 3', color: getBidColor(0.5), marker: { symbol: 'square' }, data: [] },
        { type: 'line', name: 'Bid 2', color: getBidColor(0.75), marker: { symbol: 'circle' }, data: [] },
        { type: 'line', name: 'Bid 1', color: getBidColor(1.0), marker: { symbol: 'triangle' }, data: [] },
        { type: 'line', name: 'Micro-price', color: 'gray', dashStyle: 'Dash', marker: { symbol: 'diamond' }, data: [] },
        { type: 'line', name: 'Ask 1', color: getAskColor(1.0), marker: { symbol: 'triangle-down' }, data: [] },
        { type: 'line', name: 'Ask 2', color: getAskColor(0.75), marker: { symbol: 'circle' }, data: [] },
        { type: 'line', name: 'Ask 3', color: getAskColor(0.5), marker: { symbol: 'square' }, data: [] },
      ];

      for (const row of rows) {
        for (let i = 0; i < row.bidPrices.length; i++) {
          (priceSeries[2 - i] as { data: [number, number][] }).data.push([
            row.timestamp,
            applyPrice(row, row.bidPrices[i]),
          ]);
        }
        (priceSeries[3] as { data: [number, number][] }).data.push([row.timestamp, applyPrice(row, row.microPrice)]);
        for (let i = 0; i < row.askPrices.length; i++) {
          (priceSeries[i + 4] as { data: [number, number][] }).data.push([
            row.timestamp,
            applyPrice(row, row.askPrices[i]),
          ]);
        }
      }

      if (deltaEnabled) {
        nextSeries = (priceSeries as Highcharts.SeriesOptionsType[]).map(s => ({
          ...s,
          data: deltaXYSeries((s as { data: [number, number][] }).data, deltaValueMode),
        })) as Highcharts.SeriesOptionsType[];
      } else {
        nextSeries = priceSeries;
      }
    } else {
      nextTitle = `${symbol} - Volume${deltaSuffix}`;
      const volumeSeries: Highcharts.SeriesOptionsType[] = [
        { type: 'column', name: 'Bid 3', color: getBidColor(0.5), data: [] },
        { type: 'column', name: 'Bid 2', color: getBidColor(0.75), data: [] },
        { type: 'column', name: 'Bid 1', color: getBidColor(1.0), data: [] },
        { type: 'column', name: 'Ask 1', color: getAskColor(1.0), data: [] },
        { type: 'column', name: 'Ask 2', color: getAskColor(0.75), data: [] },
        { type: 'column', name: 'Ask 3', color: getAskColor(0.5), data: [] },
      ];

      for (const row of rows) {
        for (let i = 0; i < row.bidVolumes.length; i++) {
          (volumeSeries[2 - i] as { data: [number, number][] }).data.push([row.timestamp, row.bidVolumes[i]]);
        }
        for (let i = 0; i < row.askVolumes.length; i++) {
          (volumeSeries[i + 3] as { data: [number, number][] }).data.push([row.timestamp, row.askVolumes[i]]);
        }
      }

      if (deltaEnabled) {
        nextSeries = (volumeSeries as Highcharts.SeriesOptionsType[]).map(s => ({
          ...s,
          data: deltaXYSeriesVolume((s as { data: [number, number][] }).data, deltaValueMode),
        })) as Highcharts.SeriesOptionsType[];
      } else {
        nextSeries = volumeSeries;
      }
    }

    return { series: nextSeries, title: nextTitle, chartOptions: nextOptions };
  }, [rows, size, viewMode, symbol, normEnabled, normRef, baseline, deltaEnabled, deltaValueMode]);

  const controls = (
    <Stack gap="xs">
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={value => setViewMode(value as ViewMode)}
          data={[
            { label: 'Movement', value: 'movement' },
            { label: 'Price', value: 'price' },
            { label: 'Volume', value: 'volume' },
          ]}
        />
        {viewMode === 'movement' && (
          <Select
            label="Candle size"
            data={GROUP_SIZE_OPTIONS}
            value={groupSize}
            onChange={val => val && setGroupSize(val)}
            size="xs"
            w={120}
          />
        )}
      </Group>
      <ChartDeltaBar
        enabled={deltaEnabled}
        onEnabledChange={setDeltaEnabled}
        valueMode={deltaValueMode}
        onValueModeChange={setDeltaValueMode}
      />
    </Stack>
  );

  return <Chart title={title} series={series} options={chartOptions} controls={controls} />;
}
