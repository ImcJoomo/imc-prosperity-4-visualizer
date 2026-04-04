import { ActionIcon, Anchor, Group, Loader, Pagination, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconExternalLink, IconSearch, IconTrash } from '@tabler/icons-react';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteLog, listLogs, SavedLog } from '../../api/logs';
import { ErrorAlert } from '../../components/ErrorAlert';
import { HomeCard } from './HomeCard';

const ITEMS_PER_PAGE = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SavedLogs(): ReactNode {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<SavedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listLogs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch logs'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filter logs by search query
  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const query = search.toLowerCase();
    return logs.filter(log => log.name.toLowerCase().includes(query));
  }, [logs, search]);

  // Paginate filtered logs
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLogs, page]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleDelete = useCallback(
    async (name: string) => {
      if (!confirm(`Delete log "${name}"?`)) return;
      try {
        await deleteLog(name);
        fetchLogs();
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete log'));
      }
    },
    [fetchLogs],
  );

  const handleOpen = useCallback(
    (name: string) => {
      navigate(`/visualizer/${encodeURIComponent(name)}`);
    },
    [navigate],
  );

  if (loading) {
    return (
      <HomeCard title="Saved Logs">
        <Group justify="center" py="md">
          <Loader size="sm" />
          <Text>Loading saved logs...</Text>
        </Group>
      </HomeCard>
    );
  }

  if (error) {
    return (
      <HomeCard title="Saved Logs">
        <ErrorAlert error={error} />
        <Text size="sm" c="dimmed" mt="xs">
          Make sure the log server is running on port 4174.
        </Text>
      </HomeCard>
    );
  }

  if (logs.length === 0) {
    return (
      <HomeCard title="Saved Logs">
        <Text c="dimmed">No saved logs yet. Upload a log file to get started.</Text>
      </HomeCard>
    );
  }

  return (
    <HomeCard title="Saved Logs">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <Text size="sm" c="dimmed">
            Click on a log name to visualize it. ({filteredLogs.length} logs)
          </Text>
          <TextInput
            placeholder="Search logs..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={e => setSearch(e.currentTarget.value)}
            style={{ width: 250 }}
          />
        </Group>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Size</Table.Th>
              <Table.Th>Modified</Table.Th>
              <Table.Th style={{ width: 100 }}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginatedLogs.map(log => (
              <Table.Tr key={log.name}>
                <Table.Td>
                  <Anchor
                    component="button"
                    onClick={() => handleOpen(log.name)}
                    style={{ textAlign: 'left' }}
                  >
                    {log.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{formatFileSize(log.size)}</Table.Td>
                <Table.Td>{formatDate(log.modifiedAt)}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="Open in new tab">
                      <ActionIcon
                        variant="subtle"
                        component="a"
                        href={`/imc-prosperity-4-visualizer/visualizer/${encodeURIComponent(log.name)}`}
                        target="_blank"
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(log.name)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {filteredLogs.length === 0 && search && (
          <Text c="dimmed" ta="center">
            No logs found matching "{search}"
          </Text>
        )}

        {totalPages > 1 && (
          <Group justify="center">
            <Pagination total={totalPages} value={page} onChange={setPage} />
          </Group>
        )}
      </Stack>
    </HomeCard>
  );
}
