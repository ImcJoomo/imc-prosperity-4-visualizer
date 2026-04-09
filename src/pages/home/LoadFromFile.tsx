import { Badge, Checkbox, Code, Group, Stack, Text, TextInput } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload, IconUser } from '@tabler/icons-react';
import { ReactNode, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveLog } from '../../api/logs.ts';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { ParseSettingsModal } from '../../components/ParseSettingsModal.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import { ResultLog } from '../../models.ts';
import { useStore } from '../../store.ts';
import { parseAlgorithmLogs } from '../../utils/algorithm.tsx';
import { parseUploadedLogTextToResultLog } from '../../utils/parseUploadedLogText.ts';
import { shouldApplyAssetFilter } from '../../utils/resultLogAssetFilter.ts';
import { HomeCard } from './HomeCard.tsx';

function DropzoneContent(): ReactNode {
  return (
    <Group justify="center" gap="xl" style={{ minHeight: 80, pointerEvents: 'none' }}>
      <IconUpload size={40}></IconUpload>
      <Text size="xl" inline={true}>
        Drag file here or click to select file
      </Text>
    </Group>
  );
}

export function LoadFromFile(): ReactNode {
  const navigate = useNavigate();

  const [error, setError] = useState<Error>();
  const [saveToServer, setSaveToServer] = useState(true);
  const [logName, setLogName] = useState('');
  const [parseModalOpen, setParseModalOpen] = useState(false);
  const [pendingResultLog, setPendingResultLog] = useState<ResultLog | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');

  const username = useStore(state => state.username);
  const setUsername = useStore(state => state.setUsername);
  const setAlgorithm = useStore(state => state.setAlgorithm);
  const setCurrentLogName = useStore(state => state.setCurrentLogName);

  const getPrefixedName = (baseName: string): string => {
    const trimmedUsername = username.trim();
    const trimmedName = baseName.trim();
    if (!trimmedUsername) return trimmedName;
    return `${trimmedUsername}_${trimmedName}`;
  };

  const onDrop = useAsync(
    (files: File[]) =>
      new Promise<void>((resolve, reject) => {
        setError(undefined);

        const reader = new FileReader();

        reader.addEventListener('load', async () => {
          try {
            const text = reader.result as string;
            const resultLog = parseUploadedLogTextToResultLog(text);
            setPendingFileName(files[0].name.replace(/\.[^/.]+$/, ''));
            setPendingResultLog(resultLog);
            setParseModalOpen(true);
            resolve();
          } catch (err: unknown) {
            reject(err);
          }
        });

        reader.addEventListener('error', () => {
          reject(new Error('FileReader emitted an error event'));
        });

        reader.readAsText(files[0]);
      }),
  );

  const onReject = useCallback((rejections: FileRejection[]) => {
    const messages: string[] = [];

    for (const rejection of rejections) {
      const errorType = {
        'file-invalid-type': 'Invalid type, only log files are supported.',
        'file-too-large': 'File too large.',
        'file-too-small': 'File too small.',
        'too-many-files': 'Too many files.',
      }[rejection.errors[0].code]!;

      messages.push(`Could not load algorithm from ${rejection.file.name}: ${errorType}`);
    }

    setError(new Error(messages.join('<br/>')));
  }, []);

  const previewName = saveToServer
    ? getPrefixedName(logName.trim() || 'filename')
    : null;

  const finalizeParse = useCallback(
    async (assetKeys: string[]) => {
      if (!pendingResultLog) {
        return;
      }
      const applied = shouldApplyAssetFilter(pendingResultLog, assetKeys);
      const algorithm = parseAlgorithmLogs(pendingResultLog, undefined, { assetKeys });
      setAlgorithm(algorithm, applied && assetKeys.length > 0 ? { visibilityIncludedProducts: assetKeys } : undefined);
      setParseModalOpen(false);
      const toSave = pendingResultLog;
      setPendingResultLog(null);
      const baseName = logName.trim() || pendingFileName;
      const u = username.trim();
      const finalName = u ? `${u}_${baseName}` : baseName;
      if (saveToServer) {
        try {
          const result = await saveLog(finalName, toSave);
          setCurrentLogName(result.name);
          navigate(`/visualizer/${encodeURIComponent(result.name)}`);
        } catch {
          navigate('/visualizer');
        }
      } else {
        navigate('/visualizer');
      }
    },
    [pendingResultLog, pendingFileName, logName, saveToServer, username, setAlgorithm, setCurrentLogName, navigate],
  );

  return (
    <HomeCard title="Load from file">
      <ParseSettingsModal
        opened={parseModalOpen}
        resultLog={pendingResultLog}
        onCancel={() => {
          setParseModalOpen(false);
          setPendingResultLog(null);
        }}
        onConfirm={assetKeys => {
          void finalizeParse(assetKeys);
        }}
      />
      <Stack gap="sm">
        <Text>
          Supports log files that are in the same format as the ones generated by the Prosperity servers. This format is
          undocumented, but you can get an idea of what it looks like by downloading a log file from a submitted
          algorithm.
        </Text>
        <Text size="sm" c="dimmed">
          JSON (submission / export_resultlog) or prosperity3bt console <Code>.log</Code> (Sandbox + Activities + Trade
          History).
        </Text>

        <Group align="flex-end">
          <TextInput
            label="Your name (prefix)"
            placeholder="e.g. john"
            leftSection={<IconUser size={16} />}
            value={username}
            onChange={e => setUsername(e.currentTarget.value)}
            style={{ width: 150 }}
          />
          <Checkbox
            label="Save to server"
            checked={saveToServer}
            onChange={e => setSaveToServer(e.currentTarget.checked)}
            style={{ marginBottom: 8 }}
          />
          {saveToServer && (
            <TextInput
              label="Log name"
              placeholder="(auto from filename)"
              value={logName}
              onChange={e => setLogName(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
          )}
        </Group>

        {saveToServer && previewName && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Will be saved as:
            </Text>
            <Badge variant="light" color="blue">
              {previewName}
            </Badge>
          </Group>
        )}

        {error && <ErrorAlert error={error} />}
        {onDrop.error && <ErrorAlert error={onDrop.error} />}

        <Dropzone onDrop={onDrop.call} onReject={onReject} multiple={false} loading={onDrop.loading}>
          <Dropzone.Idle>
            <DropzoneContent />
          </Dropzone.Idle>
          <Dropzone.Accept>
            <DropzoneContent />
          </Dropzone.Accept>
        </Dropzone>
      </Stack>
    </HomeCard>
  );
}
