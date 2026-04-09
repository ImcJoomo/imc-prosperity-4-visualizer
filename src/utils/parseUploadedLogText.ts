import type { ResultLog } from '../models.ts';
import { isProsperity3BacktesterConsoleLogText, parseProsperity3BacktesterConsoleLog } from './prosperity3ConsoleLog.ts';

export function parseUploadedLogTextToResultLog(text: string): ResultLog {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(text) as ResultLog;
  }
  if (isProsperity3BacktesterConsoleLogText(text)) {
    return parseProsperity3BacktesterConsoleLog(text);
  }
  return JSON.parse(text) as ResultLog;
}
