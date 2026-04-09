import { Center, Container, Grid, Loader, Stack, Text, Title } from '@mantine/core';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getLog } from '../../api/logs.ts';
import { ParseSettingsModal } from '../../components/ParseSettingsModal.tsx';
import type { ResultLog } from '../../models.ts';
import { useStore } from '../../store.ts';
import { parseAlgorithmLogs } from '../../utils/algorithm.tsx';
import { shouldApplyAssetFilter } from '../../utils/resultLogAssetFilter.ts';
import { formatNumber } from '../../utils/format.ts';
import { AlgorithmSummaryCard } from './AlgorithmSummaryCard.tsx';
import { CandlestickChart } from './CandlestickChart.tsx';
import { ConversionPriceChart } from './ConversionPriceChart.tsx';
import { EnvironmentChart } from './EnvironmentChart.tsx';
import { OrdersChart } from './OrdersChart.tsx';
import { PlainValueObservationChart } from './PlainValueObservationChart.tsx';
import { PositionChart } from './PositionChart.tsx';
import { ProfitLossChart } from './ProfitLossChart.tsx';
import { TimestampsCard } from './TimestampsCard.tsx';
import { TransportChart } from './TransportChart.tsx';
import { VisualizerCard } from './VisualizerCard.tsx';
import { VisualizerToolbar } from './VisualizerToolbar.tsx';

export function VisualizerPage(): ReactNode {
  const { logName } = useParams<{ logName?: string }>();
  const algorithm = useStore(state => state.algorithm);
  const setAlgorithm = useStore(state => state.setAlgorithm);
  const currentLogName = useStore(state => state.currentLogName);
  const setCurrentLogName = useStore(state => state.setCurrentLogName);
  const hiddenSymbols = useStore(state => state.visualizerHiddenSymbols);
  const hiddenSet = useMemo(() => new Set(hiddenSymbols), [hiddenSymbols]);

  const { search } = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseModalOpen, setParseModalOpen] = useState(false);
  const [pendingResultLog, setPendingResultLog] = useState<ResultLog | null>(null);

  const effectiveLogName = logName || (!algorithm ? currentLogName : null);

  useEffect(() => {
    if (!effectiveLogName) return;

    setLoading(true);
    setError(null);
    setAlgorithm(null);
    setParseModalOpen(false);
    setPendingResultLog(null);

    getLog(effectiveLogName)
      .then(resultLog => {
        setPendingResultLog(resultLog);
        setParseModalOpen(true);
      })
      .catch(err => {
        setError(err.message || 'Failed to load log');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [effectiveLogName, setAlgorithm]);

  if (loading) {
    return (
      <Container>
        <Center style={{ height: '50vh' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text>Loading log: {logName ?? effectiveLogName}</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Center style={{ height: '50vh' }}>
          <Stack align="center" gap="md">
            <Text c="red" size="lg">
              Error: {error}
            </Text>
            <Text c="dimmed">Log name: {logName ?? effectiveLogName}</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (parseModalOpen && pendingResultLog) {
    return (
      <>
        <ParseSettingsModal
          opened={parseModalOpen}
          resultLog={pendingResultLog}
          title="Parse settings (server log)"
          onCancel={() => {
            setParseModalOpen(false);
            setPendingResultLog(null);
          }}
          onConfirm={assetKeys => {
            if (!pendingResultLog) {
              return;
            }
            const applied = shouldApplyAssetFilter(pendingResultLog, assetKeys);
            const alg = parseAlgorithmLogs(pendingResultLog, undefined, { assetKeys });
            setAlgorithm(
              alg,
              applied && assetKeys.length > 0 ? { visibilityIncludedProducts: assetKeys } : undefined,
            );
            setCurrentLogName(effectiveLogName);
            setParseModalOpen(false);
            setPendingResultLog(null);
          }}
        />
        <Container>
          <Center style={{ height: '40vh' }}>
            <Text c="dimmed" size="sm">
              Choose which assets to include, then parse.
            </Text>
          </Center>
        </Container>
      </>
    );
  }

  if (algorithm === null && !effectiveLogName) {
    return <Navigate to={`/${search}`} />;
  }

  if (algorithm === null) {
    return <Navigate to={`/${search}`} />;
  }

  const conversionProducts = new Set();
  for (const row of algorithm.data) {
    for (const product of Object.keys(row.state.observations.conversionObservations)) {
      conversionProducts.add(product);
    }
  }

  let profitLoss = 0;
  const lastTimestamp = algorithm.activityLogs[algorithm.activityLogs.length - 1].timestamp;
  for (let i = algorithm.activityLogs.length - 1; i >= 0 && algorithm.activityLogs[i].timestamp == lastTimestamp; i--) {
    profitLoss += algorithm.activityLogs[i].profitLoss;
  }

  const symbols = new Set<string>();
  const plainValueObservationSymbols = new Set<string>();

  for (let i = 0; i < algorithm.data.length; i += 1000) {
    const row = algorithm.data[i];

    for (const key of Object.keys(row.state.listings)) {
      symbols.add(key);
    }

    for (const key of Object.keys(row.state.observations.plainValueObservations)) {
      plainValueObservationSymbols.add(key);
    }
  }

  const sortedSymbols = [...symbols].sort((a, b) => a.localeCompare(b));
  const sortedPlainValueObservationSymbols = [...plainValueObservationSymbols].sort((a, b) => a.localeCompare(b));
  const visibleListingSymbols = sortedSymbols.filter(s => !hiddenSet.has(s));

  const symbolColumns: ReactNode[] = [];
  sortedSymbols.forEach(symbol => {
    if (hiddenSet.has(symbol)) {
      return;
    }

    symbolColumns.push(
      <Grid.Col key={`${symbol} - candlestick`} span={{ xs: 12, sm: 6 }}>
        <CandlestickChart symbol={symbol} />
      </Grid.Col>,
    );

    symbolColumns.push(
      <Grid.Col key={`${symbol} - orders`} span={{ xs: 12, sm: 6 }}>
        <OrdersChart symbol={symbol} />
      </Grid.Col>,
    );

    if (!conversionProducts.has(symbol)) {
      return;
    }

    symbolColumns.push(
      <Grid.Col key={`${symbol} - conversion price`} span={{ xs: 12, sm: 6 }}>
        <ConversionPriceChart symbol={symbol} />
      </Grid.Col>,
    );

    symbolColumns.push(
      <Grid.Col key={`${symbol} - transport`} span={{ xs: 12, sm: 6 }}>
        <TransportChart symbol={symbol} />
      </Grid.Col>,
    );

    symbolColumns.push(
      <Grid.Col key={`${symbol} - environment`} span={{ xs: 12, sm: 6 }}>
        <EnvironmentChart symbol={symbol} />
      </Grid.Col>,
    );

    symbolColumns.push(<Grid.Col key={`${symbol} - environment`} span={{ xs: 12, sm: 6 }} />);
  });

  sortedPlainValueObservationSymbols.forEach(symbol => {
    if (hiddenSet.has(symbol)) {
      return;
    }

    symbolColumns.push(
      <Grid.Col key={`${symbol} - plain value observation`} span={{ xs: 12, sm: 6 }}>
        <PlainValueObservationChart symbol={symbol} />
      </Grid.Col>,
    );
  });

  return (
    <Container fluid>
      <Grid>
        <Grid.Col span={12}>
          <VisualizerToolbar />
        </Grid.Col>
        <Grid.Col span={12}>
          <VisualizerCard>
            <Center>
              <Title order={2}>Final Profit / Loss: {formatNumber(profitLoss)}</Title>
            </Center>
          </VisualizerCard>
        </Grid.Col>
        <Grid.Col span={{ xs: 12, sm: 6 }}>
          <ProfitLossChart symbols={visibleListingSymbols} />
        </Grid.Col>
        <Grid.Col span={{ xs: 12, sm: 6 }}>
          <PositionChart symbols={visibleListingSymbols} />
        </Grid.Col>
        {symbolColumns}
        <Grid.Col span={12}>
          <TimestampsCard />
        </Grid.Col>
        {algorithm.summary && (
          <Grid.Col span={12}>
            <AlgorithmSummaryCard />
          </Grid.Col>
        )}
      </Grid>
    </Container>
  );
}
