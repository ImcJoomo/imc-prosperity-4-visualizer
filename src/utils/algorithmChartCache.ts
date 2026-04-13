import {
  Algorithm,
  AlgorithmChartCache,
  AlgorithmSymbolChartCache,
  CachedOrderPoint,
  XYSeries,
} from '../models.ts';
import { wallMidFromOrderDepth } from './priceNormalization.ts';

function createLevelSeries(): [XYSeries, XYSeries, XYSeries] {
  return [[], [], []];
}

function createSymbolChartCache(): AlgorithmSymbolChartCache {
  return {
    activityRows: [],
    priceLevels: {
      micro: [],
      bid: createLevelSeries(),
      ask: createLevelSeries(),
    },
    volumeLevels: {
      bid: createLevelSeries(),
      ask: createLevelSeries(),
    },
    plainValueObservation: [],
    wallMid: [],
    conversion: {
      bid: [],
      ask: [],
      transportFees: [],
      importTariff: [],
      exportTariff: [],
      sugarPrice: [],
      sunlightIndex: [],
    },
    trades: {
      filledBuy: [],
      filledSell: [],
      other: [],
    },
    orders: {
      buy: [],
      sell: [],
    },
    position: [],
    profitLoss: [],
  };
}

function ensureSymbolCache(cache: Record<string, AlgorithmSymbolChartCache>, symbol: string): AlgorithmSymbolChartCache {
  if (!cache[symbol]) {
    cache[symbol] = createSymbolChartCache();
  }
  return cache[symbol];
}

function pushLevelPoint(levels: [XYSeries, XYSeries, XYSeries], index: number, point: [number, number]): void {
  if (index >= 0 && index < levels.length) {
    levels[index].push(point);
  }
}

function sortMapEntries(map: Map<number, number>): XYSeries {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function buildDensePositions(algorithm: Algorithm, listingSymbols: string[], bySymbol: Record<string, AlgorithmSymbolChartCache>): void {
  for (const row of algorithm.data) {
    const timestamp = row.state.timestamp;
    for (const symbol of listingSymbols) {
      const symbolCache = bySymbol[symbol];
      if (!symbolCache) {
        continue;
      }
      symbolCache.position.push([timestamp, row.state.position[symbol] || 0]);
    }
  }
}

export function buildAlgorithmChartCache(algorithm: Algorithm): AlgorithmChartCache {
  const bySymbol: Record<string, AlgorithmSymbolChartCache> = {};
  const rowsByTimestamp: Record<number, (typeof algorithm.data)[number]> = {};
  const listingSymbols = new Set<string>();
  const plainValueObservationSymbols = new Set<string>();
  const conversionSymbols = new Set<string>();
  const plainValueObservations: Record<string, XYSeries> = {};

  const totalProfitLossByTimestamp = new Map<number, number>();
  const profitLossBySymbol = new Map<string, Map<number, number>>();

  for (const row of algorithm.activityLogs) {
    listingSymbols.add(row.product);
    const symbolCache = ensureSymbolCache(bySymbol, row.product);
    const timestamp = row.timestamp;

    symbolCache.activityRows.push(row);
    symbolCache.priceLevels.micro.push([timestamp, row.microPrice]);

    row.bidPrices.forEach((price, index) => {
      pushLevelPoint(symbolCache.priceLevels.bid, index, [timestamp, price]);
    });
    row.askPrices.forEach((price, index) => {
      pushLevelPoint(symbolCache.priceLevels.ask, index, [timestamp, price]);
    });
    row.bidVolumes.forEach((volume, index) => {
      pushLevelPoint(symbolCache.volumeLevels.bid, index, [timestamp, volume]);
    });
    row.askVolumes.forEach((volume, index) => {
      pushLevelPoint(symbolCache.volumeLevels.ask, index, [timestamp, volume]);
    });

    totalProfitLossByTimestamp.set(timestamp, (totalProfitLossByTimestamp.get(timestamp) ?? 0) + row.profitLoss);

    if (!profitLossBySymbol.has(row.product)) {
      profitLossBySymbol.set(row.product, new Map<number, number>());
    }
    const symbolProfitLoss = profitLossBySymbol.get(row.product)!;
    symbolProfitLoss.set(timestamp, (symbolProfitLoss.get(timestamp) ?? 0) + row.profitLoss);
  }

  for (const trade of algorithm.tradeHistory) {
    listingSymbols.add(trade.symbol);
    const symbolCache = ensureSymbolCache(bySymbol, trade.symbol);
    const point: CachedOrderPoint = {
      x: trade.timestamp,
      y: trade.price,
      quantity: trade.quantity,
      buyer: trade.buyer,
      seller: trade.seller,
    };

    if (trade.buyer.includes('SUBMISSION')) {
      symbolCache.trades.filledBuy.push(point);
    } else if (trade.seller.includes('SUBMISSION')) {
      symbolCache.trades.filledSell.push(point);
    } else {
      symbolCache.trades.other.push(point);
    }
  }

  for (const row of algorithm.data) {
    const timestamp = row.state.timestamp;
    rowsByTimestamp[timestamp] = row;

    Object.keys(row.state.listings).forEach(symbol => {
      listingSymbols.add(symbol);
      ensureSymbolCache(bySymbol, symbol);
    });

    Object.entries(row.state.observations.plainValueObservations).forEach(([symbol, value]) => {
      plainValueObservationSymbols.add(symbol);
      ensureSymbolCache(bySymbol, symbol).plainValueObservation.push([timestamp, value]);
      if (!plainValueObservations[symbol]) {
        plainValueObservations[symbol] = [];
      }
      plainValueObservations[symbol].push([timestamp, value]);
    });

    Object.entries(row.state.observations.conversionObservations).forEach(([symbol, observation]) => {
      conversionSymbols.add(symbol);
      const symbolCache = ensureSymbolCache(bySymbol, symbol);
      symbolCache.conversion.bid.push([timestamp, observation.bidPrice]);
      symbolCache.conversion.ask.push([timestamp, observation.askPrice]);
      symbolCache.conversion.transportFees.push([timestamp, observation.transportFees]);
      symbolCache.conversion.importTariff.push([timestamp, observation.importTariff]);
      symbolCache.conversion.exportTariff.push([timestamp, observation.exportTariff]);
      symbolCache.conversion.sugarPrice.push([timestamp, observation.sugarPrice]);
      symbolCache.conversion.sunlightIndex.push([timestamp, observation.sunlightIndex]);
    });

    Object.entries(row.state.orderDepths).forEach(([symbol, depth]) => {
      const wallMid = wallMidFromOrderDepth(depth);
      if (wallMid === undefined) {
        return;
      }
      ensureSymbolCache(bySymbol, symbol).wallMid.push([timestamp, wallMid]);
    });

    Object.entries(row.orders).forEach(([symbol, orders]) => {
      listingSymbols.add(symbol);
      const symbolCache = ensureSymbolCache(bySymbol, symbol);
      for (const order of orders) {
        const point: CachedOrderPoint = {
          x: timestamp,
          y: order.price,
          quantity: Math.abs(order.quantity),
        };
        if (order.quantity > 0) {
          symbolCache.orders.buy.push(point);
        } else if (order.quantity < 0) {
          symbolCache.orders.sell.push(point);
        }
      }
    });
  }

  const sortedListingSymbols = [...listingSymbols].sort((a, b) => a.localeCompare(b));
  buildDensePositions(algorithm, sortedListingSymbols, bySymbol);

  for (const [symbol, series] of profitLossBySymbol.entries()) {
    ensureSymbolCache(bySymbol, symbol).profitLoss = sortMapEntries(series);
  }

  const timestampMin = algorithm.data[0]?.state.timestamp ?? 0;
  const timestampMax = algorithm.data[algorithm.data.length - 1]?.state.timestamp ?? 0;
  const timestampStep =
    algorithm.data.length >= 2 ? algorithm.data[1].state.timestamp - algorithm.data[0].state.timestamp : 1;

  return {
    listingSymbols: sortedListingSymbols,
    plainValueObservationSymbols: [...plainValueObservationSymbols].sort((a, b) => a.localeCompare(b)),
    conversionSymbols: [...conversionSymbols].sort((a, b) => a.localeCompare(b)),
    rowsByTimestamp,
    timestampMin,
    timestampMax,
    timestampStep,
    totalProfitLoss: sortMapEntries(totalProfitLossByTimestamp),
    plainValueObservations,
    bySymbol,
  };
}
