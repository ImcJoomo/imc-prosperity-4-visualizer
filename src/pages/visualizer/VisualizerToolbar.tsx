import { Button, Chip, Divider, Group, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { ReactNode, useEffect, useMemo } from 'react';
import { useStore } from '../../store.ts';
import { collectPlainValueObservationKeys } from '../../utils/priceNormalization.ts';
import { collectAllProductKeysForVisibility } from '../../utils/visualizerSymbols.ts';
import { clearSyncedCrosshairPlotLines, resetAllLinkedChartsXExtremes } from './chartLinkRegistry.ts';
import { VisualizerCard } from './VisualizerCard.tsx';

export function VisualizerToolbar(): ReactNode {
  const algorithm = useStore(state => state.algorithm);
  const linkedZoom = useStore(state => state.visualizerLinkedZoom);
  const priceNormalization = useStore(state => state.visualizerPriceNormalization);
  const normalizationReference = useStore(state => state.visualizerNormalizationReference);
  const coarseGrouping = useStore(state => state.visualizerCoarseGrouping);
  const tradeQtyMin = useStore(state => state.visualizerTradeQtyMin);
  const tradeQtyMax = useStore(state => state.visualizerTradeQtyMax);
  const showOwnTrades = useStore(state => state.visualizerOrdersShowOwnTrades);
  const showOtherTrades = useStore(state => state.visualizerOrdersShowOtherTrades);
  const showUnfilledBuys = useStore(state => state.visualizerOrdersShowUnfilledBuys);
  const showUnfilledSells = useStore(state => state.visualizerOrdersShowUnfilledSells);
  const followTimestampDetail = useStore(state => state.visualizerFollowTimestampDetail);
  const syncCrosshair = useStore(state => state.visualizerSyncCrosshair);

  const setLinkedZoom = useStore(state => state.setVisualizerLinkedZoom);
  const setPriceNormalization = useStore(state => state.setVisualizerPriceNormalization);
  const setNormalizationReference = useStore(state => state.setVisualizerNormalizationReference);
  const setCoarseGrouping = useStore(state => state.setVisualizerCoarseGrouping);
  const setTradeQtyMin = useStore(state => state.setVisualizerTradeQtyMin);
  const setTradeQtyMax = useStore(state => state.setVisualizerTradeQtyMax);
  const setShowOwnTrades = useStore(state => state.setVisualizerOrdersShowOwnTrades);
  const setShowOtherTrades = useStore(state => state.setVisualizerOrdersShowOtherTrades);
  const setShowUnfilledBuys = useStore(state => state.setVisualizerOrdersShowUnfilledBuys);
  const setShowUnfilledSells = useStore(state => state.setVisualizerOrdersShowUnfilledSells);
  const setFollowTimestampDetail = useStore(state => state.setVisualizerFollowTimestampDetail);
  const setSyncCrosshair = useStore(state => state.setVisualizerSyncCrosshair);
  const hiddenSymbols = useStore(state => state.visualizerHiddenSymbols);
  const setHiddenSymbols = useStore(state => state.setVisualizerHiddenSymbols);

  const allProductKeys = useMemo(
    () => (algorithm ? collectAllProductKeysForVisibility(algorithm) : []),
    [algorithm],
  );

  useEffect(() => {
    if (!algorithm || allProductKeys.length === 0) {
      return;
    }
    const valid = new Set(allProductKeys);
    const prev = useStore.getState().visualizerHiddenSymbols;
    const next = prev.filter(s => valid.has(s));
    if (next.length === prev.length && next.every((s, i) => s === prev[i])) {
      return;
    }
    setHiddenSymbols(next);
  }, [algorithm, allProductKeys, setHiddenSymbols]);

  const visibleProductKeys = useMemo(() => {
    const hidden = new Set(hiddenSymbols);
    return allProductKeys.filter(k => !hidden.has(k));
  }, [allProductKeys, hiddenSymbols]);

  const referenceOptions = useMemo(() => {
    const builtIns = [
      {
        value: 'micro',
        label: 'Activity log micro-price (Vb·Pa + Va·Pb) / (Vb+Va); fallback col 15',
      },
      { value: 'wall_mid', label: 'Wall mid (max bid vol + min ask vol) / 2' },
    ];
    if (!algorithm) {
      return builtIns;
    }
    const keys = collectPlainValueObservationKeys(algorithm);
    return [...builtIns, ...keys.map(k => ({ value: k, label: `Observation: ${k}` }))];
  }, [algorithm]);

  useEffect(() => {
    if (
      normalizationReference === 'micro' ||
      normalizationReference === 'mid' ||
      normalizationReference === 'wall_mid' ||
      !algorithm
    ) {
      return;
    }
    const keys = collectPlainValueObservationKeys(algorithm);
    if (!keys.includes(normalizationReference)) {
      setNormalizationReference('micro');
    }
  }, [algorithm, normalizationReference, setNormalizationReference]);

  if (!algorithm) {
    return null;
  }

  return (
    <VisualizerCard>
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Chart controls
        </Text>
        <div>
          <Group justify="space-between" align="center" mb="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Products shown (charts &amp; PnL / position lines)
            </Text>
            <Group gap="xs">
              <Button size="compact-xs" variant="light" onClick={() => setHiddenSymbols([])}>
                Show all
              </Button>
              <Button size="compact-xs" variant="light" onClick={() => setHiddenSymbols([...allProductKeys])}>
                Hide all
              </Button>
            </Group>
          </Group>
          <Chip.Group
            multiple
            value={visibleProductKeys}
            onChange={value => {
              const visible = new Set(value);
              setHiddenSymbols(allProductKeys.filter(k => !visible.has(k)));
            }}
          >
            <Group gap="xs">
              {allProductKeys.map(key => (
                <Chip key={key} value={key} size="xs">
                  {key}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
        <Divider />
        <Group gap="lg" align="flex-start" wrap="wrap">
          <Switch
            label="Link X zoom (all charts)"
            checked={linkedZoom}
            onChange={e => setLinkedZoom(e.currentTarget.checked)}
          />
          <Switch
            label="Sync vertical crosshair across charts"
            checked={syncCrosshair}
            onChange={e => {
              const on = e.currentTarget.checked;
              setSyncCrosshair(on);
              if (!on) {
                clearSyncedCrosshairPlotLines();
              }
            }}
          />
          <Button variant="light" size="xs" onClick={() => resetAllLinkedChartsXExtremes()}>
            Reset time range
          </Button>
          <Divider orientation="vertical" />
          <Switch
            label="Normalize prices (Δ vs reference)"
            checked={priceNormalization}
            onChange={e => setPriceNormalization(e.currentTarget.checked)}
          />
          <Select
            label="Reference"
            size="xs"
            w={220}
            data={referenceOptions}
            value={normalizationReference}
            onChange={v => v && setNormalizationReference(v)}
            disabled={!priceNormalization}
          />
          <Divider orientation="vertical" />
          <Switch
            label="Coarser time grouping (performance)"
            checked={coarseGrouping}
            onChange={e => setCoarseGrouping(e.currentTarget.checked)}
          />
          <Divider orientation="vertical" />
          <Switch
            label="Detail panel follows chart X (hover)"
            checked={followTimestampDetail}
            onChange={e => setFollowTimestampDetail(e.currentTarget.checked)}
          />
        </Group>
        <Divider />
        <Text size="xs" c="dimmed">
          Order book chart: trades
        </Text>
        <Group gap="md" align="flex-end" wrap="wrap">
          <Switch
            label="Own (filled)"
            checked={showOwnTrades}
            onChange={e => setShowOwnTrades(e.currentTarget.checked)}
          />
          <Switch
            label="Other market"
            checked={showOtherTrades}
            onChange={e => setShowOtherTrades(e.currentTarget.checked)}
          />
          <Switch
            label="Unfilled buys"
            checked={showUnfilledBuys}
            onChange={e => setShowUnfilledBuys(e.currentTarget.checked)}
          />
          <Switch
            label="Unfilled sells"
            checked={showUnfilledSells}
            onChange={e => setShowUnfilledSells(e.currentTarget.checked)}
          />
          <NumberInput
            label="Min qty"
            size="xs"
            w={100}
            min={0}
            allowDecimal={false}
            value={tradeQtyMin ?? ''}
            onChange={v => {
              if (v === '' || v === undefined) {
                setTradeQtyMin(null);
              } else if (typeof v === 'number') {
                setTradeQtyMin(v);
              }
            }}
            placeholder="Any"
            clampBehavior="none"
          />
          <NumberInput
            label="Max qty"
            size="xs"
            w={100}
            min={0}
            allowDecimal={false}
            value={tradeQtyMax ?? ''}
            onChange={v => {
              if (v === '' || v === undefined) {
                setTradeQtyMax(null);
              } else if (typeof v === 'number') {
                setTradeQtyMax(v);
              }
            }}
            placeholder="Any"
            clampBehavior="none"
          />
        </Group>
      </Stack>
    </VisualizerCard>
  );
}
