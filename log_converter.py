#!/usr/bin/env python3
import os, sys, json, argparse,re,numpy as np,pandas as pd
from io import StringIO

# ── helpers ───────────────────────────────────────────────────────────────────

BOLD  = "\033[1m"
DIM   = "\033[2m"
GREEN = "\033[92m"
CYAN  = "\033[96m"
RED   = "\033[91m"
ARROW = "\033[93m"
RESET = "\033[0m"

def _log(msg):  print(f"\n  {msg}\n")
def _ok(a, arrow, b, src, dst):
    _log(f"{CYAN}{BOLD}{a}{RESET} {ARROW}→{RESET} {GREEN}{BOLD}{b}{RESET}  "
         f"{DIM}│{RESET}  {DIM}{src}{RESET} {ARROW}→{RESET} {BOLD}{dst}{RESET}")
def _err(msg):
    _log(f"{RED}✗  {msg}{RESET}")

def clean_json_str(jstring):
    s = re.sub(r",(\s*[}\]])", r"\1", jstring)
    return s

# ── loaders ───────────────────────────────────────────────────────────────────

def load_p4(path):
    out = json.load(open(path))
    out['activitiesLog'] = pd.read_csv(StringIO(out['activitiesLog'].strip()), delimiter=';')
    return out

def load_p3(path):
    t = open(path).read()
    p1, r = t.split("\n\n\nActivities log:\n")
    p2, p3 = r.split("\n\n\n\nTrade History:\n")
    logs = [
        json.loads(b + ("}" if not b.strip().endswith("}") else ""))
        for b in p1.replace("Sandbox logs:\n", "").strip().split("\n}\n")
        if b.strip()
    ]
    return {
        'submissionId': 'xxx',
        'logs': logs,
        'activitiesLog': pd.read_csv(StringIO(p2.strip()), delimiter=';'),
        'tradeHistory': json.loads(clean_json_str(p3))
    }

def parse_lambda_log(s):
    import json
    try:d = json.loads(s)
    except:
        # print(f"can't parse this lambdaLog:-\n{s}")
        return None
    state = d[0]
    return {
        "time":state[0],
        "trader data":state[1],
        "listings": state[2],
        "orderbook": state[3],
        "my orders": d[1] if len(d) > 1 else [],
        "position": state[6],
        "market trades":state[5],
        "fills":state[4],
        "obs":state[7]
    }

# ── converters ────────────────────────────────────────────────────────────────

def p4_to_p3(in_file, out_file='p3_output.log'):
    df = json.load(open(in_file))
    with open(out_file, 'w') as f:
        f.write("Sandbox logs:\n")
        for entry in df['logs']:
            f.write(json.dumps(entry, indent=2))
            f.write("\n")
        f.write("\n\n\nActivities log:\n")
        f.write(df['activitiesLog'])
        f.write("\n\n\n\nTrade History:\n")
        f.write(json.dumps(df['tradeHistory'], indent=2))

def p3_to_p4(in_file, out_file='p4_output.log'):
    t = open(in_file).read()
    p1, r = t.split("\n\n\nActivities log:\n")
    p2, p3 = r.split("\n\n\n\nTrade History:\n")
    logs = [
        json.loads(b + ("}" if not b.strip().endswith("}") else ""))
        for b in p1.replace("Sandbox logs:\n", "").strip().split("\n}\n")
        if b.strip()
    ]
    json.dump({
        'submissionId': 'xxx',
        'logs': logs,
        'activitiesLog': p2.strip(),
        'tradeHistory': json.loads(clean_json_str(p3))
    }, open(out_file, 'w'), indent=2)


# ── data extractors ───────────────────────────────────────────────────────────

def _extract_trades(states):
    mkt_trades = []
    for i in states:
        if i['market trades'] is not None:
            for j in i['market trades']:
                try:
                    mkt_trades.append((j[5], j[3], j[4], j[0], 'XIRECS', j[1], j[2]))
                except Exception:
                    print(f"Error occurred while processing market trade: {i=}")
    return mkt_trades

def p4_to_data(in_file, out_dir='.', suffix=''):
    os.makedirs(out_dir, exist_ok=True)
    df = json.load(open(in_file))
    with open(os.path.join(out_dir, f'prices{suffix}.csv'), 'w') as f:
        f.write(df['activitiesLog'])
    states = [parse_lambda_log(i['lambdaLog']) for i in df['logs']]
    trades = _extract_trades(states)
    pd.DataFrame(np.unique(trades, axis=0), columns=['timestamp','buyer','seller','symbol','currency','price','quantity']) \
      .to_csv(os.path.join(out_dir, f'trades{suffix}.csv'), sep=';', index=False)

def p3_to_data(in_file, out_dir='.', suffix=''):
    os.makedirs(out_dir, exist_ok=True)
    t = open(in_file).read()
    p1, r = t.split("\n\n\nActivities log:\n")
    p2, p3 = r.split("\n\n\n\nTrade History:\n")
    with open(os.path.join(out_dir, f'prices{suffix}.csv'), 'w') as f:
        f.write(p2)
    logs = [
        json.loads(b + ("}" if not b.strip().endswith("}") else ""))
        for b in p1.replace("Sandbox logs:\n", "").strip().split("\n}\n")
        if b.strip()
    ]
    states = [parse_lambda_log(i['lambdaLog']) for i in logs]
    trades = _extract_trades(states)
    pd.DataFrame(np.unique(trades, axis=0), columns=['timestamp','buyer','seller','symbol','currency','price','quantity']) \
      .to_csv(os.path.join(out_dir, f'trades{suffix}.csv'), sep=';', index=False)


# ── dispatch ──────────────────────────────────────────────────────────────────

def detect_format(in_file):
    for loader, name in [(load_p4, 'p4'), (load_p3, 'p3')]:
        try:
            loader(in_file)
            return name
        except Exception:
            continue
    return None

def cmd_convert(in_file, out_file=None):
    fmt = detect_format(in_file)
    if fmt is None:
        _err("Not in p3 or p4 format."); return
    if fmt == 'p4':
        dst = out_file or 'p3_output.log'
        p4_to_p3(in_file, dst)
        _ok('p4', '→', 'p3', in_file, dst)
    else:
        dst = out_file or 'p4_output.log'
        p3_to_p4(in_file, dst)
        _ok('p3', '→', 'p4', in_file, dst)

def cmd_extract(in_file, out_dir='.', suffix=''):
    fmt = detect_format(in_file)
    if fmt is None:
        _err("Not in p3 or p4 format."); return
    extractor = p4_to_data if fmt == 'p4' else p3_to_data
    extractor(in_file, out_dir, suffix)
    _log(f"{CYAN}{BOLD}{fmt}{RESET} {ARROW}→{RESET} {GREEN}{BOLD}data{RESET}  "
         f"{DIM}│{RESET}  {DIM}{in_file}{RESET} {ARROW}→{RESET} "
         f"{BOLD}{os.path.join(out_dir, f'prices{suffix}.csv')}{RESET}"
         f", {BOLD}{os.path.join(out_dir, f'trades{suffix}.csv')}{RESET}")


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='p3/p4 log converter & extractor')
    ap.add_argument('input',                            help='Input log file')
    ap.add_argument('output',    nargs='?', default=None, help='Output file (convert) or directory (extract)')
    ap.add_argument('-d',        action='store_true',   help='Extract data (prices + trades) instead of converting')
    ap.add_argument('-s', '--suffix', default='',       help='Suffix appended to output filenames in extract mode')
    args = ap.parse_args()

    if args.d:
        cmd_extract(args.input, args.output or '.', args.suffix)
    else:
        cmd_convert(args.input, args.output)