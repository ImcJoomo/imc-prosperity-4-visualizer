import { Button, Group, NumberInput, Select, Slider, SliderProps, Text, Title } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { TimestampDetail } from './TimestampDetail.tsx';
import { VisualizerCard } from './VisualizerCard.tsx';

type TradeJumpType = 'any' | 'own-buy' | 'own-sell' | 'other';

export function TimestampsCard(): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const chartCache = algorithm.chartCache;
  const followDetail = useStore(state => state.visualizerFollowTimestampDetail);
  const externalDetailTs = useStore(state => state.visualizerDetailTimestamp);
  const clickedTs = useStore(state => state.visualizerClickedTimestamp);
  const setFollowDetail = useStore(state => state.setVisualizerFollowTimestampDetail);

  const rowsByTimestamp = useMemo(() => {
    if (chartCache) {
      return chartCache.rowsByTimestamp;
    }

    return Object.fromEntries(algorithm.data.map(row => [row.state.timestamp, row]));
  }, [algorithm, chartCache]);

  const timestampMin = chartCache?.timestampMin ?? algorithm.data[0].state.timestamp;
  const timestampMax = chartCache?.timestampMax ?? algorithm.data[algorithm.data.length - 1].state.timestamp;
  const timestampStep = chartCache?.timestampStep ?? (() => {
    if (algorithm.data.length < 2) return 1;
    let minDiff = Infinity;
    for (let i = 1; i < algorithm.data.length; i++) {
      const diff = algorithm.data[i].state.timestamp - algorithm.data[i - 1].state.timestamp;
      if (diff > 0 && diff < minDiff) minDiff = diff;
    }
    return minDiff === Infinity ? 1 : minDiff;
  })();

  const [timestamp, setTimestamp] = useState(timestampMin);
  const [inputValue, setInputValue] = useState<number | string>(timestampMin);
  const [tradeJumpType, setTradeJumpType] = useState<TradeJumpType>('any');
  const [tradeJumpSymbol, setTradeJumpSymbol] = useState<string>('any');

  useEffect(() => {
    setInputValue(timestamp);
  }, [timestamp]);

  const marks: SliderProps['marks'] = [];
  for (let i = timestampMin; i < timestampMax; i += (timestampMax + 100) / 4) {
    marks.push({
      value: i,
      label: formatNumber(i),
    });
  }

  const snapToNearest = useCallback(
    (value: number): number => {
      const clamped = Math.max(timestampMin, Math.min(timestampMax, value));
      return Math.round((clamped - timestampMin) / timestampStep) * timestampStep + timestampMin;
    },
    [timestampMin, timestampMax, timestampStep],
  );

  const tradeJumpSymbolOptions = useMemo(() => {
    const symbols = new Set<string>();
    for (const trade of algorithm.tradeHistory) {
      symbols.add(trade.symbol);
    }
    for (const row of algorithm.data) {
      for (const tradesBySymbol of [row.state.ownTrades, row.state.marketTrades]) {
        for (const [symbol, trades] of Object.entries(tradesBySymbol)) {
          if (trades.length > 0) {
            symbols.add(symbol);
          }
        }
      }
    }

    return [
      { value: 'any', label: 'Any symbol' },
      ...[...symbols].sort((a, b) => a.localeCompare(b)).map(symbol => ({ value: symbol, label: symbol })),
    ];
  }, [algorithm]);

  useEffect(() => {
    if (tradeJumpSymbol === 'any') {
      return;
    }
    if (!tradeJumpSymbolOptions.some(option => option.value === tradeJumpSymbol)) {
      setTradeJumpSymbol('any');
    }
  }, [tradeJumpSymbol, tradeJumpSymbolOptions]);

  const tradeTimestamps = useMemo(() => {
    const values = new Set<number>();
    const add = (value: number, symbol: string, type: Exclude<TradeJumpType, 'any'>): void => {
      if (!Number.isFinite(value) || (tradeJumpSymbol !== 'any' && symbol !== tradeJumpSymbol)) {
        return;
      }
      if (tradeJumpType !== 'any' && tradeJumpType !== type) {
        return;
      }
      const snapped = snapToNearest(value);
      if (rowsByTimestamp[snapped]) {
        values.add(snapped);
      }
    };

    for (const trade of algorithm.tradeHistory) {
      const type = trade.buyer.includes('SUBMISSION')
        ? 'own-buy'
        : trade.seller.includes('SUBMISSION')
          ? 'own-sell'
          : 'other';
      add(trade.timestamp, trade.symbol, type);
    }

    for (const row of algorithm.data) {
      for (const trades of Object.values(row.state.ownTrades)) {
        for (const trade of trades) {
          const type = trade.buyer.includes('SUBMISSION') ? 'own-buy' : 'own-sell';
          add(trade.timestamp, trade.symbol, type);
        }
      }
      for (const trades of Object.values(row.state.marketTrades)) {
        for (const trade of trades) {
          add(trade.timestamp, trade.symbol, 'other');
        }
      }
    }

    return [...values].sort((a, b) => a - b);
  }, [algorithm, rowsByTimestamp, snapToNearest, tradeJumpSymbol, tradeJumpType]);

  const previousTradeTimestamp = useMemo(() => {
    for (let i = tradeTimestamps.length - 1; i >= 0; i--) {
      if (tradeTimestamps[i] < timestamp) {
        return tradeTimestamps[i];
      }
    }
    return null;
  }, [timestamp, tradeTimestamps]);

  const nextTradeTimestamp = useMemo(() => {
    for (const tradeTimestamp of tradeTimestamps) {
      if (tradeTimestamp > timestamp) {
        return tradeTimestamp;
      }
    }
    return null;
  }, [timestamp, tradeTimestamps]);

  const moveToTimestamp = useCallback(
    (value: number): void => {
      setFollowDetail(false);
      setTimestamp(value);
      setInputValue(value);
    },
    [setFollowDetail],
  );

  useEffect(() => {
    if (!followDetail || externalDetailTs === null) {
      return;
    }
    const snapped = snapToNearest(externalDetailTs);
    setTimestamp(snapped);
    setInputValue(snapped);
  }, [followDetail, externalDetailTs, snapToNearest]);

  useEffect(() => {
    if (clickedTs === null) {
      return;
    }
    const snapped = snapToNearest(clickedTs);
    setTimestamp(snapped);
    setInputValue(snapped);
  }, [clickedTs, snapToNearest]);

  function commit(): void {
    const parsed = typeof inputValue === 'number' ? inputValue : Number(inputValue);
    if (!isNaN(parsed)) {
      setFollowDetail(false);
      setTimestamp(snapToNearest(parsed));
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') commit();
  }

  useHotkeys([
    [
      'ArrowLeft',
      () => {
        setFollowDetail(false);
        setTimestamp(timestamp === timestampMin ? timestamp : timestamp - timestampStep);
      },
    ],
    [
      'ArrowRight',
      () => {
        setFollowDetail(false);
        setTimestamp(timestamp === timestampMax ? timestamp : timestamp + timestampStep);
      },
    ],
  ]);

  return (
    <VisualizerCard>
      <Group align="center" gap="xs" mb="xs">
        <Title order={4}>Timestamps</Title>
        <NumberInput
          value={inputValue}
          onChange={value => {
            setInputValue(value);
            if (typeof value === 'number' && snapToNearest(value) === value) {
              setFollowDetail(false);
              setTimestamp(value);
            }
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          min={timestampMin}
          max={timestampMax}
          step={timestampStep}
          style={{ width: 150 }}
          styles={{ input: { fontWeight: 700, fontSize: 'var(--mantine-font-size-sm)' } }}
        />
        <Select
          aria-label="Trade jump symbol"
          size="xs"
          w={190}
          searchable
          data={tradeJumpSymbolOptions}
          value={tradeJumpSymbol}
          onChange={value => setTradeJumpSymbol(value ?? 'any')}
        />
        <Select
          aria-label="Trade jump type"
          size="xs"
          w={140}
          data={[
            { value: 'any', label: 'Any trade' },
            { value: 'own-buy', label: 'Own buy' },
            { value: 'own-sell', label: 'Own sell' },
            { value: 'other', label: 'Other trade' },
          ]}
          value={tradeJumpType}
          onChange={value => setTradeJumpType((value ?? 'any') as TradeJumpType)}
        />
        <Button
          size="compact-xs"
          variant="light"
          disabled={previousTradeTimestamp === null}
          onClick={() => previousTradeTimestamp !== null && moveToTimestamp(previousTradeTimestamp)}
        >
          Prev trade
        </Button>
        <Button
          size="compact-xs"
          variant="light"
          disabled={nextTradeTimestamp === null}
          onClick={() => nextTradeTimestamp !== null && moveToTimestamp(nextTradeTimestamp)}
        >
          Next trade
        </Button>
        <Text size="xs" c="dimmed">
          {formatNumber(tradeTimestamps.length)} trade timestamps
        </Text>
      </Group>

      <Slider
        min={timestampMin}
        max={timestampMax}
        step={timestampStep}
        marks={marks}
        label={value => `Timestamp ${formatNumber(value)}`}
        value={timestamp}
        onChange={v => {
          setFollowDetail(false);
          setTimestamp(v);
        }}
        mb="lg"
      />

      {rowsByTimestamp[timestamp] ? (
        <TimestampDetail row={rowsByTimestamp[timestamp]} />
      ) : (
        <Text>No logs found for timestamp {formatNumber(timestamp)}</Text>
      )}
    </VisualizerCard>
  );
}
