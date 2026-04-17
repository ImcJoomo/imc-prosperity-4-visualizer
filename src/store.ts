import { MantineColorScheme } from '@mantine/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Algorithm } from './models.ts';
import { NormalizationReference } from './utils/priceNormalization.ts';
import { hiddenSymbolsForIncludedProducts } from './utils/visualizerSymbols.ts';

export interface SetAlgorithmOptions {
  visibilityIncludedProducts?: string[] | null;
}

export interface State {
  colorScheme: MantineColorScheme;

  idToken: string;
  round: string;
  username: string;

  algorithm: Algorithm | null;
  currentLogName: string | null;

  visualizerLinkedZoom: boolean;
  visualizerPriceNormalization: boolean;
  visualizerNormalizationReference: NormalizationReference;
  visualizerCoarseGrouping: boolean;
  visualizerTradeQtyMin: number | null;
  visualizerTradeQtyMax: number | null;
  visualizerOrdersShowOwnTrades: boolean;
  visualizerOrdersShowOtherTrades: boolean;
  visualizerOrdersShowUnfilledBuys: boolean;
  visualizerOrdersShowUnfilledSells: boolean;
  visualizerFollowTimestampDetail: boolean;
  visualizerDetailTimestamp: number | null;
  visualizerClickedTimestamp: number | null;
  visualizerHiddenSymbols: string[];
  visualizerSyncCrosshair: boolean;
  visualizerRangeMin: number | null;
  visualizerRangeMax: number | null;

  setColorScheme: (colorScheme: MantineColorScheme) => void;
  setIdToken: (idToken: string) => void;
  setRound: (round: string) => void;
  setUsername: (username: string) => void;
  setAlgorithm: (algorithm: Algorithm | null, options?: SetAlgorithmOptions) => void;
  setCurrentLogName: (name: string | null) => void;
  setVisualizerLinkedZoom: (value: boolean) => void;
  setVisualizerPriceNormalization: (value: boolean) => void;
  setVisualizerNormalizationReference: (value: NormalizationReference) => void;
  setVisualizerCoarseGrouping: (value: boolean) => void;
  setVisualizerTradeQtyMin: (value: number | null) => void;
  setVisualizerTradeQtyMax: (value: number | null) => void;
  setVisualizerOrdersShowOwnTrades: (value: boolean) => void;
  setVisualizerOrdersShowOtherTrades: (value: boolean) => void;
  setVisualizerOrdersShowUnfilledBuys: (value: boolean) => void;
  setVisualizerOrdersShowUnfilledSells: (value: boolean) => void;
  setVisualizerFollowTimestampDetail: (value: boolean) => void;
  setVisualizerDetailTimestamp: (value: number | null) => void;
  setVisualizerClickedTimestamp: (value: number | null) => void;
  setVisualizerHiddenSymbols: (symbols: string[]) => void;
  setVisualizerSyncCrosshair: (value: boolean) => void;
  setVisualizerRange: (min: number | null, max: number | null) => void;
}

export const useStore = create<State>()(
  persist(
    set => ({
      colorScheme: 'auto',

      idToken: '',
      round: 'ROUND0',
      username: '',

      algorithm: null,
      currentLogName: null,

      visualizerLinkedZoom: true,
      visualizerPriceNormalization: false,
      visualizerNormalizationReference: 'micro',
      visualizerCoarseGrouping: false,
      visualizerTradeQtyMin: null,
      visualizerTradeQtyMax: null,
      visualizerOrdersShowOwnTrades: true,
      visualizerOrdersShowOtherTrades: true,
      visualizerOrdersShowUnfilledBuys: false,
      visualizerOrdersShowUnfilledSells: false,
      visualizerFollowTimestampDetail: false,
      visualizerDetailTimestamp: null,
      visualizerClickedTimestamp: null,
      visualizerHiddenSymbols: [],
      visualizerSyncCrosshair: true,
      visualizerRangeMin: null,
      visualizerRangeMax: null,

      setColorScheme: colorScheme => set({ colorScheme }),
      setIdToken: idToken => set({ idToken }),
      setRound: round => set({ round }),
      setUsername: username => set({ username }),
      setAlgorithm: (algorithm, options) => {
        if (!algorithm) {
          set({
            algorithm: null,
            visualizerHiddenSymbols: [],
            visualizerDetailTimestamp: null,
            visualizerRangeMin: null,
            visualizerRangeMax: null,
          });
          return;
        }
        const included = options?.visibilityIncludedProducts;
        const visualizerHiddenSymbols =
          included && included.length > 0 ? hiddenSymbolsForIncludedProducts(algorithm, included) : [];
        set({
          algorithm,
          visualizerHiddenSymbols,
          visualizerDetailTimestamp: null,
          visualizerRangeMin: null,
          visualizerRangeMax: null,
        });
      },
      setCurrentLogName: name => set({ currentLogName: name }),
      setVisualizerLinkedZoom: value => set({ visualizerLinkedZoom: value }),
      setVisualizerPriceNormalization: value => set({ visualizerPriceNormalization: value }),
      setVisualizerNormalizationReference: value => set({ visualizerNormalizationReference: value }),
      setVisualizerCoarseGrouping: value => set({ visualizerCoarseGrouping: value }),
      setVisualizerTradeQtyMin: value => set({ visualizerTradeQtyMin: value }),
      setVisualizerTradeQtyMax: value => set({ visualizerTradeQtyMax: value }),
      setVisualizerOrdersShowOwnTrades: value => set({ visualizerOrdersShowOwnTrades: value }),
      setVisualizerOrdersShowOtherTrades: value => set({ visualizerOrdersShowOtherTrades: value }),
      setVisualizerOrdersShowUnfilledBuys: value => set({ visualizerOrdersShowUnfilledBuys: value }),
      setVisualizerOrdersShowUnfilledSells: value => set({ visualizerOrdersShowUnfilledSells: value }),
      setVisualizerFollowTimestampDetail: value => set({ visualizerFollowTimestampDetail: value }),
      setVisualizerDetailTimestamp: value => set({ visualizerDetailTimestamp: value }),
      setVisualizerClickedTimestamp: value => set({ visualizerClickedTimestamp: value }),
      setVisualizerHiddenSymbols: symbols => set({ visualizerHiddenSymbols: symbols }),
      setVisualizerSyncCrosshair: value => set({ visualizerSyncCrosshair: value }),
      setVisualizerRange: (min, max) =>
        set(state =>
          state.visualizerRangeMin === min && state.visualizerRangeMax === max
            ? state
            : { visualizerRangeMin: min, visualizerRangeMax: max },
        ),
    }),
    {
      name: 'imc-prosperity-4-visualizer',
      partialize: state => ({
        colorScheme: state.colorScheme,
        idToken: state.idToken,
        round: state.round,
        username: state.username,
        currentLogName: state.currentLogName,
      }),
    },
  ),
);
