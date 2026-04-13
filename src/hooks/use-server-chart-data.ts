import { DependencyList, useEffect, useState } from 'react';
import { getPerfChartData } from '../api/perf.ts';
import { useStore } from '../store.ts';
import { isServerBackedChartsEnabled } from '../utils/perfMode.ts';

const DEFAULT_TARGET_POINTS = 1200;
const REQUEST_DEBOUNCE_MS = 120;

export function useServerChartData<T>(
  chartType: string,
  params: Record<string, string | number | null | undefined>,
  deps: DependencyList,
): { data: T | null; loading: boolean } {
  const currentLogName = useStore(state => state.currentLogName);
  const rangeMin = useStore(state => state.visualizerRangeMin);
  const rangeMax = useStore(state => state.visualizerRangeMax);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isServerBackedChartsEnabled || !currentLogName) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const shouldShowLoading = data === null;
    if (shouldShowLoading) {
      setLoading(true);
    }
    const timeoutId = window.setTimeout(() => {
      void getPerfChartData<T>(currentLogName, chartType, {
        targetPoints: DEFAULT_TARGET_POINTS,
        from: rangeMin,
        to: rangeMax,
        ...params,
      })
        .then(result => {
          if (!cancelled) {
            setData(result);
          }
        })
        .catch(err => {
          console.error(err);
          if (!cancelled) {
            setData(null);
          }
        })
        .finally(() => {
          if (!cancelled && shouldShowLoading) {
            setLoading(false);
          }
        });
    }, REQUEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [chartType, currentLogName, rangeMin, rangeMax, ...deps]);

  return { data, loading };
}
