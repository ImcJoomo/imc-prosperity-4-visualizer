import type Highcharts from 'highcharts/highstock';

const SYNC_TRIGGER = 'VisualizerSync';

export const SYNC_CROSSHAIR_PLOT_LINE_ID = 'visualizer-sync-crosshair';

const linkedCharts = new Set<Highcharts.Chart>();

export function registerLinkedChart(chart: Highcharts.Chart): void {
  linkedCharts.add(chart);
}

export function unregisterLinkedChart(chart: Highcharts.Chart): void {
  linkedCharts.delete(chart);
}

export function propagateXAxisExtremes(source: Highcharts.Chart, min: number, max: number): void {
  for (const chart of linkedCharts) {
    if (chart === source) continue;
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) continue;
    chart.xAxis[0]?.setExtremes(min, max, true, false, { trigger: SYNC_TRIGGER });
  }
}

export function resetAllLinkedChartsXExtremes(): void {
  for (const chart of linkedCharts) {
    if (!chart.container || (chart as unknown as { destroyed?: boolean }).destroyed) continue;
    chart.xAxis[0]?.setExtremes(undefined, undefined, true, false, { trigger: SYNC_TRIGGER });
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
  }
}
