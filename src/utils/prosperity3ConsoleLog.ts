import type { ResultLog, ResultLogItems, ResultLogTradeHistoryItem } from '../models.ts';

const SANDBOX_HEAD = 'Sandbox logs:';
const ACTIVITIES_HEAD = 'Activities log:';
const TRADE_HEAD = 'Trade History:';

export function isProsperity3BacktesterConsoleLogText(text: string): boolean {
  const t = text.trimStart();
  return t.includes(SANDBOX_HEAD) && t.includes(ACTIVITIES_HEAD);
}

function extractTopLevelJsonObjects(body: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) {
      i++;
    }
    if (i >= body.length || body[i] !== '{') {
      break;
    }
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (; i < body.length; i++) {
      const c = body[i]!;
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (c === '\\') {
          esc = true;
        } else if (c === '"') {
          inStr = false;
        }
      } else if (c === '"') {
        inStr = true;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          chunks.push(body.slice(start, i + 1));
          i++;
          break;
        }
      }
    }
  }
  return chunks;
}

function stripTrailingCommasJson(jsonLike: string): string {
  return jsonLike.replace(/,(\s*[}\]])/g, '$1');
}

export function parseProsperity3BacktesterConsoleLog(text: string): ResultLog {
  const sandboxIdx = text.indexOf(SANDBOX_HEAD);
  const actIdx = text.indexOf(ACTIVITIES_HEAD);
  const tradeIdx = text.indexOf(TRADE_HEAD);
  if (sandboxIdx === -1 || actIdx === -1) {
    throw new Error('Not a Prosperity 3 backtester console log (missing Sandbox logs or Activities log).');
  }

  const sandboxStart = sandboxIdx + SANDBOX_HEAD.length;
  const sandboxBody = text.slice(sandboxStart, actIdx).trim();
  const objStrs = extractTopLevelJsonObjects(sandboxBody);
  const logs: ResultLogItems[] = [];
  for (const s of objStrs) {
    const row = JSON.parse(s) as ResultLogItems;
    if (typeof row.lambdaLog === 'string' && typeof row.timestamp === 'number') {
      logs.push(row);
    }
  }

  const actBlockStart = actIdx + ACTIVITIES_HEAD.length;
  const actEnd = tradeIdx === -1 ? text.length : tradeIdx;
  let activitiesBlock = text.slice(actBlockStart, actEnd).trim();
  activitiesBlock = activitiesBlock.replace(/^\r?\n+/, '').replace(/\r?\n+$/, '');
  if (!activitiesBlock.toLowerCase().startsWith('day;timestamp;')) {
    throw new Error('Activities log missing expected CSV header.');
  }

  let tradeHistory: ResultLogTradeHistoryItem[] = [];
  if (tradeIdx !== -1) {
    const tradeSlice = text.slice(tradeIdx + TRADE_HEAD.length).trim();
    const lb = tradeSlice.indexOf('[');
    const rb = tradeSlice.lastIndexOf(']');
    if (lb === -1 || rb === -1 || rb <= lb) {
      tradeHistory = [];
    } else {
      const arrText = stripTrailingCommasJson(tradeSlice.slice(lb, rb + 1));
      tradeHistory = JSON.parse(arrText) as ResultLogTradeHistoryItem[];
    }
  }

  return {
    submissionId: 'prosperity3bt-console-log',
    activitiesLog: activitiesBlock,
    logs,
    tradeHistory,
  };
}
