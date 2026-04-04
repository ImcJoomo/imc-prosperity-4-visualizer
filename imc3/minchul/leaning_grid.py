import itertools
import subprocess
import re
import os
import csv
import time
import random

# 1. 탐색할 파라미터 공간 정의
WINDOWS = [30, 50, 100, 200]
KS = [1.0, 1.5, 2.0, 0.5, 0.2]
SKEW_FACTORS = [0.5, 0.8, 1.0, 1.2, 1.5]
COOLDOWNS = [100, 500, 1000]

NUM_SAMPLES = 100
ALL_ROUNDS = [1, 2, 3, 4, 5]
TARGET_PRODUCT = "SQUID_INK"
OUTPUT_FILE = f"leaning_grid_results_{NUM_SAMPLES}.csv"

def run_and_parse(rounds, env_vars):
    extracted_data = []
    
    # 터미널 색상 코드(ANSI)를 제거하기 위한 정규표현식
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    
    for r in rounds:
        cmd = f"prosperity3bt imc3.py {r}"
        
        # 💡 핵심 1: stderr=subprocess.STDOUT 을 추가하여 모든 출력을 하나로 모읍니다.
        result = subprocess.run(cmd, shell=True, env=env_vars, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        output = result.stdout
        
        current_round = None
        current_day = None
        #print(output)
        # 💡 핵심 2: 전체 텍스트를 쪼개지 않고 한 줄씩 내려가며 읽습니다.
        for line in output.split('\n'):
            # 색상/스타일 특수문자 싹 제거
            clean_line = ansi_escape.sub('', line)
            
            # "Backtesting ... on round 3 day 2" 부분 찾기
            rd_match = re.search(r"round (\d+) day (-?\d+)", clean_line)
            if rd_match:
                current_round = int(rd_match.group(1))
                current_day = int(rd_match.group(2))
                
            # SQUID_INK: 숫자 부분 찾기
            if current_round is not None and current_day is not None:
                profit_match = re.search(rf"{TARGET_PRODUCT}:\s*(-?[\d,]+)", clean_line)
                if profit_match:
                    profit = int(profit_match.group(1).replace(',', ''))
                    sample_type = "IS" if current_round <= 3 else "OOS"
                    #print(profit)
                    extracted_data.append({
                        "round": current_round,
                        "day": current_day,
                        "sample_type": sample_type,
                        "profit": profit
                    })
                    
                    # 한 번 찾았으면 다음 날짜가 나올 때까지 중복 탐색 방지
                    current_round = None
                    current_day = None

    return extracted_data

if __name__ == "__main__":
    all_combinations = list(itertools.product(WINDOWS, KS, SKEW_FACTORS, COOLDOWNS))
    total_possible = len(all_combinations)
    
    if NUM_SAMPLES and NUM_SAMPLES < total_possible:
        random.seed(62) 
        param_combinations = random.sample(all_combinations, NUM_SAMPLES)
        print(f"🎲 전체 {total_possible}개 조합 중 {NUM_SAMPLES}개를 무작위 추출하여 탐색합니다.")
    else:
        param_combinations = all_combinations
        print(f"🚀 전체 {total_possible}개 조합을 모두 탐색합니다.")

    headers = ["window", "k", "skew", "cool", "round", "day", "sample_type", "profit"]
    
    with open(OUTPUT_FILE, mode='w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()

        start_time = time.time()
        
        for idx, (w, k, skew, cool) in enumerate(param_combinations):
            current_env = os.environ.copy()
            current_env['LEANING_WINDOW'] = str(w)
            current_env['LEANING_K'] = str(k)
            current_env['LEANING_SKEW'] = str(skew)
            current_env['LEANING_COOL'] = str(cool)
            
            print(f"[{idx+1}/{len(param_combinations)}] Testing: w={w}, k={k}, skew={skew}, cool={cool}...", end="", flush=True)
            
            daily_results = run_and_parse(ALL_ROUNDS, current_env)
            print(f" Extracted {len(daily_results)} records.", end="")
            for res in daily_results:
                row = {
                    "window": w, "k": k, "skew": skew, "cool": cool,
                    "round": res["round"], "day": res["day"],
                    "sample_type": res["sample_type"], "profit": res["profit"]
                }
                writer.writerow(row)
            print(row['profit'])
            print(f" Done.")

    print("-" * 50)
    print(f"✅ 결과 저장 완료: '{OUTPUT_FILE}'")
    print(f"⏱️ 소요 시간: {time.time() - start_time:.2f}초")