import { Group, SegmentedControl, Switch } from '@mantine/core';
import { ReactNode } from 'react';
import type { DeltaValueMode } from '../../utils/seriesDelta.ts';

export interface ChartDeltaBarProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  valueMode: DeltaValueMode;
  onValueModeChange: (mode: DeltaValueMode) => void;
}

export function ChartDeltaBar({
  enabled,
  onEnabledChange,
  valueMode,
  onValueModeChange,
}: ChartDeltaBarProps): ReactNode {
  return (
    <Group gap="xs" align="center" wrap="wrap">
      <Switch
        size="xs"
        label="Delta view"
        checked={enabled}
        onChange={e => onEnabledChange(e.currentTarget.checked)}
      />
      <SegmentedControl
        size="xs"
        disabled={!enabled}
        value={valueMode}
        onChange={v => onValueModeChange(v as DeltaValueMode)}
        data={[
          { value: 'raw', label: 'Raw Δ' },
          { value: 'percent', label: '% vs prior' },
        ]}
      />
    </Group>
  );
}
