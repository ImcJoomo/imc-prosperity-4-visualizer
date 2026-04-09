import { Button, Code, Text, TextInput } from '@mantine/core';
import axios from 'axios';
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { ParseSettingsModal } from '../../components/ParseSettingsModal.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import { ResultLog } from '../../models.ts';
import { useStore } from '../../store.ts';
import { parseAlgorithmLogs } from '../../utils/algorithm.tsx';
import { parseUploadedLogTextToResultLog } from '../../utils/parseUploadedLogText.ts';
import { shouldApplyAssetFilter } from '../../utils/resultLogAssetFilter.ts';
import { HomeCard } from './HomeCard.tsx';

export function LoadFromUrl(): ReactNode {
  const [url, setUrl] = useState('');
  const [parseModalOpen, setParseModalOpen] = useState(false);
  const [pendingResultLog, setPendingResultLog] = useState<ResultLog | null>(null);
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string>('');

  const algorithm = useStore(state => state.algorithm);
  const setAlgorithm = useStore(state => state.setAlgorithm);

  const navigate = useNavigate();
  const searchParams = useSearchParams()[0];

  const loadAlgorithm = useAsync(async (logsUrl: string): Promise<void> => {
    const res = await axios.get<string>(logsUrl, {
      responseType: 'text',
      transformResponse: r => r,
    });
    const raw = parseUploadedLogTextToResultLog(res.data);
    setPendingOpenUrl(logsUrl);
    setPendingResultLog(raw);
    setParseModalOpen(true);
  });

  const onSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      if (url.trim().length > 0) {
        loadAlgorithm.call(url);
      }
    },
    [loadAlgorithm],
  );

  useEffect(() => {
    if (algorithm !== null || loadAlgorithm.loading) {
      return;
    }

    if (!searchParams.has('open')) {
      return;
    }

    const url = searchParams.get('open') || '';

    setUrl(url);

    if (url.trim().length > 0) {
      loadAlgorithm.call(url);
    }
  }, []);

  const currentUrl = window.location.origin + window.location.pathname;

  const confirmParse = useCallback(
    (assetKeys: string[]) => {
      if (!pendingResultLog) {
        return;
      }
      const applied = shouldApplyAssetFilter(pendingResultLog, assetKeys);
      const alg = parseAlgorithmLogs(pendingResultLog, undefined, { assetKeys });
      setAlgorithm(alg, applied && assetKeys.length > 0 ? { visibilityIncludedProducts: assetKeys } : undefined);
      setParseModalOpen(false);
      setPendingResultLog(null);
      const q = pendingOpenUrl ? `?open=${encodeURIComponent(pendingOpenUrl)}` : '';
      navigate(`/visualizer${q}`);
      setPendingOpenUrl('');
    },
    [pendingResultLog, pendingOpenUrl, setAlgorithm, navigate],
  );

  return (
    <HomeCard title="Load from URL">
      <ParseSettingsModal
        opened={parseModalOpen}
        resultLog={pendingResultLog}
        onCancel={() => {
          setParseModalOpen(false);
          setPendingResultLog(null);
          setPendingOpenUrl('');
        }}
        onConfirm={assetKeys => confirmParse(assetKeys)}
      />
      <Text>
        Supports JSON result logs or prosperity3bt console logs served as text. The URL must allow cross-origin requests
        from the visualizer&apos;s website.
      </Text>
      <Text>
        This input type can also be used by browsing to <Code>{currentUrl}?open=&lt;url&gt;</Code>.
      </Text>

      {loadAlgorithm.error && <ErrorAlert error={loadAlgorithm.error} />}

      <form onSubmit={onSubmit}>
        <TextInput
          label="URL"
          placeholder="URL"
          value={url}
          onInput={e => setUrl((e.target as HTMLInputElement).value)}
        />

        <Button fullWidth type="submit" loading={loadAlgorithm.loading} mt="sm">
          <div>Load</div>
        </Button>
      </form>
    </HomeCard>
  );
}
