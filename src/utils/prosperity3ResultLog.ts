import type { ResultLog, ResultLogItems, ResultLogTradeHistoryItem } from '../models.ts';

type DayTsKey = { day: number; ts: number };

const HEADER_PREFIX = 'day;timestamp;';

function extractOrderedDayTimestampKeys(activitiesLog: string): DayTsKey[] {
  const lines = activitiesLog.split('\n');
  const keys: DayTsKey[] = [];
  let last: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === '') {
      break;
    }
    const cols = line.split(';');
    const day = Number(cols[0]);
    const ts = Number(cols[1]);
    if (!Number.isFinite(day) || !Number.isFinite(ts)) {
      continue;
    }
    const k = `${day};${ts}`;
    if (k !== last) {
      keys.push({ day, ts });
      last = k;
    }
  }
  return keys;
}

export function isProsperity3ResultLog(log: ResultLog): boolean {
  const id = String(log.submissionId ?? '').toLowerCase();
  if (id.includes('prosperity3bt-console') || id.includes('prosperity3')) {
    return true;
  }
  const header = log.activitiesLog?.split('\n')[0] ?? '';
  if (!header.startsWith(HEADER_PREFIX) || !log.logs?.length) {
    return false;
  }
  try {
    const keys = extractOrderedDayTimestampKeys(log.activitiesLog);
    if (keys.length === 0 || keys.length !== log.logs.length) {
      return false;
    }
    const first = JSON.parse(log.logs[0]!.lambdaLog) as unknown;
    if (!Array.isArray(first) || !Array.isArray(first[0])) {
      return false;
    }
    const stateTs = first[0]![0];
    return typeof stateTs === 'number' && stateTs < 1_000_000 && keys[0]!.ts === stateTs;
  } catch {
    return false;
  }
}

function needsMultiDayWithinDayGlue(keys: DayTsKey[]): boolean {
  let maxDay = 0;
  let maxTs = 0;
  for (const { day, ts } of keys) {
    maxDay = Math.max(maxDay, day);
    maxTs = Math.max(maxTs, ts);
  }
  return maxDay >= 2 && maxTs < 1_000_000;
}

function inferDayColumnIsZeroBased(keys: DayTsKey[]): boolean {
  let minD = Infinity;
  for (const { day } of keys) {
    minD = Math.min(minD, day);
  }
  return Number.isFinite(minD) && minD === 0;
}

function toP4GlobalTimestamp(
  day: number,
  within: number,
  glue: boolean,
  dayColumnZeroBased: boolean,
): number {
  if (!glue) {
    return within;
  }
  const dayOffset = dayColumnZeroBased ? day : day - 1;
  return dayOffset * 1_000_000 + within;
}

function rewriteActivitiesLog(activitiesLog: string, globalByPair: Map<string, number>): string {
  const lines = activitiesLog.split('\n');
  const out: string[] = [lines[0] ?? ''];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === '') {
      break;
    }
    const cols = line.split(';');
    const day = Number(cols[0]);
    const ts = Number(cols[1]);
    const key = `${day};${ts}`;
    const g = globalByPair.get(key);
    if (g !== undefined) {
      cols[1] = String(g);
    }
    out.push(cols.join(';'));
  }
  return out.join('\n');
}

function patchCompressedRow(lambdaLog: string, globalStateTs: number): string {
  const row = JSON.parse(lambdaLog) as unknown[];
  const state = row[0] as unknown[];
  if (!Array.isArray(state) || typeof state[0] !== 'number') {
    return lambdaLog;
  }
  state[0] = globalStateTs;
  return JSON.stringify(row);
}

export function prepareProsperity3ResultLogForP4Visualizer(log: ResultLog): ResultLog {
  if (!isProsperity3ResultLog(log)) {
    return log;
  }
  const keys = extractOrderedDayTimestampKeys(log.activitiesLog);
  if (keys.length !== log.logs.length) {
    return log;
  }

  const glue = needsMultiDayWithinDayGlue(keys);
  const dayZB = inferDayColumnIsZeroBased(keys);
  const globalByIndex: number[] = keys.map(({ day, ts }) =>
    toP4GlobalTimestamp(day, ts, glue, dayZB),
  );
  const globalByPair = new Map<string, number>();
  for (let i = 0; i < keys.length; i++) {
    const { day, ts } = keys[i]!;
    globalByPair.set(`${day};${ts}`, globalByIndex[i]!);
  }

  const tsMap = new Map<number, number>();
  for (let i = 0; i < log.logs.length; i++) {
    tsMap.set(log.logs[i]!.timestamp, globalByIndex[i]!);
  }

  const newActivities = rewriteActivitiesLog(log.activitiesLog, globalByPair);

  const newLogs: ResultLogItems[] = log.logs.map((lg, i) => ({
    ...lg,
    timestamp: globalByIndex[i]!,
    lambdaLog: patchCompressedRow(lg.lambdaLog, globalByIndex[i]!),
  }));

  const th = log.tradeHistory ?? [];
  const newTradeHistory: ResultLogTradeHistoryItem[] = th.map(t => {
    const nv = tsMap.get(t.timestamp);
    return nv !== undefined ? { ...t, timestamp: nv } : { ...t };
  });

  return {
    ...log,
    activitiesLog: newActivities,
    logs: newLogs,
    tradeHistory: newTradeHistory,
  };
}
