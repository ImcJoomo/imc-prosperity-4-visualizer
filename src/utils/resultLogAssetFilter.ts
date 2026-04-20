import type { ResultLog } from '../models.ts';

export function collectResultLogAssetKeys(resultLog: ResultLog): string[] {
  const keys = new Set<string>();
  const lines = resultLog.activitiesLog.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === '') {
      break;
    }
    const product = line.split(';')[2];
    if (product) {
      keys.add(product);
    }
  }
  for (const t of resultLog.tradeHistory ?? []) {
    if (t.symbol) {
      keys.add(t.symbol);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function shouldApplyAssetFilter(resultLog: ResultLog, assetKeys: string[] | null | undefined): boolean {
  if (!assetKeys || assetKeys.length === 0) {
    return false;
  }
  const all = collectResultLogAssetKeys(resultLog);
  if (all.length === 0) {
    return false;
  }
  if (assetKeys.length !== all.length) {
    return true;
  }
  const chosen = new Set(assetKeys);
  return all.some(k => !chosen.has(k));
}

export function filterResultLogByAssets(resultLog: ResultLog, keep: Set<string>): ResultLog {
  const lines = resultLog.activitiesLog.split('\n');
  if (lines.length < 2) {
    return resultLog;
  }
  const keptLines: string[] = [lines[0]!];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line || line === '') {
      break;
    }
    const product = line.split(';')[2] ?? '';
    if (keep.has(product)) {
      keptLines.push(line);
    }
  }
  const tradeHistory = (resultLog.tradeHistory ?? []).filter(t => keep.has(t.symbol));
  return {
    ...resultLog,
    activitiesLog: keptLines.join('\n'),
    tradeHistory,
  };
}
