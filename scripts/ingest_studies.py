#!/usr/bin/env python3
"""
scripts/ingest_studies.py
Ingests Study 1 (200 Isolated Vocabulary Words) and Study 2 (50 Scenarios)
into the Speech Evaluation Studio (workbench.db).
Configures dynamic rubrics (Binary Pass/Fail + 1-5 Scale), models, test suites, and active campaigns.
"""

import os
import sys
import csv
import json
import sqlite3

def run_ingestion():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    capstone_dir = os.path.abspath(os.path.join(base_dir, "..", "Year3-Capstone"))
    db_path = os.path.join(base_dir, "workbench.db")

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")

    with conn:
        # 1. Ensure project exists
        project_id = "proj-veaja-khmer"
        conn.execute("""
        INSERT OR IGNORE INTO projects (id, name, language, description)
        VALUES (?, ?, ?, ?)
        """, (project_id, "Veaja Khmer Speech", "Khmer", "Inbound telephone conversational speech synthesis evaluation."))

        # 2. Register Candidate Models
        models = [
            ("model-voxcpm2-step6", "VoxCPM2 (Step 6)", "VOX-S6", "openbmb/VoxCPM2", "Apache 2.0", "Cloud T4 GPU", 48000),
            ("model-voxcpm2-step4", "VoxCPM2 (Step 4)", "VOX-S4", "openbmb/VoxCPM2", "Apache 2.0", "Cloud T4 GPU", 48000),
            ("model-voxcpm2-step8", "VoxCPM2 (Step 8)", "VOX-S8", "openbmb/VoxCPM2", "Apache 2.0", "Cloud T4 GPU", 48000),
            ("model-mms-tuned", "Meta MMS (Tuned)", "MMS-T", "facebook/mms-tts-khm", "CC-BY-NC 4.0", "Local CPU / GPU", 16000),
            ("model-mms-default", "Meta MMS (Default)", "MMS-D", "facebook/mms-tts-khm", "CC-BY-NC 4.0", "Local CPU / GPU", 16000),
        ]
        for m_id, name, code, repo, lic, hw, sr in models:
            conn.execute("""
            INSERT OR REPLACE INTO models (id, project_id, candidate_code, name, repo_id, license, hardware_target, sample_rate_hz)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (m_id, project_id, code, name, repo, lic, hw, sr))

        # 3. Create Rubrics
        # Rubric 1: 200 Words Vocabulary Diagnostic (Binary Pass/Fail)
        rubric_vocab_id = "rubric-vocab-200"
        vocab_metrics = [
            {
                "key": "pronunciation",
                "label_en": "Pronunciation Accuracy",
                "label_km": "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង",
                "desc": "Did the model pronounce the word correctly according to standard or colloquial Phnom Penh phonetics?",
                "type": "binary_pass_fail",
                "scale_min": 0,
                "scale_max": 1
            },
            {
                "key": "telephone_intelligibility",
                "label_en": "Telephone Intelligibility",
                "label_km": "ភាពងាយស្រួលស្ដាប់តាមទូរស័ព្ទ",
                "desc": "When the 8 kHz telephone bandpass filter is active, is the word clearly recognizable?",
                "type": "binary_pass_fail",
                "scale_min": 0,
                "scale_max": 1
            }
        ]
        conn.execute("""
        INSERT OR REPLACE INTO rubrics (id, project_id, name, protocol_type, scale_min, scale_max, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (rubric_vocab_id, project_id, "200-Word Vocabulary Diagnostic (Pass/Fail)", "Diagnostic", 0, 1, json.dumps(vocab_metrics, ensure_ascii=False)))

        # Rubric 2: 50 Scenarios ITU-T P.85 ACR (Scale 1-5)
        rubric_scenarios_id = "rubric-scenarios-50"
        scenarios_metrics = [
            {
                "key": "pronunciation",
                "label_en": "Pronunciation Accuracy",
                "label_km": "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង",
                "desc": "Are all syllables and polite words fully articulated without dropped vowels?",
                "type": "scale_1_5",
                "scale_min": 1,
                "scale_max": 5
            },
            {
                "key": "intelligibility",
                "label_en": "Sentence Intelligibility",
                "label_km": "ភាពងាយស្រួលស្ដាប់យល់",
                "desc": "Can order details, names, numbers, and times be understood effortlessly?",
                "type": "scale_1_5",
                "scale_min": 1,
                "scale_max": 5
            },
            {
                "key": "naturalness",
                "label_en": "Naturalness & Prosody",
                "label_km": "ចង្វាក់និយាយបែបធម្មជាតិ",
                "desc": "Human-like conversational flow and cadence without robotic monotone or awkward gaps.",
                "type": "scale_1_5",
                "scale_min": 1,
                "scale_max": 5
            },
            {
                "key": "voice_quality",
                "label_en": "Voice Quality & Cleanliness",
                "label_km": "គុណភាពសម្លេង",
                "desc": "Acoustic cleanliness free of digital pops, robotic buzz, or loud bursts.",
                "type": "scale_1_5",
                "scale_min": 1,
                "scale_max": 5
            },
            {
                "key": "telephone_intelligibility",
                "label_en": "Telephone Intelligibility (8 kHz)",
                "label_km": "ភាពច្បាស់តាមប្រព័ន្ធទូរស័ព្ទ",
                "desc": "Clarity and comprehension when auditioning with the 8 kHz telephone bandpass filter.",
                "type": "scale_1_5",
                "scale_min": 1,
                "scale_max": 5
            }
        ]
        conn.execute("""
        INSERT OR REPLACE INTO rubrics (id, project_id, name, protocol_type, scale_min, scale_max, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (rubric_scenarios_id, project_id, "50-Scenario Conversational Telephone Rubric (ITU-T P.85)", "ACR", 1, 5, json.dumps(scenarios_metrics, ensure_ascii=False)))

        # 4. Ingest Study 1: 200 Isolated Vocabulary Words
        suite_vocab_id = "suite-vocab-200"
        conn.execute("""
        INSERT OR REPLACE INTO test_suites (id, project_id, name, description)
        VALUES (?, ?, ?, ?)
        """, (suite_vocab_id, project_id, "200 Isolated Vocabulary Words (Sprint 3)", "Diagnostic single-word pronunciation evaluation across food, drinks, and prices."))

        # Clean previous items in suite
        conn.execute("DELETE FROM test_items WHERE suite_id = ?", (suite_vocab_id,))

        vocab_manifest = os.path.join(capstone_dir, "sprint-3", "output_clean_vocab_200", "dataset_manifest.csv")
        vocab_items_count = 0
        if os.path.exists(vocab_manifest):
            with open(vocab_manifest, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    audio_filename = row["audio_filename"]
                    transcript = row["transcript_text"]
                    model_name = row["model_name"]
                    
                    # Map model
                    if "VoxCPM2" in model_name:
                        mid = "model-voxcpm2-step6"
                    else:
                        mid = "model-mms-tuned"

                    item_key = audio_filename.replace(".wav", "")
                    item_id = f"item-vocab-{item_key.lower()}"
                    audio_url = f"/audio/vocab_200/{audio_filename}"

                    conn.execute("""
                    INSERT OR REPLACE INTO test_items (
                        id, suite_id, item_key, text, source_text, model_id, model_name, audio_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (item_id, suite_vocab_id, item_key, transcript, transcript, mid, model_name, audio_url))
                    vocab_items_count += 1
            print(f"Ingested {vocab_items_count} vocabulary items into {suite_vocab_id}.")
        else:
            print(f"Warning: vocab manifest not found at {vocab_manifest}")

        # 5. Ingest Study 2: 50 Scenarios
        suite_scenarios_id = "suite-scenarios-50"
        conn.execute("""
        INSERT OR REPLACE INTO test_suites (id, project_id, name, description)
        VALUES (?, ?, ?, ?)
        """, (suite_scenarios_id, project_id, "50 Conversational Telephony Scenarios (Sprint 3)", "Inbound restaurant dialogue turns testing telephone flow, question intonation, and diffusion steps."))

        # Clean previous items in suite
        conn.execute("DELETE FROM test_items WHERE suite_id = ?", (suite_scenarios_id,))

        scenarios_manifest = os.path.join(capstone_dir, "sprint-3", "output_clean_scenarios_50", "dataset_manifest.csv")
        scenarios_items_count = 0
        if os.path.exists(scenarios_manifest):
            with open(scenarios_manifest, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    audio_filename = row["audio_filename"]
                    transcript = row["transcript_text"]
                    model_name = row["model_name"]

                    if "Step 4" in model_name:
                        mid = "model-voxcpm2-step4"
                    elif "Step 6" in model_name:
                        mid = "model-voxcpm2-step6"
                    elif "Step 8" in model_name:
                        mid = "model-voxcpm2-step8"
                    elif "Tuned" in model_name:
                        mid = "model-mms-tuned"
                    else:
                        mid = "model-mms-default"

                    item_key = audio_filename.replace(".wav", "")
                    item_id = f"item-scen-{item_key.lower()}"
                    audio_url = f"/audio/scenarios_50/{audio_filename}"

                    conn.execute("""
                    INSERT OR REPLACE INTO test_items (
                        id, suite_id, item_key, text, source_text, model_id, model_name, audio_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (item_id, suite_scenarios_id, item_key, transcript, transcript, mid, model_name, audio_url))
                    scenarios_items_count += 1
            print(f"Ingested {scenarios_items_count} scenario items into {suite_scenarios_id}.")
        else:
            print(f"Warning: scenarios manifest not found at {scenarios_manifest}")

        # 6. Create Active Evaluation Campaigns
        camp_vocab_id = "camp-vocab-200"
        conn.execute("""
        INSERT OR REPLACE INTO campaigns (
            id, project_id, name, suite_id, rubric_id, instructions, ui_config_json, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            camp_vocab_id,
            project_id,
            "Sprint 3: 200-Word Vocabulary Pronunciation Diagnostic",
            suite_vocab_id,
            rubric_vocab_id,
            "Listen to each isolated Khmer word. Grade Pass (1) if pronounced correctly according to standard or colloquial Phnom Penh speech. Grade Fail (0) if vowels or consonants are dropped or garbled, and tag the defect type. Toggle the 8 kHz filter to check telephone intelligibility.",
            json.dumps({"blinded": True, "dsp": {"phone_filter_8khz": True}}),
            1
        ))

        camp_scenarios_id = "camp-scenarios-50"
        conn.execute("""
        INSERT OR REPLACE INTO campaigns (
            id, project_id, name, suite_id, rubric_id, instructions, ui_config_json, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            camp_scenarios_id,
            project_id,
            "Sprint 3: 50 Scenarios ITU-T P.85 Telephony Evaluation",
            suite_scenarios_id,
            rubric_scenarios_id,
            "Evaluate each conversational dialogue turn on a 1-5 scale across Pronunciation, Intelligibility, Naturalness, Voice Quality, and Telephone Intelligibility. Use headphones in a quiet room.",
            json.dumps({"blinded": True, "dsp": {"phone_filter_8khz": True}}),
            1
        ))

    conn.close()
    print("SUCCESS: Ingestion completed successfully.")

if __name__ == "__main__":
    run_ingestion()
