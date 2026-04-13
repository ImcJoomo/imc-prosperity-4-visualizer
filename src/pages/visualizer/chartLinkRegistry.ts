import type Highcharts from 'highcharts/highstock';
import { isPerfExperimentsEnabled } from '../../utils/perfMode.ts';
import { useStore } from '../../store.ts';

const SYNC_TRIGGER = 'VisualizerSync';

export const SYNC_CROSSHAIR_PLOT_LINE_ID = 'visualizer-sync-crosshair';

const linkedCharts = new Set<Highcharts.Chart>();
const wheelSyncTimerByChart = new WeakMap<Highcharts.Chart, number>();
const lastCrosshairValueByChart = new WeakMap<Highcharts.Chart, number>();

function isChartVisibleInViewport(chart: Highcharts.Chart): boolean {
  const rect = chart.container?.getBoundingClientRect();
  if (!rect) {
    return false;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
}

export function registerLinkedChart(chart: Highcharts.Chart): void {
  linkedCharts.add(chart);
}

export function unregisterLinkedChart(chart: Highcharts.Chart): void {
  linkedCharts.delete(chart);
  lastCrosshairValueByChart.delete(chart);
  const timer = wheelSyncTimerByChart.get(chart);
  if (timer) {
    window.clearTimeout(timer);
    wheelSyncTimerByChart.delete(chart);
  }
}

export function propagateXAxisExtremes(source: Highcharts.Chart, min: number, max: number): void {
  for (const chart of linkedCharts) {
    if (chart === source) continue;
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) continue;
    chart.xAxis[0]?.setExtremes(min, max, true, false, { trigger: SYNC_TRIGGER });
  }
}

export function schedulePropagateXAxisExtremes(source: Highcharts.Chart, min: number, max: number, delayMs = 140): void {
  const existingTimer = wheelSyncTimerByChart.get(source);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const timer = window.setTimeout(() => {
    wheelSyncTimerByChart.delete(source);
    if (!source.container || (source as unknown as { destroyed?: boolean }).destroyed) {
      return;
    }
    propagateXAxisExtremes(source, min, max);
  }, delayMs);

  wheelSyncTimerByChart.set(source, timer);
}

export function resetAllLinkedChartsXExtremes(): void {
  const algorithm = useStore.getState().algorithm;
  const perfMin = isPerfExperimentsEnabled ? algorithm?.chartCache?.timestampMin : undefined;
  const perfMax = isPerfExperimentsEnabled ? algorithm?.chartCache?.timestampMax : undefined;

  for (const chart of linkedCharts) {
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) continue;
    chart.xAxis[0]?.setExtremes(perfMin, perfMax, true, false, { trigger: SYNC_TRIGGER });
  }
}

export function isVisualizerSyncTrigger(trigger: string | undefined): boolean {
  return trigger === SYNC_TRIGGER;
}

export function clearSyncedCrosshairPlotLines(exceptChart?: Highcharts.Chart): void {
  for (const chart of linkedCharts) {
    if (chart === exceptChart) {
      continue;
    }
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) {
      continue;
    }
    for (const axis of chart.xAxis) {
      try {
        axis.removePlotLine(SYNC_CROSSHAIR_PLOT_LINE_ID);
      } catch {
        // plot line may already be gone
      }
    }
    lastCrosshairValueByChart.delete(chart);
  }
}

export function syncCrosshairPlotLines(source: Highcharts.Chart, xValue: number): void {
  for (const chart of linkedCharts) {
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) {
      continue;
    }
    if (chart === source) {
      continue;
    }
    const axis = chart.xAxis[0];
    if (!axis) {
      continue;
    }
    if (isPerfExperimentsEnabled) {
      if (!isChartVisibleInViewport(chart)) {
        continue;
      }
      if (lastCrosshairValueByChart.get(chart) === xValue) {
        continue;
      }
    }
    try {
      axis.removePlotLine(SYNC_CROSSHAIR_PLOT_LINE_ID);
    } catch {
      // ignore
    }
    axis.addPlotLine({
      id: SYNC_CROSSHAIR_PLOT_LINE_ID,
      value: xValue,
      color: 'rgba(200, 200, 220, 0.85)',
      width: 1,
      zIndex: 6,
      dashStyle: 'Solid',
    });
    lastCrosshairValueByChart.set(chart, xValue);
  }
}
