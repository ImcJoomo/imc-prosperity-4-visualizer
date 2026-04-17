import { Box } from '@mantine/core';
import Highcharts from 'highcharts/highstock';
import HighchartsAccessibility from 'highcharts/modules/accessibility';
import HighchartsExporting from 'highcharts/modules/exporting';
import HighchartsOfflineExporting from 'highcharts/modules/offline-exporting';
import HighchartsHighContrastDarkTheme from 'highcharts/themes/high-contrast-dark';
import HighchartsReact from 'highcharts-react-official';
import merge from 'lodash/merge';
import { ReactNode, useMemo } from 'react';
import { useActualColorScheme } from '../../hooks/use-actual-color-scheme.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { isPerfExperimentsEnabled } from '../../utils/perfMode.ts';
import {
  clearSyncedCrosshairPlotLines,
  isVisualizerSyncTrigger,
  propagateXAxisExtremes,
  registerLinkedChart,
  schedulePropagateXAxisExtremes,
  syncCrosshairPlotLines,
  unregisterLinkedChart,
} from './chartLinkRegistry.ts';
import { VisualizerCard } from './VisualizerCard.tsx';

HighchartsAccessibility(Highcharts);
HighchartsExporting(Highcharts);
HighchartsOfflineExporting(Highcharts);

// Highcharts themes are distributed as Highcharts extensions
// The normal way to use them is to apply these extensions to the global Highcharts object
// However, themes work by overriding the default options, with no way to rollback
// To make theme switching work, we merge theme options into the local chart options instead
// This way we don't override the global defaults and can change themes without refreshing
// This function is a little workaround to be able to get the options a theme overrides
function getThemeOptions(theme: (highcharts: typeof Highcharts) => void): Highcharts.Options {
  const highchartsMock = {
    _modules: {
      'Core/Globals.js': {
        theme: null,
      },
      'Core/Defaults.js': {
        setOptions: () => {
          // Do nothing
        },
      },
    },
    win: {
      dispatchEvent: () => {},
    },
  };

  theme(highchartsMock as any);

  return highchartsMock._modules['Core/Globals.js'].theme! as Highcharts.Options;
}

interface ChartProps {
  title: string;
  options?: Highcharts.Options;
  series: Highcharts.SeriesOptionsType[];
  min?: number;
  max?: number;
  controls?: ReactNode;
}

function ensurePersistentResetZoomButton(chart: Highcharts.Chart): void {
  if (!isPerfExperimentsEnabled) {
    return;
  }

  const chartWithResetZoom = chart as Highcharts.Chart & {
    resetZoomButton?: Highcharts.SVGElement | null;
    showResetZoom?: () => void;
  };

  if (!chartWithResetZoom.resetZoomButton && typeof chartWithResetZoom.showResetZoom === 'function') {
    chartWithResetZoom.showResetZoom();
  }
}

function getHoveredPointX(chart: Highcharts.Chart): number | null {
  const chartWithHover = chart as Highcharts.Chart & {
    hoverPoint?: Highcharts.Point | null;
    hoverPoints?: Highcharts.Point[] | null;
  };

  const hoverPoint = chartWithHover.hoverPoint;
  if (typeof hoverPoint?.x === 'number' && !Number.isNaN(hoverPoint.x)) {
    return hoverPoint.x;
  }

  const hoverPoints = chartWithHover.hoverPoints;
  if (!hoverPoints) {
    return null;
  }

  for (const point of hoverPoints) {
    if (typeof point?.x === 'number' && !Number.isNaN(point.x)) {
      return point.x;
    }
  }

  return null;
}

export function Chart({ title, options, series, min, max, controls }: ChartProps): ReactNode {
  const colorScheme = useActualColorScheme();
  const algorithm = useStore(state => state.algorithm);
  const linkedZoom = useStore(state => state.visualizerLinkedZoom);
  const coarseGrouping = useStore(state => state.visualizerCoarseGrouping);
  const syncCrosshair = useStore(state => state.visualizerSyncCrosshair);

  const fullOptions = useMemo((): Highcharts.Options => {
    const themeOptions = colorScheme === 'light' ? {} : getThemeOptions(HighchartsHighContrastDarkTheme);

    const chartOptions: Highcharts.Options = {
      chart: {
        animation: false,
        height: 400,
        zooming: {
          type: 'x',
        },
        panning: {
          enabled: true,
          type: 'x',
        },
        panKey: 'shift',
        numberFormatter: formatNumber,
        events: {
          load(this: Highcharts.Chart) {
            registerLinkedChart(this);
            ensurePersistentResetZoomButton(this);
            let detailRaf = 0;
            let crosshairRaf = 0;
            let pendingCrosshairX: number | null = null;

            const onContainerMove = (e: MouseEvent): void => {
              const st = useStore.getState();
              const pos = this.pointer.normalize(e as unknown as PointerEvent);
              if (!pos) {
                return;
              }
              const { chartX, chartY } = pos;
              const { plotLeft, plotWidth, plotTop, plotHeight } = this;
              const insidePlot =
                chartX >= plotLeft &&
                chartX <= plotLeft + plotWidth &&
                chartY >= plotTop &&
                chartY <= plotTop + plotHeight;

              if (!st.visualizerSyncCrosshair) {
                clearSyncedCrosshairPlotLines();
              } else if (insidePlot) {
                const rawXVal = this.xAxis[0].toValue(chartX);
                const xVal = isPerfExperimentsEnabled ? getHoveredPointX(this) ?? rawXVal : rawXVal;
                if (typeof xVal === 'number' && !Number.isNaN(xVal)) {
                  pendingCrosshairX = xVal;
                  if (!crosshairRaf) {
                    crosshairRaf = window.requestAnimationFrame(() => {
                      crosshairRaf = 0;
                      const xv = pendingCrosshairX;
                      if (xv !== null && useStore.getState().visualizerSyncCrosshair) {
                        syncCrosshairPlotLines(this, xv);
                      }
                    });
                  }
                }
              } else {
                clearSyncedCrosshairPlotLines();
              }

              if (!st.visualizerFollowTimestampDetail || !insidePlot) {
                return;
              }
              if (detailRaf) {
                return;
              }
              detailRaf = window.requestAnimationFrame(() => {
                detailRaf = 0;
                const xVal = this.xAxis[0].toValue(chartX);
                if (typeof xVal !== 'number' || Number.isNaN(xVal)) {
                  return;
                }
                useStore.getState().setVisualizerDetailTimestamp(xVal);
              });
            };
            const onContainerLeave = (): void => {
              clearSyncedCrosshairPlotLines();
            };
            this.container.addEventListener('mousemove', onContainerMove);
            this.container.addEventListener('mouseleave', onContainerLeave);
            Highcharts.addEvent(this, 'destroy', () => {
              if (detailRaf) {
                window.cancelAnimationFrame(detailRaf);
              }
              if (crosshairRaf) {
                window.cancelAnimationFrame(crosshairRaf);
              }
              this.container.removeEventListener('mousemove', onContainerMove);
              this.container.removeEventListener('mouseleave', onContainerLeave);
              unregisterLinkedChart(this);
            });
            Highcharts.addEvent(this.tooltip, 'headerFormatter', (e: any) => {
              if (e.isFooter) {
                return true;
              }

              let timestamp = e.labelConfig.point.x;

              if (e.labelConfig.point.dataGroup) {
                const xData = e.labelConfig.series.xData;
                const lastTimestamp = xData[xData.length - 1];
                if (timestamp + 100 * e.labelConfig.point.dataGroup.length >= lastTimestamp) {
                  timestamp = lastTimestamp;
                }
              }

              e.text = `Timestamp ${formatNumber(timestamp)}<br/>`;
              return false;
            });
          },
          fullscreenOpen(this: Highcharts.Chart) {
            (this as any).tooltip.update({ outside: false });
          },
          fullscreenClose(this: Highcharts.Chart) {
            (this as any).tooltip.update({ outside: true });
          },
          render(this: Highcharts.Chart) {
            ensurePersistentResetZoomButton(this);
          },
        },
      },
      title: {
        text: title,
      },
      credits: {
        href: 'javascript:window.open("https://www.highcharts.com/?credits", "_blank")',
      },
      plotOptions: {
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click(this: Highcharts.Point) {
                if (typeof this.x === 'number' && !Number.isNaN(this.x)) {
                  const st = useStore.getState();
                  st.setVisualizerFollowTimestampDetail(false);
                  st.setVisualizerClickedTimestamp(this.x);
                }
              },
            },
          },
          dataGrouping: {
            approximation(this: any, values: number[]): number {
              const endIndex = this.dataGroupInfo.start + this.dataGroupInfo.length;
              if (endIndex < this.xData.length) {
                return values[0];
              } else {
                return values[values.length - 1];
              }
            },
            anchor: 'start',
            firstAnchor: 'firstPoint',
            lastAnchor: 'lastPoint',
            units: [coarseGrouping ? ['second', [5, 10, 30, 60]] : ['second', [1, 2, 5, 10]]],
          },
        },
      },
      xAxis: {
        type: 'datetime',
        ...(isPerfExperimentsEnabled && algorithm?.chartCache
          ? {
              min: algorithm.chartCache.timestampMin,
              max: algorithm.chartCache.timestampMax,
              ordinal: false,
            }
          : {}),
        title: {
          text: 'Timestamp',
        },
        crosshair: {
          width: 1,
        },
        labels: {
          formatter: params => formatNumber(params.value as number),
        },
        events: {
          afterSetExtremes(this: Highcharts.Axis, e: Highcharts.AxisSetExtremesEventObject) {
            const syncTrigger = isVisualizerSyncTrigger(String(e.trigger));
            if (!useStore.getState().visualizerLinkedZoom) {
              return;
            }
            if (syncTrigger) {
              return;
            }
            const { min, max } = this.getExtremes();
            if (min == null || max == null) {
              return;
            }
            if (isPerfExperimentsEnabled) {
              schedulePropagateXAxisExtremes(this.chart, min, max);
              return;
            }
            propagateXAxisExtremes(this.chart, min, max);
          },
        },
      },
      yAxis: {
        opposite: false,
        allowDecimals: false,
        min,
        max,
      },
      tooltip: {
        split: false,
        shared: true,
        outside: true,
      },
      legend: {
        enabled: true,
      },
      rangeSelector: {
        enabled: false,
      },
      navigator: {
        enabled: false,
      },
      scrollbar: {
        enabled: false,
      },
      series,
      ...options,
    };

    return merge(themeOptions, chartOptions);
  }, [algorithm, colorScheme, title, options, series, min, max, linkedZoom, coarseGrouping, syncCrosshair]);

  return (
    <VisualizerCard p={0}>
      {controls && (
        <Box p="md" pb={0}>
          {controls}
        </Box>
      )}
      <HighchartsReact
        highcharts={Highcharts}
        constructorType={'stockChart'}
        options={fullOptions}
        immutable
      />
    </VisualizerCard>
  );
}
