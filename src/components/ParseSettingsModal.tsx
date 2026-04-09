import { Button, Chip, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import type { ResultLog } from '../models.ts';
import { collectResultLogAssetKeys } from '../utils/resultLogAssetFilter.ts';

export interface ParseSettingsModalProps {
  opened: boolean;
  resultLog: ResultLog | null;
  title?: string;
  onCancel: () => void;
  onConfirm: (assetKeys: string[]) => void;
}

export function ParseSettingsModal({
  opened,
  resultLog,
  title = 'Parse settings',
  onCancel,
  onConfirm,
}: ParseSettingsModalProps): ReactNode {
  const keys = useMemo(() => (resultLog ? collectResultLogAssetKeys(resultLog) : []), [resultLog]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (opened && resultLog) {
      setSelected(collectResultLogAssetKeys(resultLog));
    }
  }, [opened, resultLog]);

  return (
    <Modal opened={opened} onClose={onCancel} title={title} size="lg" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Uncheck products or symbols you want to exclude before parsing. Activity rows and trade history are filtered;
          timestamps stay aligned. Leave all checked to load everything.
        </Text>
        <Group justify="space-between" wrap="wrap">
          <Button size="compact-xs" variant="light" onClick={() => setSelected([...keys])}>
            Select all
          </Button>
          <Button size="compact-xs" variant="light" onClick={() => setSelected([])}>
            Clear all
          </Button>
        </Group>
        {keys.length === 0 ? (
          <Text size="sm" c="dimmed">
            No asset keys found in this log (empty activities or unusual format). You can still parse.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={280} type="auto">
            <Chip.Group multiple value={selected} onChange={setSelected}>
              <Group gap="xs">
                {keys.map(k => (
                  <Chip key={k} value={k} size="xs">
                    {k}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </ScrollArea.Autosize>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={keys.length > 0 && selected.length === 0}
            onClick={() => onConfirm(keys.length === 0 ? [] : selected)}
          >
            Parse log
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
