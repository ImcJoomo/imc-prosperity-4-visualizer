import { Group, NumberInput, Slider, SliderProps, Text, Title } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { TimestampDetail } from './TimestampDetail.tsx';
import { VisualizerCard } from './VisualizerCard.tsx';

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
