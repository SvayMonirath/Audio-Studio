#!/usr/bin/env python3
"""
extract_real_data.py
Extracts real, verified benchmark data from Sprint 2 outputs into clean JSON assets
for the TTS Evaluation & Acoustic Engineering Studio.

Strict Rules:
- ZERO mock or fake data.
- Every audio file path must be verified on disk with non-zero byte size.
"""

import os
import sys
import json
import csv

def extract_all():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    out_dir = os.path.dirname(os.path.abspath(__file__))
    
    print(f"Base repository directory: {base_dir}")
    print(f"Output data directory: {out_dir}")
    
    # 1. Real 23 Benchmark Sentences
    bench_file = os.path.join(base_dir, "28-sentence-benchmark", "benchmark-23-v3.0", "benchmark_23_v3.0_proposed.json")
    if not os.path.exists(bench_file):
        raise FileNotFoundError(f"Missing benchmark file: {bench_file}")
        
    with open(bench_file, "r", encoding="utf-8") as f:
        bench_data = json.load(f)
        
    bench_items = bench_data.get("items", [])
    print(f"Loaded {len(bench_items)} benchmark items from {os.path.relpath(bench_file, base_dir)}")
    
    # Model audio directories relative to base_dir
    model_audio_dirs = {
        "openbmb/VoxCPM2": {
            "model_id": "C-002",
            "name": "VoxCPM2",
            "rel_path": "sprint-2/outputs/benchmark_runs/openbmb-voxcpm2/run_20261022_225128/audio"
        },
        "facebook/mms-tts-khm": {
            "model_id": "C-001",
            "name": "Meta MMS-TTS",
            "rel_path": "sprint-2/outputs/benchmark_runs/facebook-mms-tts-khm/run_20261020_165836/audio"
        },
        "khmerttsopensource/khmer-tts": {
            "model_id": "C-003",
            "name": "Khmer-TTS (VITS)",
            "rel_path": "sprint-2/outputs/benchmark_runs/khmerttsopensource-khmer-tts/run_20261020_210752/audio"
        },
        "sengtha/khmer-tts-female-v2": {
            "model_id": "C-004",
            "name": "Sengtha Female",
            "rel_path": "sprint-2/outputs/benchmark_runs/sengtha-khmer-tts-female-v2/run_20261026_204357/audio"
        }
    }
    
    processed_sentences = []
    total_audio_verified = 0
    
    for item in bench_items:
        item_id = item["id"]
        sentence_entry = {
            "id": item_id,
            "category": item.get("category", ""),
            "length": item.get("length", ""),
            "intent": item.get("intent", ""),
            "source_text": item.get("source_text", ""),
            "tts_input": item.get("tts_input", ""),
            "coverage_tags": item.get("coverage_tags", []),
            "native_review": item.get("native_review", ""),
            "audio_files": {}
        }
        
        for model_repo, info in model_audio_dirs.items():
            wav_name = f"{item_id}.wav"
            full_wav_path = os.path.join(base_dir, info["rel_path"], wav_name)
            
            if not os.path.exists(full_wav_path):
                raise FileNotFoundError(f"Missing real audio file: {full_wav_path}")
            
            size_bytes = os.path.getsize(full_wav_path)
            if size_bytes == 0:
                raise ValueError(f"Empty zero-byte audio file: {full_wav_path}")
            
            sentence_entry["audio_files"][model_repo] = {
                "model_name": info["name"],
                "model_id": info["model_id"],
                "url": f"/audio/{info['rel_path']}/{wav_name}",
                "size_bytes": size_bytes
            }
            total_audio_verified += 1
            
        processed_sentences.append(sentence_entry)
        
    sentences_out_file = os.path.join(out_dir, "sentences_23.json")
    with open(sentences_out_file, "w", encoding="utf-8") as f:
        json.dump(processed_sentences, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(processed_sentences)} sentences with {total_audio_verified} verified audio files to {os.path.basename(sentences_out_file)}")
    
    # 2. Real 200 Isolated Vocabulary Words
    vocab_file = os.path.join(base_dir, "eval", "vocab_200", "vocab_200_v1.csv")
    if not os.path.exists(vocab_file):
        raise FileNotFoundError(f"Missing vocab file: {vocab_file}")
        
    vocab_items = []
    with open(vocab_file, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            vocab_items.append({
                "item_id": row["item_id"],
                "category_id": row["category_id"],
                "category_name": row["category_name"],
                "khmer_text": row["khmer_text"],
                "target_ipa_standard": row["target_ipa_standard"],
                "target_ipa_colloquial": row["target_ipa_colloquial"],
                "acceptable_spoken_phonetics": row["acceptable_spoken_phonetics"],
                "linguistic_challenge": row["linguistic_challenge"],
                "criticality": row["criticality"],
                "notes": row["notes"]
            })
            
    vocab_out_file = os.path.join(out_dir, "vocab_200.json")
    with open(vocab_out_file, "w", encoding="utf-8") as f:
        json.dump(vocab_items, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(vocab_items)} vocabulary items to {os.path.basename(vocab_out_file)}")
    
    # 3. Real Acoustic Physics & Telemetry Data
    telemetry_file = os.path.join(base_dir, "sprint-2", "outputs", "acoustic_physics_telemetry.json")
    if not os.path.exists(telemetry_file):
        raise FileNotFoundError(f"Missing telemetry file: {telemetry_file}")
        
    with open(telemetry_file, "r", encoding="utf-8") as f:
        raw_telemetry = json.load(f)
        
    telemetry_summary = {}
    for cand_code, data in raw_telemetry.items():
        cand = data.get("candidate", {})
        repo = cand.get("repo")
        telemetry_summary[repo] = {
            "candidate_code": cand_code,
            "name": cand.get("name"),
            "repo": repo,
            "license": cand.get("license"),
            "model_size": cand.get("size"),
            "latency_ms": cand.get("latency_ms"),
            "rtf": cand.get("rtf"),
            "vram_mb": cand.get("vram_mb"),
            "sample_rate_hz": data.get("sample_rate_hz"),
            "mean_duration_s": data.get("mean_duration_s"),
            "mean_speed_cps": data.get("mean_speed_cps"),
            "min_speed_cps": data.get("min_speed_cps"),
            "max_speed_cps": data.get("max_speed_cps"),
            "mean_peak_db": data.get("mean_peak_db"),
            "mean_rms_db": data.get("mean_rms_db"),
            "records": {rec["id"]: rec for rec in data.get("records", [])}
        }
        
    telemetry_out_file = os.path.join(out_dir, "telemetry.json")
    with open(telemetry_out_file, "w", encoding="utf-8") as f:
        json.dump(telemetry_summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(telemetry_summary)} candidates physical telemetry to {os.path.basename(telemetry_out_file)}")
    
    print("SUCCESS: All real benchmark data extracted and verified. Zero mock data.")

if __name__ == "__main__":
    extract_all()
