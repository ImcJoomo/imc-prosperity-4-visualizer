import fs from 'fs';
import path from 'path';

const DERIVED_CACHE_VERSION = 2;

export function createDerivedCacheApi({ logsDir, derivedDir }) {
  if (!fs.existsSync(derivedDir)) {
    fs.mkdirSync(derivedDir, { recursive: true });
  }

  const parsedMemoryCache = new Map();

  function rawLogPath(name) {
    return path.join(logsDir, `${name}.json`);
  }

  function parsedCachePath(name) {
    return path.join(derivedDir, `${name}.parsed.v${DERIVED_CACHE_VERSION}.json`);
  }

  function microPriceFromTopOfBook(bidPrices, bidVolumes, askPrices, askVolumes, fallback) {
    const pb = bidPrices[0];
    const pa = askPrices[0];
    const vb = bidVolumes[0];
    const va = askVolumes[0];
    if (
      pb === undefined ||
      pa === undefined ||
      vb === undefined ||
      va === undefined ||
      !Number.isFinite(pb) ||
      !Number.isFinite(pa) ||
      !Number.isFinite(vb) ||
      !Number.isFinite(va)
    ) {
      return Number.isFinite(fallback) ? fallback : 0;
    }
    const denom = vb + va;
    if (denom <= 0) {
      const mid = (pb + pa) / 2;
      return Number.isFinite(mid) ? mid : (Number.isFinite(fallback) ? fallback : 0);
    }
    const micro = (vb * pa + va * pb) / denom;
    return Number.isFinite(micro) ? micro : (Number.isFinite(fallback) ? fallback : 0);
  }

  function wallMidFromOrderDepth(depth) {
    const buys = Object.entries(depth.buyOrders || {});
    const sells = Object.entries(depth.sellOrders || {});
    if (buys.length === 0 || sells.length === 0) {
      return undefined;
    }

    let bwPrice = Number(buys[0][0]);
    let bwVol = buys[0][1];
    for (const [p, v] of buys) {
      if (v > bwVol) {
        bwVol = v;
        bwPrice = Number(p);
      }
    }

    let awPrice = Number(sells[0][0]);
    let awVol = sells[0][1];
    for (const [p, v] of sells) {
      if (v < awVol) {
        awVol = v;
        awPrice = Number(p);
      }
    }

    return (bwPrice + awPrice) / 2;
  }

  function getColumnValues(columns, indices) {
    const values = [];
    for (const index of indices) {
      const value = columns[index];
      if (value !== '') {
        values.push(parseFloat(value));
      }
    }
    return values;
  }

  function getActivityLogs(logLines) {
    const lines = String(logLines || '').split('\n');
    const rows = [];
    const lastKnownMicroPriceByProduct = new Map();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        break;
      }

      const columns = line.split(';');
      const bidPrices = getColumnValues(columns, [3, 5, 7]);
      const bidVolumes = getColumnValues(columns, [4, 6, 8]);
      const askPrices = getColumnValues(columns, [9, 11, 13]);
      const askVolumes = getColumnValues(columns, [10, 12, 14]);
      const product = columns[2];
      const fallbackMid = Number(columns[15]);
      const hasOrderBook = bidPrices.length > 0 || askPrices.length > 0;
      let microPrice = microPriceFromTopOfBook(bidPrices, bidVolumes, askPrices, askVolumes, fallbackMid);

      if (!hasOrderBook && (!Number.isFinite(fallbackMid) || fallbackMid === 0)) {
        microPrice = lastKnownMicroPriceByProduct.get(product) ?? microPrice;
      }

      if (Number.isFinite(microPrice) && microPrice !== 0) {
        lastKnownMicroPriceByProduct.set(product, microPrice);
      }

      rows.push({
        day: Number(columns[0]),
        timestamp: Number(columns[1]),
        product,
        bidPrices,
        bidVolumes,
        askPrices,
        askVolumes,
        microPrice,
        profitLoss: Number(columns[16]),
      });
    }
    return rows;
  }

  function decompressListings(compressed) {
    const listings = {};
    for (const [symbol, product, denomination] of compressed || []) {
      listings[symbol] = { symbol, product, denomination };
    }
    return listings;
  }

  function decompressOrderDepths(compressed) {
    const orderDepths = {};
    for (const [symbol, [buyOrders, sellOrders]] of Object.entries(compressed || {})) {
      orderDepths[symbol] = { buyOrders, sellOrders };
    }
    return orderDepths;
  }

  function decompressTrades(compressed) {
    const trades = {};
    for (const [symbol, price, quantity, buyer, seller, timestamp] of compressed || []) {
      if (!trades[symbol]) {
        trades[symbol] = [];
      }
      trades[symbol].push({ symbol, price, quantity, buyer, seller, timestamp });
    }
    return trades;
  }

  function decompressObservations(compressed) {
    const conversionObservations = {};
    for (const [product, [bidPrice, askPrice, transportFees, exportTariff, importTariff, sugarPrice, sunlightIndex]] of
      Object.entries((compressed || [null, {}])[1] || {})) {
      conversionObservations[product] = {
        bidPrice,
        askPrice,
        transportFees,
        exportTariff,
        importTariff,
        sugarPrice,
        sunlightIndex,
      };
    }
    return {
      plainValueObservations: (compressed || [{}, {}])[0] || {},
      conversionObservations,
    };
  }

  function decompressState(compressed) {
    return {
      timestamp: compressed[0],
      traderData: compressed[1],
      listings: decompressListings(compressed[2]),
      orderDepths: decompressOrderDepths(compressed[3]),
      ownTrades: decompressTrades(compressed[4]),
      marketTrades: decompressTrades(compressed[5]),
      position: compressed[6],
      observations: decompressObservations(compressed[7]),
    };
  }

  function decompressOrders(compressed) {
    const orders = {};
    for (const [symbol, price, quantity] of compressed || []) {
      if (!orders[symbol]) {
        orders[symbol] = [];
      }
      orders[symbol].push({ symbol, price, quantity });
    }
    return orders;
  }

  function getAlgorithmData(resultLog) {
    const rows = [];
    for (const logItem of resultLog.logs || []) {
      const lambdaLog = String(logItem.lambdaLog || '').trim();
      if (!lambdaLog) {
        continue;
      }

      const compressedDataRow = JSON.parse(lambdaLog);
      rows.push({
        state: decompressState(compressedDataRow[0]),
        orders: decompressOrders(compressedDataRow[1]),
        conversions: compressedDataRow[2],
        traderData: compressedDataRow[3],
        algorithmLogs: compressedDataRow[4],
        sandboxLogs: '',
      });
    }

    for (const row of rows) {
      const dayOffset = Math.floor(row.state.timestamp / 1000000) * 1000000;
      if (dayOffset === 0) {
        continue;
      }

      const adjustTimestamp = ts => {
        const adjusted = ts + dayOffset;
        return adjusted > row.state.timestamp ? adjusted - 1000000 : adjusted;
      };

      for (const symbol of Object.keys(row.state.ownTrades)) {
        for (const trade of row.state.ownTrades[symbol]) {
          trade.timestamp = adjustTimestamp(trade.timestamp);
        }
      }

      for (const symbol of Object.keys(row.state.marketTrades)) {
        for (const trade of row.state.marketTrades[symbol]) {
          trade.timestamp = adjustTimestamp(trade.timestamp);
        }
      }
    }

    return rows;
  }

  function createLevelSeries() {
    return [[], [], []];
  }

  function createSymbolChartCache() {
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

  function ensureSymbolCache(cache, symbol) {
    if (!cache[symbol]) {
      cache[symbol] = createSymbolChartCache();
    }
    return cache[symbol];
  }

  function pushLevelPoint(levels, index, point) {
    if (index >= 0 && index < levels.length) {
      levels[index].push(point);
    }
  }

  function sortMapEntries(map) {
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }

  function buildChartCache(algorithm) {
    const bySymbol = {};
    const rowsByTimestamp = {};
    const listingSymbols = new Set();
    const plainValueObservationSymbols = new Set();
    const conversionSymbols = new Set();
    const plainValueObservations = {};
    const totalProfitLossByTimestamp = new Map();
    const profitLossBySymbol = new Map();

    for (const row of algorithm.activityLogs) {
      listingSymbols.add(row.product);
      const symbolCache = ensureSymbolCache(bySymbol, row.product);
      const timestamp = row.timestamp;

      symbolCache.activityRows.push(row);
      symbolCache.priceLevels.micro.push([timestamp, row.microPrice]);
      row.bidPrices.forEach((price, index) => pushLevelPoint(symbolCache.priceLevels.bid, index, [timestamp, price]));
      row.askPrices.forEach((price, index) => pushLevelPoint(symbolCache.priceLevels.ask, index, [timestamp, price]));
      row.bidVolumes.forEach((volume, index) => pushLevelPoint(symbolCache.volumeLevels.bid, index, [timestamp, volume]));
      row.askVolumes.forEach((volume, index) => pushLevelPoint(symbolCache.volumeLevels.ask, index, [timestamp, volume]));

      totalProfitLossByTimestamp.set(timestamp, (totalProfitLossByTimestamp.get(timestamp) ?? 0) + row.profitLoss);

      if (!profitLossBySymbol.has(row.product)) {
        profitLossBySymbol.set(row.product, new Map());
      }
      const symbolPnL = profitLossBySymbol.get(row.product);
      symbolPnL.set(timestamp, (symbolPnL.get(timestamp) ?? 0) + row.profitLoss);
    }

    for (const trade of algorithm.tradeHistory || []) {
      listingSymbols.add(trade.symbol);
      const symbolCache = ensureSymbolCache(bySymbol, trade.symbol);
      const point = {
        x: trade.timestamp,
        y: trade.price,
        quantity: trade.quantity,
        buyer: trade.buyer,
        seller: trade.seller,
      };
      if (String(trade.buyer || '').includes('SUBMISSION')) {
        symbolCache.trades.filledBuy.push(point);
      } else if (String(trade.seller || '').includes('SUBMISSION')) {
        symbolCache.trades.filledSell.push(point);
      } else {
        symbolCache.trades.other.push(point);
      }
    }

    for (const row of algorithm.data) {
      const timestamp = row.state.timestamp;
      rowsByTimestamp[timestamp] = row;

      Object.keys(row.state.listings || {}).forEach(symbol => {
        listingSymbols.add(symbol);
        ensureSymbolCache(bySymbol, symbol);
      });

      Object.entries(row.state.observations.plainValueObservations || {}).forEach(([symbol, value]) => {
        plainValueObservationSymbols.add(symbol);
        ensureSymbolCache(bySymbol, symbol).plainValueObservation.push([timestamp, value]);
        if (!plainValueObservations[symbol]) {
          plainValueObservations[symbol] = [];
        }
        plainValueObservations[symbol].push([timestamp, value]);
      });

      Object.entries(row.state.observations.conversionObservations || {}).forEach(([symbol, observation]) => {
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

      Object.entries(row.state.orderDepths || {}).forEach(([symbol, depth]) => {
        const wallMid = wallMidFromOrderDepth(depth);
        if (wallMid !== undefined) {
          ensureSymbolCache(bySymbol, symbol).wallMid.push([timestamp, wallMid]);
        }
      });

      Object.entries(row.orders || {}).forEach(([symbol, orders]) => {
        const symbolCache = ensureSymbolCache(bySymbol, symbol);
        listingSymbols.add(symbol);
        for (const order of orders) {
          const point = { x: timestamp, y: order.price, quantity: Math.abs(order.quantity) };
          if (order.quantity > 0) {
            symbolCache.orders.buy.push(point);
          } else if (order.quantity < 0) {
            symbolCache.orders.sell.push(point);
          }
        }
      });
    }

    const sortedListingSymbols = [...listingSymbols].sort((a, b) => a.localeCompare(b));
    for (const row of algorithm.data) {
      const timestamp = row.state.timestamp;
      for (const symbol of sortedListingSymbols) {
        ensureSymbolCache(bySymbol, symbol).position.push([timestamp, row.state.position[symbol] || 0]);
      }
    }

    for (const [symbol, series] of profitLossBySymbol.entries()) {
      ensureSymbolCache(bySymbol, symbol).profitLoss = sortMapEntries(series);
    }

    return {
      listingSymbols: sortedListingSymbols,
      plainValueObservationSymbols: [...plainValueObservationSymbols].sort((a, b) => a.localeCompare(b)),
      conversionSymbols: [...conversionSymbols].sort((a, b) => a.localeCompare(b)),
      rowsByTimestamp,
      timestampMin: algorithm.data[0]?.state.timestamp ?? 0,
      timestampMax: algorithm.data[algorithm.data.length - 1]?.state.timestamp ?? 0,
      timestampStep: algorithm.data.length >= 2 ? algorithm.data[1].state.timestamp - algorithm.data[0].state.timestamp : 1,
      totalProfitLoss: sortMapEntries(totalProfitLossByTimestamp),
      plainValueObservations,
      bySymbol,
    };
  }

  function parseResultLog(resultLog) {
    const activityLogs = getActivityLogs(resultLog.activitiesLog || '');
    const data = getAlgorithmData(resultLog);
    const algorithm = {
      activityLogs,
      data,
      tradeHistory: resultLog.tradeHistory || [],
      chartCache: undefined,
    };
    algorithm.chartCache = buildChartCache(algorithm);
    return algorithm;
  }

  function ensureParsedCache(name) {
    const sourcePath = rawLogPath(name);
    if (!fs.existsSync(sourcePath)) {
      parsedMemoryCache.delete(name);
      return null;
    }

    const sourceStats = fs.statSync(sourcePath);
    const cachePath = parsedCachePath(name);
    const memoryCached = parsedMemoryCache.get(name);
    if (
      memoryCached &&
      memoryCached.sourceModifiedAt === sourceStats.mtimeMs &&
      memoryCached.version === DERIVED_CACHE_VERSION
    ) {
      return memoryCached.algorithm;
    }

    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cached.sourceModifiedAt === sourceStats.mtimeMs && cached.version === DERIVED_CACHE_VERSION) {
        parsedMemoryCache.set(name, cached);
        return cached.algorithm;
      }
    }

    const resultLog = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    const algorithm = parseResultLog(resultLog);
    const cacheRecord = {
      version: DERIVED_CACHE_VERSION,
      sourceModifiedAt: sourceStats.mtimeMs,
      algorithm,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheRecord));
    parsedMemoryCache.set(name, cacheRecord);
    return algorithm;
  }

  function warmParsedCache(name) {
    setImmediate(() => {
      try {
        ensureParsedCache(name);
      } catch (error) {
        console.error(`Failed to warm derived cache for ${name}:`, error);
      }
    });
  }

  function deleteParsedCache(name) {
    parsedMemoryCache.delete(name);
    const cachePath = parsedCachePath(name);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  }

  function filterRange(points, from, to, xAccessor = point => point[0]) {
    return points.filter(point => {
      const x = xAccessor(point);
      if (from != null && x < from) return false;
      if (to != null && x > to) return false;
      return true;
    });
  }

  function bucketDownsample(points, targetPoints, xAccessor = point => point[0], yAccessor = point => point[1]) {
    if (!targetPoints || points.length <= targetPoints) {
      return points;
    }
    const bucketSize = Math.ceil(points.length / Math.max(1, Math.floor(targetPoints / 2)));
    const result = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      if (bucket.length === 0) continue;
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      let min = bucket[0];
      let max = bucket[0];
      for (const point of bucket) {
        if (yAccessor(point) < yAccessor(min)) min = point;
        if (yAccessor(point) > yAccessor(max)) max = point;
      }
      const byX = [first, min, max, last]
        .filter((point, index, arr) => arr.findIndex(other => xAccessor(other) === xAccessor(point) && yAccessor(other) === yAccessor(point)) === index)
        .sort((a, b) => xAccessor(a) - xAccessor(b));
      result.push(...byX);
    }
    return result;
  }

  function downsampleXY(points, from, to, targetPoints) {
    return bucketDownsample(filterRange(points || [], from, to), targetPoints, point => point[0], point => point[1]);
  }

  function downsampleScatter(points, from, to, targetPoints) {
    return bucketDownsample(filterRange(points || [], from, to, point => point.x), targetPoints, point => point.x, point => point.y);
  }

  function aggregateCandles(activityRows, groupSize) {
    const candles = [];
    const size = Math.max(1, groupSize || 1);
    for (let i = 0; i < activityRows.length; i += size) {
      const group = activityRows.slice(i, i + size);
      if (group.length === 0) continue;
      const timestamp = group[0].timestamp;
      const open = group[0].microPrice;
      const close = group[group.length - 1].microPrice;
      let high = -Infinity;
      let low = Infinity;
      for (const row of group) {
        if (row.askPrices.length > 0) high = Math.max(high, row.askPrices[0]);
        high = Math.max(high, row.microPrice);
        if (row.bidPrices.length > 0) low = Math.min(low, row.bidPrices[0]);
        low = Math.min(low, row.microPrice);
      }
      candles.push([timestamp, open, high, low, close]);
    }
    return candles;
  }

  function mergeCandles(candles, targetPoints) {
    if (!targetPoints || candles.length <= targetPoints) {
      return candles;
    }
    const bucketSize = Math.ceil(candles.length / targetPoints);
    const result = [];
    for (let i = 0; i < candles.length; i += bucketSize) {
      const bucket = candles.slice(i, i + bucketSize);
      if (bucket.length === 0) continue;
      let high = -Infinity;
      let low = Infinity;
      for (const candle of bucket) {
        high = Math.max(high, candle[2]);
        low = Math.min(low, candle[3]);
      }
      result.push([bucket[0][0], bucket[0][1], high, low, bucket[bucket.length - 1][4]]);
    }
    return result;
  }

  function getChartData(name, chartType, query) {
    const algorithm = ensureParsedCache(name);
    if (!algorithm) {
      return null;
    }

    const cache = algorithm.chartCache;
    const symbol = query.symbol;
    const from = query.from != null ? Number(query.from) : null;
    const to = query.to != null ? Number(query.to) : null;
    const targetPoints = query.targetPoints != null ? Number(query.targetPoints) : 1200;
    const symbolCache = symbol ? cache.bySymbol[symbol] : null;

    if (chartType === 'candlestick') {
      const mode = query.mode || 'movement';
      if (!symbolCache) return null;
      if (mode === 'movement') {
        const groupSize = Number(query.groupSize || 10);
        const rows = filterRange(symbolCache.activityRows, from, to, row => row.timestamp);
        return { series: mergeCandles(aggregateCandles(rows, groupSize), targetPoints) };
      }
      if (mode === 'price') {
        return {
          series: {
            bid3: downsampleXY(symbolCache.priceLevels.bid[2], from, to, targetPoints),
            bid2: downsampleXY(symbolCache.priceLevels.bid[1], from, to, targetPoints),
            bid1: downsampleXY(symbolCache.priceLevels.bid[0], from, to, targetPoints),
            micro: downsampleXY(symbolCache.priceLevels.micro, from, to, targetPoints),
            ask1: downsampleXY(symbolCache.priceLevels.ask[0], from, to, targetPoints),
            ask2: downsampleXY(symbolCache.priceLevels.ask[1], from, to, targetPoints),
            ask3: downsampleXY(symbolCache.priceLevels.ask[2], from, to, targetPoints),
          },
        };
      }
      return {
        series: {
          bid3: downsampleXY(symbolCache.volumeLevels.bid[2], from, to, targetPoints),
          bid2: downsampleXY(symbolCache.volumeLevels.bid[1], from, to, targetPoints),
          bid1: downsampleXY(symbolCache.volumeLevels.bid[0], from, to, targetPoints),
          ask1: downsampleXY(symbolCache.volumeLevels.ask[0], from, to, targetPoints),
          ask2: downsampleXY(symbolCache.volumeLevels.ask[1], from, to, targetPoints),
          ask3: downsampleXY(symbolCache.volumeLevels.ask[2], from, to, targetPoints),
        },
      };
    }

    if (chartType === 'orders') {
      if (!symbolCache) return null;
      const qtyMin = query.qtyMin != null ? Number(query.qtyMin) : null;
      const qtyMax = query.qtyMax != null ? Number(query.qtyMax) : null;
      const keepQty = point => (qtyMin == null || point.quantity >= qtyMin) && (qtyMax == null || point.quantity <= qtyMax);
      const priceMode = query.priceMode || 'micro';
      return {
        series: {
          micro: downsampleXY(symbolCache.priceLevels.micro, from, to, targetPoints),
          bid1: downsampleXY(symbolCache.priceLevels.bid[0], from, to, targetPoints),
          bid2: downsampleXY(symbolCache.priceLevels.bid[1], from, to, targetPoints),
          bid3: downsampleXY(symbolCache.priceLevels.bid[2], from, to, targetPoints),
          ask1: downsampleXY(symbolCache.priceLevels.ask[0], from, to, targetPoints),
          ask2: downsampleXY(symbolCache.priceLevels.ask[1], from, to, targetPoints),
          ask3: downsampleXY(symbolCache.priceLevels.ask[2], from, to, targetPoints),
          filledBuy: downsampleScatter(symbolCache.trades.filledBuy.filter(keepQty), from, to, targetPoints),
          filledSell: downsampleScatter(symbolCache.trades.filledSell.filter(keepQty), from, to, targetPoints),
          other: downsampleScatter(symbolCache.trades.other.filter(keepQty), from, to, targetPoints),
          orderBuy: downsampleScatter(symbolCache.orders.buy.filter(keepQty), from, to, targetPoints),
          orderSell: downsampleScatter(symbolCache.orders.sell.filter(keepQty), from, to, targetPoints),
          priceMode,
        },
      };
    }

    if (chartType === 'conversion' && symbolCache) {
      return {
        series: {
          bid: downsampleXY(symbolCache.conversion.bid, from, to, targetPoints),
          ask: downsampleXY(symbolCache.conversion.ask, from, to, targetPoints),
        },
      };
    }

    if (chartType === 'environment' && symbolCache) {
      return {
        series: {
          sugarPrice: downsampleXY(symbolCache.conversion.sugarPrice, from, to, targetPoints),
          sunlightIndex: downsampleXY(symbolCache.conversion.sunlightIndex, from, to, targetPoints),
        },
      };
    }

    if (chartType === 'transport' && symbolCache) {
      return {
        series: {
          transportFees: downsampleXY(symbolCache.conversion.transportFees, from, to, targetPoints),
          importTariff: downsampleXY(symbolCache.conversion.importTariff, from, to, targetPoints),
          exportTariff: downsampleXY(symbolCache.conversion.exportTariff, from, to, targetPoints),
        },
      };
    }

    if (chartType === 'plain' && symbolCache) {
      return {
        series: {
          value: downsampleXY(symbolCache.plainValueObservation, from, to, targetPoints),
        },
      };
    }

    if (chartType === 'profit-loss') {
      const symbols = String(query.symbols || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      return {
        series: {
          total: downsampleXY(cache.totalProfitLoss, from, to, targetPoints),
          bySymbol: Object.fromEntries(
            symbols.map(key => [key, downsampleXY(cache.bySymbol[key]?.profitLoss || [], from, to, targetPoints)]),
          ),
        },
      };
    }

    if (chartType === 'position') {
      const symbols = String(query.symbols || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      return {
        series: {
          bySymbol: Object.fromEntries(
            symbols.map(key => [key, downsampleXY(cache.bySymbol[key]?.position || [], from, to, targetPoints)]),
          ),
        },
      };
    }

    return null;
  }

  return {
    ensureParsedCache,
    warmParsedCache,
    deleteParsedCache,
    getChartData,
  };
}
