import {
  Badge,
  Center,
  Container,
  Grid,
  Loader,
  MultiSelect,
  NumberInput,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getParsedAlgorithm } from '../../api/perf.ts';
import { getLog } from '../../api/logs.ts';
import { Algorithm, Trade } from '../../models.ts';
import { useStore } from '../../store.ts';
import { parseAlgorithmLogs } from '../../utils/algorithm.tsx';
import { isServerParsedLogsEnabled } from '../../utils/perfMode.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

function collectAllTrades(algorithm: Algorithm): Trade[] {
  const trades: Trade[] = [];
  const seen = new Set<string>();

  const addIfNew = (t: Trade) => {
    const key = `${t.symbol}|${t.price}|${t.quantity}|${t.buyer}|${t.seller}|${t.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      trades.push(t);
    }
  };

  // Iterate rows in log order (ascending timestamp).
  // For each tick T: ownTrades first (our orders matched after run() at T-1),
  // then marketTrades (bot trades that happened after our matching).
  for (const row of algorithm.data) {
    for (const symbol of Object.keys(row.state.ownTrades)) {
      for (const t of row.state.ownTrades[symbol]) {
        addIfNew(t);
      }
    }
    for (const symbol of Object.keys(row.state.marketTrades)) {
      for (const t of row.state.marketTrades[symbol]) {
        addIfNew(t);
      }
    }
  }

  return trades;
}

function getParticipants(trades: Trade[]): string[] {
  const names = new Set<string>();
  for (const t of trades) {
    if (t.buyer) names.add(t.buyer);
    if (t.seller) names.add(t.seller);
  }
  return [...names].sort();
}

function getSymbols(trades: Trade[]): string[] {
  const syms = new Set<string>();
  for (const t of trades) {
    syms.add(t.symbol);
  }
  return [...syms].sort();
}

interface ParticipantStat {
  count: number;
  buyCount: number;
  sellCount: number;
  totalQty: number;
  totalVolume: number;
}

function getParticipantStatsBySymbol(
  trades: Trade[],
): Map<string, Map<string, ParticipantStat>> {
  // symbol -> participant -> stats
  const result = new Map<string, Map<string, ParticipantStat>>();

  for (const t of trades) {
    for (const name of [t.buyer, t.seller]) {
      if (!name) continue;

      if (!result.has(t.symbol)) {
        result.set(t.symbol, new Map());
      }
      const symbolStats = result.get(t.symbol)!;
      const existing = symbolStats.get(name) || { count: 0, buyCount: 0, sellCount: 0, totalQty: 0, totalVolume: 0 };
      existing.count++;
      if (name === t.buyer) existing.buyCount++;
      if (name === t.seller) existing.sellCount++;
      existing.totalQty += t.quantity;
      existing.totalVolume += t.price * t.quantity;
      symbolStats.set(name, existing);
    }
  }

  return result;
}

const PAGE_SIZE = 100;

export function TradeHistoryPage(): ReactNode {
  const { logName } = useParams<{ logName?: string }>();
  const algorithm = useStore(state => state.algorithm);
  const setAlgorithm = useStore(state => state.setAlgorithm);
  const currentLogName = useStore(state => state.currentLogName);
  const setCurrentLogName = useStore(state => state.setCurrentLogName);
  const { search } = useLocation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<number | string>('');
  const [priceMax, setPriceMax] = useState<number | string>('');
  const [qtyMin, setQtyMin] = useState<number | string>('');
  const [qtyMax, setQtyMax] = useState<number | string>('');

  // Infinite scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Determine which log name to load: URL param takes priority, then persisted name
  const effectiveLogName = logName || (!algorithm ? currentLogName : null);

  useEffect(() => {
    if (!effectiveLogName) return;
    setLoading(true);
    setError(null);
    if (isServerParsedLogsEnabled && logName) {
      getParsedAlgorithm(effectiveLogName)
        .then(parsedAlgorithm => {
          setAlgorithm(parsedAlgorithm);
          setCurrentLogName(effectiveLogName);
        })
        .catch(err => setError(err.message || 'Failed to load log'))
        .finally(() => setLoading(false));
      return;
    }
    getLog(effectiveLogName)
      .then(resultLog => {
        setAlgorithm(parseAlgorithmLogs(resultLog));
        setCurrentLogName(effectiveLogName);
      })
      .catch(err => setError(err.message || 'Failed to load log'))
      .finally(() => setLoading(false));
  }, [effectiveLogName, setAlgorithm, setCurrentLogName]);

  const allTrades = useMemo(() => (algorithm ? collectAllTrades(algorithm) : []), [algorithm]);
  const symbols = useMemo(() => getSymbols(allTrades), [allTrades]);
  const participants = useMemo(() => getParticipants(allTrades), [allTrades]);

  const filtered = useMemo(() => {
    let result = allTrades;

    if (selectedSymbols.length > 0) {
      const set = new Set(selectedSymbols);
      result = result.filter(t => set.has(t.symbol));
    }

    if (selectedParticipants.length > 0) {
      const set = new Set(selectedParticipants);
      result = result.filter(t => set.has(t.buyer) || set.has(t.seller));
    }

    if (typeof priceMin === 'number') {
      result = result.filter(t => t.price >= priceMin);
    }
    if (typeof priceMax === 'number') {
      result = result.filter(t => t.price <= priceMax);
    }
    if (typeof qtyMin === 'number') {
      result = result.filter(t => t.quantity >= qtyMin);
    }
    if (typeof qtyMax === 'number') {
      result = result.filter(t => t.quantity <= qtyMax);
    }

    return result;
  }, [allTrades, selectedSymbols, selectedParticipants, priceMin, priceMax, qtyMin, qtyMax]);

  // Participant stats based on filtered trades, grouped by symbol
  const statsBySymbol = useMemo(() => getParticipantStatsBySymbol(filtered), [filtered]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedSymbols, selectedParticipants, priceMin, priceMax, qtyMin, qtyMax]);

  // Infinite scroll via callback ref — attaches observer when sentinel mounts
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) {
            setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length));
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [filtered.length],
  );

  const visibleData = filtered.slice(0, visibleCount);

  if (loading) {
    return (
      <Container>
        <Center style={{ height: '50vh' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text>Loading log: {effectiveLogName}</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Center style={{ height: '50vh' }}>
          <Text c="red" size="lg">Error: {error}</Text>
        </Center>
      </Container>
    );
  }

  if (algorithm === null && !effectiveLogName) {
    return <Navigate to={`/${search}`} />;
  }

  if (algorithm === null) {
    return (
      <Container>
        <Center style={{ height: '50vh' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text>Loading log: {effectiveLogName}</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  const sortedSymbolKeys = [...statsBySymbol.keys()].sort();

  return (
    <Container fluid>
      <Grid>
        {/* Header */}
        <Grid.Col span={12}>
          <VisualizerCard>
            <Center>
              <Title order={2}>Trade History — {formatNumber(allTrades.length)} trades</Title>
            </Center>
          </VisualizerCard>
        </Grid.Col>

        {/* Participant summary per symbol */}
        {sortedSymbolKeys.map(symbol => (
          <Grid.Col key={symbol} span={{ xs: 12, sm: 6 }}>
            <VisualizerCard title={`Participants — ${symbol}`}>
              <Table withColumnBorders horizontalSpacing={8} verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Trades</Table.Th>
                    <Table.Th>Buy</Table.Th>
                    <Table.Th>Sell</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Volume</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...statsBySymbol.get(symbol)!.entries()]
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([name, stats]) => (
                      <Table.Tr key={name}>
                        <Table.Td fw={700}>{name || <Text c="dimmed" span>(anonymous)</Text>}</Table.Td>
                        <Table.Td>{formatNumber(stats.count)}</Table.Td>
                        <Table.Td style={{ backgroundColor: getBidColor(0.08) }}>{formatNumber(stats.buyCount)}</Table.Td>
                        <Table.Td style={{ backgroundColor: getAskColor(0.08) }}>{formatNumber(stats.sellCount)}</Table.Td>
                        <Table.Td>{formatNumber(stats.totalQty)}</Table.Td>
                        <Table.Td>{formatNumber(stats.totalVolume)}</Table.Td>
                      </Table.Tr>
                    ))}
                </Table.Tbody>
              </Table>
            </VisualizerCard>
          </Grid.Col>
        ))}

        {/* Filters */}
        <Grid.Col span={12}>
          <VisualizerCard title="Filters">
            <Grid>
              <Grid.Col span={{ xs: 12, sm: 3 }}>
                <MultiSelect
                  label="Symbol"
                  placeholder="All symbols"
                  data={symbols}
                  value={selectedSymbols}
                  onChange={setSelectedSymbols}
                  clearable
                  searchable
                />
              </Grid.Col>
              <Grid.Col span={{ xs: 12, sm: 3 }}>
                <MultiSelect
                  label="Participant"
                  placeholder="All participants"
                  data={participants.map(p => ({ value: p, label: p || '(anonymous)' }))}
                  value={selectedParticipants}
                  onChange={setSelectedParticipants}
                  clearable
                  searchable
                />
              </Grid.Col>
              <Grid.Col span={{ xs: 6, sm: 1.5 }}>
                <NumberInput label="Price min" placeholder="—" value={priceMin} onChange={setPriceMin} />
              </Grid.Col>
              <Grid.Col span={{ xs: 6, sm: 1.5 }}>
                <NumberInput label="Price max" placeholder="—" value={priceMax} onChange={setPriceMax} />
              </Grid.Col>
              <Grid.Col span={{ xs: 6, sm: 1.5 }}>
                <NumberInput label="Qty min" placeholder="—" value={qtyMin} onChange={setQtyMin} />
              </Grid.Col>
              <Grid.Col span={{ xs: 6, sm: 1.5 }}>
                <NumberInput label="Qty max" placeholder="—" value={qtyMax} onChange={setQtyMax} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Text size="sm" c="dimmed">
                  Showing {formatNumber(filtered.length)} of {formatNumber(allTrades.length)} trades
                </Text>
              </Grid.Col>
            </Grid>
          </VisualizerCard>
        </Grid.Col>

        {/* Trade table */}
        <Grid.Col span={12}>
          <VisualizerCard>
            <Table.ScrollContainer minWidth={600}>
              <Table withColumnBorders horizontalSpacing={8} verticalSpacing={4} striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Timestamp</Table.Th>
                    <Table.Th>Symbol</Table.Th>
                    <Table.Th>Buyer</Table.Th>
                    <Table.Th>Seller</Table.Th>
                    <Table.Th>Price</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visibleData.map((t, i) => {
                    const isSubmissionBuy = t.buyer === 'SUBMISSION';
                    const isSubmissionSell = t.seller === 'SUBMISSION';
                    const rowBg = isSubmissionBuy
                      ? getBidColor(0.08)
                      : isSubmissionSell
                        ? getAskColor(0.08)
                        : undefined;

                    return (
                      <Table.Tr key={i} style={{ backgroundColor: rowBg }}>
                        <Table.Td>{i + 1}</Table.Td>
                        <Table.Td>{formatNumber(t.timestamp)}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="sm">{t.symbol}</Badge>
                        </Table.Td>
                        <Table.Td fw={isSubmissionBuy ? 700 : undefined}>
                          {t.buyer || <Text c="dimmed" span size="sm">—</Text>}
                        </Table.Td>
                        <Table.Td fw={isSubmissionSell ? 700 : undefined}>
                          {t.seller || <Text c="dimmed" span size="sm">—</Text>}
                        </Table.Td>
                        <Table.Td>{formatNumber(t.price)}</Table.Td>
                        <Table.Td>{formatNumber(t.quantity)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {/* Infinite scroll sentinel — outside table for reliable IntersectionObserver */}
            {visibleCount < filtered.length && (
              <div ref={sentinelRef}>
                <Center py="md">
                  <Loader size="sm" />
                </Center>
              </div>
            )}
          </VisualizerCard>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
