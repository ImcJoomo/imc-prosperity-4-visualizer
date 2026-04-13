export interface ResultLog {
  submissionId: string;
  activitiesLog: string;
  logs: ResultLogItems[];
  tradeHistory: ResultLogTradeHistoryItem[];
}

export interface ResultLogItems {
  sandboxLog: string;
  lambdaLog: string;
  timestamp: number;
}

export interface ResultLogTradeHistoryItem {
  timestamp: number;
  buyer: string;
  seller: string;
  currency: string;
  price: number;
  quantity: number;
  symbol: string
}

export interface UserSummary {
  id: number;
  firstName: string;
  lastName: string;
}

export interface AlgorithmSummary {
  id: string;
  content: string;
  fileName: string;
  round: string;
  selectedForRound: boolean;
  status: string;
  teamId: string;
  timestamp: string;
  graphLog: string;
  user: UserSummary;
}

export type Time = number;
export type ProsperitySymbol = string;
export type Product = string;
export type Position = number;
export type UserId = string;
export type ObservationValue = number;

export interface ActivityLogRow {
  day: number;
  timestamp: number;
  product: Product;
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
  microPrice: number;
  profitLoss: number;
}

export interface Listing {
  symbol: ProsperitySymbol;
  product: Product;
  denomination: Product;
}

export interface ConversionObservation {
  bidPrice: number;
  askPrice: number;
  transportFees: number;
  exportTariff: number;
  importTariff: number;
  sugarPrice: number;
  sunlightIndex: number;
}

export interface Observation {
  plainValueObservations: Record<Product, ObservationValue>;
  conversionObservations: Record<Product, ConversionObservation>;
}

export interface Order {
  symbol: ProsperitySymbol;
  price: number;
  quantity: number;
}

export interface OrderDepth {
  buyOrders: Record<number, number>;
  sellOrders: Record<number, number>;
}

export interface Trade {
  symbol: ProsperitySymbol;
  price: number;
  quantity: number;
  buyer: UserId;
  seller: UserId;
  timestamp: Time;
}

export interface TradingState {
  timestamp: Time;
  traderData: string;
  listings: Record<ProsperitySymbol, Listing>;
  orderDepths: Record<ProsperitySymbol, OrderDepth>;
  ownTrades: Record<ProsperitySymbol, Trade[]>;
  marketTrades: Record<ProsperitySymbol, Trade[]>;
  position: Record<Product, Position>;
  observations: Observation;
}

export interface AlgorithmDataRow {
  state: TradingState;
  orders: Record<ProsperitySymbol, Order[]>;
  conversions: number;
  traderData: string;
  algorithmLogs: string;
  sandboxLogs: string;
}

export type XYSeries = [number, number][];

export interface CachedOrderPoint {
  x: number;
  y: number;
  quantity: number;
  buyer?: string;
  seller?: string;
}

export interface AlgorithmSymbolChartCache {
  activityRows: ActivityLogRow[];
  priceLevels: {
    micro: XYSeries;
    bid: [XYSeries, XYSeries, XYSeries];
    ask: [XYSeries, XYSeries, XYSeries];
  };
  volumeLevels: {
    bid: [XYSeries, XYSeries, XYSeries];
    ask: [XYSeries, XYSeries, XYSeries];
  };
  plainValueObservation: XYSeries;
  wallMid: XYSeries;
  conversion: {
    bid: XYSeries;
    ask: XYSeries;
    transportFees: XYSeries;
    importTariff: XYSeries;
    exportTariff: XYSeries;
    sugarPrice: XYSeries;
    sunlightIndex: XYSeries;
  };
  trades: {
    filledBuy: CachedOrderPoint[];
    filledSell: CachedOrderPoint[];
    other: CachedOrderPoint[];
  };
  orders: {
    buy: CachedOrderPoint[];
    sell: CachedOrderPoint[];
  };
  position: XYSeries;
  profitLoss: XYSeries;
}

export interface AlgorithmChartCache {
  listingSymbols: string[];
  plainValueObservationSymbols: string[];
  conversionSymbols: string[];
  rowsByTimestamp: Record<number, AlgorithmDataRow>;
  timestampMin: number;
  timestampMax: number;
  timestampStep: number;
  totalProfitLoss: XYSeries;
  plainValueObservations: Record<string, XYSeries>;
  bySymbol: Record<string, AlgorithmSymbolChartCache>;
}

export interface Algorithm {
  summary?: AlgorithmSummary;
  activityLogs: ActivityLogRow[];
  data: AlgorithmDataRow[];
  tradeHistory: ResultLogTradeHistoryItem[];
  chartCache?: AlgorithmChartCache;
}

export type CompressedListing = [symbol: ProsperitySymbol, product: Product, denomination: Product];

export type CompressedOrderDepth = [buyOrders: Record<number, number>, sellOrders: Record<number, number>];

export type CompressedTrade = [
  symbol: ProsperitySymbol,
  price: number,
  quantity: number,
  buyer: UserId,
  seller: UserId,
  timestamp: Time,
];

export type CompressedConversionObservation = [
  bidPrice: number,
  askPrice: number,
  transportFees: number,
  exportTariff: number,
  importTariff: number,
  sugarPrice: number,
  sunlightIndex: number,
];

export type CompressedObservations = [
  plainValueObservations: Record<Product, ObservationValue>,
  conversionObservations: Record<Product, CompressedConversionObservation>,
];

export type CompressedTradingState = [
  timestamp: Time,
  traderData: string,
  listings: CompressedListing[],
  orderDepths: Record<ProsperitySymbol, CompressedOrderDepth>,
  ownTrades: CompressedTrade[],
  marketTrades: CompressedTrade[],
  position: Record<Product, Position>,
  observations: CompressedObservations,
];

export type CompressedOrder = [symbol: ProsperitySymbol, price: number, quantity: number];

export type CompressedAlgorithmDataRow = [
  state: CompressedTradingState,
  orders: CompressedOrder[],
  conversions: number,
  traderData: string,
  logs: string,
];
