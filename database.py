#!/usr/bin/env python3
"""
database.py
SQLite schema, migrations, and CRUD operations for the Speech Evaluation & Acoustic Engineering Studio.
Supports general-purpose, scalable multi-project workspaces, dynamic rubrics, and error taxonomies.
"""

import os
import sqlite3
import json
import hashlib
import secrets
from datetime import datetime

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workbench.db")

def get_connection(db_path=None):
    if db_path is None:
        db_path = DEFAULT_DB_PATH
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(db_path=None):
    """Initializes the database schema if tables do not exist."""
    conn = get_connection(db_path)
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            language TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS test_suites (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS test_items (
            id TEXT PRIMARY KEY,
            suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
            item_key TEXT NOT NULL,
            text TEXT NOT NULL,
            source_text TEXT,
            category TEXT,
            intent TEXT,
            coverage_tags_json TEXT,
            target_ipa_standard TEXT,
            target_ipa_colloquial TEXT,
            linguistic_challenge TEXT,
            criticality TEXT,
            notes TEXT,
            audio_files_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            candidate_code TEXT,
            name TEXT NOT NULL,
            repo_id TEXT NOT NULL,
            license TEXT,
            hardware_target TEXT,
            sample_rate_hz INTEGER,
            latency_ms REAL,
            rtf REAL,
            vram_mb REAL,
            audio_base_dir TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rubrics (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            protocol_type TEXT NOT NULL, -- 'ACR', 'Pairwise', 'Diagnostic'
            scale_min INTEGER DEFAULT 1,
            scale_max INTEGER DEFAULT 5,
            metrics_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS taxonomies (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name_en TEXT NOT NULL,
            name_km TEXT NOT NULL,
            category TEXT,
            description TEXT,
            badge_color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, code)
        );

        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
            rubric_id TEXT NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
            instructions TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS raters (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'Evaluator',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            rater_id TEXT NOT NULL REFERENCES raters(id) ON DELETE CASCADE,
            item_id TEXT NOT NULL REFERENCES test_items(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
            scores_json TEXT NOT NULL,
            blind_transcript TEXT,
            comments TEXT,
            duration_seconds REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(campaign_id, rater_id, item_id, model_id)
        );

        CREATE TABLE IF NOT EXISTS defect_tags (
            id TEXT PRIMARY KEY,
            evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
            word_index INTEGER,
            word_text TEXT NOT NULL,
            error_code TEXT NOT NULL,
            note TEXT,
            time_start_ms REAL,
            time_end_ms REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            pin_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_eval_campaign ON evaluations(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_eval_rater ON evaluations(rater_id);
        CREATE INDEX IF NOT EXISTS idx_eval_item ON evaluations(item_id);
        CREATE INDEX IF NOT EXISTS idx_eval_model ON evaluations(model_id);
        CREATE INDEX IF NOT EXISTS idx_defects_eval ON defect_tags(evaluation_id);
        """)

        try:
            conn.execute("ALTER TABLE campaigns ADD COLUMN instructions TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE campaigns ADD COLUMN defect_types_json TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE campaigns ADD COLUMN collect_transcription INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE test_items ADD COLUMN audio_url TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE test_items ADD COLUMN model_id TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE test_items ADD COLUMN model_name TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE campaigns ADD COLUMN modality TEXT DEFAULT 'TTS'")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE test_items ADD COLUMN reference_transcript TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE test_items ADD COLUMN hypothesis_transcript TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE evaluations ADD COLUMN asr_adjudication TEXT")
        except sqlite3.OperationalError:
            pass
    conn.close()

def hash_pin(pin: str, salt: str = None) -> tuple:
    if not salt:
        salt = secrets.token_hex(16)
    pin_hash = hashlib.pbkdf2_hmac("sha256", str(pin).strip().encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return pin_hash, salt

def verify_pin_hash(pin: str, pin_hash: str, salt: str) -> bool:
    computed, _ = hash_pin(pin, salt)
    return secrets.compare_digest(computed, pin_hash)

def save_admin(username: str, pin: str, role: str = "admin", db_path=None):
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    pin_hash, salt = hash_pin(pin)
    admin_id = f"admin-{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(4)}"
    cur.execute("""
    INSERT INTO admins (id, username, pin_hash, salt, role)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt, role = excluded.role
    """, (admin_id, username.strip(), pin_hash, salt, role))
    conn.commit()
    conn.close()
    return {"id": admin_id, "username": username.strip(), "role": role}

def verify_admin_credentials(pin: str, username: str = None, db_path=None):
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    if username:
        row = cur.execute("SELECT * FROM admins WHERE lower(username) = lower(?)", (username.strip(),)).fetchone()
        if row and verify_pin_hash(pin, row["pin_hash"], row["salt"]):
            conn.close()
            return True, dict(row)
    else:
        rows = cur.execute("SELECT * FROM admins").fetchall()
        for r in rows:
            if verify_pin_hash(pin, r["pin_hash"], r["salt"]):
                conn.close()
                return True, dict(r)
    conn.close()
    return False, None

def seed_project_khmer_speech(db_path=None):
    """Seeds Project 1 (Veaja Khmer Speech) with verified real data."""
    init_db(db_path)
    conn = get_connection(db_path)
    cur = conn.cursor()
    
    # 1. Project
    project_id = "proj-veaja-khmer"
    cur.execute("""
    INSERT OR REPLACE INTO projects (id, name, language, description)
    VALUES (?, ?, ?, ?)
    """, (
        project_id,
        "Veaja Khmer Speech",
        "Khmer (km-KH)",
        "Conversational receptionist text-to-speech benchmarking across 4 candidate acoustic models."
    ))
    
    # 2. Rubrics
    rubric_id_acr = "rubric-veaja-p85"
    cur.execute("""
    INSERT OR REPLACE INTO rubrics (id, project_id, name, protocol_type, scale_min, scale_max, metrics_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        rubric_id_acr,
        project_id,
        "Veaja Protocol V2 (ITU-T P.85 ACR)",
        "ACR",
        1,
        5,
        json.dumps([
            {"key": "pronunciation", "label_en": "Pronunciation Accuracy", "label_km": "ភាពត្រឹមត្រូវនៃការបញ្ចេញសំឡេង", "desc": "Are words pronounced without dropped vowels or missing words?", "desc_km": "តើពាក្យត្រូវបានបញ្ចេញសំឡេងត្រឹមត្រូវ ដោយមិនបាត់ស្រៈ ឬព្យញ្ជនៈដែរឬទេ?"},
            {"key": "intelligibility", "label_en": "Intelligibility", "label_km": "ភាពងាយស្រួលក្នុងការស្តាប់យល់", "desc": "How clearly order details and quantities can be heard.", "desc_km": "តើពាក្យ និងឃ្លាអាចស្តាប់យល់បានច្បាស់លាស់កម្រិតណា?"},
            {"key": "naturalness", "label_en": "Naturalness", "label_km": "លក្ខណៈធម្មជាតិនៃសំឡេង", "desc": "Human-like cadence without robotic buzzing.", "desc_km": "ចង្វាក់និយាយរលូនដូចមនុស្សពិត ដោយគ្មានសំឡេងរ៉ូបូត។"},
            {"key": "voice_quality", "label_en": "Voice Quality", "label_km": "គុណភាពនៃសម្លេង", "desc": "Clear high fidelity without clicks or background static.", "desc_km": "កម្រិតច្បាស់នៃសំឡេង ដោយគ្មានសំឡេងរំខាន ឬខ្សឹបខ្សៀវ។"}
        ])
    ))

    rubric_id_pair = "rubric-pairwise"
    cur.execute("""
    INSERT OR REPLACE INTO rubrics (id, project_id, name, protocol_type, scale_min, scale_max, metrics_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        rubric_id_pair,
        project_id,
        "Blind Pairwise A/B Arena",
        "Pairwise",
        1,
        4,
        json.dumps([
            {"key": "preference", "label_en": "Preference", "label_km": "ជម្រើសដែលពេញចិត្តជាងគេ", "options": ["Take 1 is better", "Take 2 is better", "Both are good", "Both are bad"]}
        ])
    ))

    # 3. 19 Clinical Error Taxonomies
    clinical_taxonomies = [
        ("C_DEL", "Consonant Deletion", "បាត់ព្យញ្ជនៈ", "phonetic", "A consonant sound was dropped completely.", "#EF4444"),
        ("C_SUB", "Consonant Substitution", "ជំនួសព្យញ្ជនៈខុស", "phonetic", "Wrong consonant sound spoken (e.g. /t/ for /d/).", "#F97316"),
        ("V_DEL_INS", "Vowel Error", "បាត់ ឬថែមស្រៈ", "phonetic", "A vowel was dropped or misread (e.g. missing ឲ្យ).", "#DC2626"),
        ("CLIP_TRUNC", "Word Truncation", "កាត់ដាច់ចុងពាក្យ", "acoustic", "Audio or syllable cut off abruptly at end.", "#EA580C"),
        ("CODE", "Code-Switching Failure", "បញ្ចេញពាក្យបរទេសមិនចេញ", "multilingual", "Muted or babbling on English/French loanwords (e.g. Iced Latte).", "#B91C1C"),
        ("GLITCH", "Digital Glitch", "សំឡេងទាក់ ឬផ្ទុះ", "acoustic", "Robotic buzz, digital pop, or burst of static.", "#E11D48"),
        ("ELONG", "Syllable Elongation", "អូសសំឡេងវែងខុសប្រក្រតី", "prosody", "Syllable dragged out unnaturally slow.", "#F59E0B"),
        ("PROM", "Inappropriate Loudness", "សំឡេងស្រែក ឬឮខ្លាំងពេក", "acoustic", "Spoken unnaturally loud or shouting on a word.", "#D97706"),
        ("PROS", "Bad Prosody / Cadence", "ចង្វាក់មិនត្រូវ ឬលឿនពេក", "prosody", "Rushed pacing without natural breathing pauses.", "#84CC16"),
        ("SILENCE", "Dead Silence", "ស្ងាត់បាត់សំឡេង", "acoustic", "Unintended silence inside an active utterance.", "#64748B"),
        ("SEG", "Awkward Pause", "ផ្អាកខុសកន្លែង", "prosody", "Unnatural gap between syllables inside a single word.", "#06B6D4"),
        ("INCONSIST", "Voice Inconsistency", "សំឡេងប្រែប្រួលមិនថេរ", "acoustic", "Speaker timbre or pitch shifts abruptly in mid-turn.", "#8B5CF6"),
        ("LEX_SUB", "Lexical Substitution", "អានខុសពាក្យទាំងស្រុង", "lexical", "Spoke an entirely different word than written.", "#A855F7"),
        ("REPETITION", "Stutter / Repetition", "និយាយត្រដិត ឬផ្ទួនៗ", "fluency", "Repeated syllable or word multiple times.", "#EC4899"),
        ("REG_FAIL", "Register Error", "ច្រឡំសំឡេងពួក អ និង អ៊", "phonetic", "First-series and second-series vowel registers swapped.", "#6366F1"),
        ("SUB_FAIL", "Subscript Error", "បញ្ចេញជើងអក្សរមិនច្បាស់", "phonetic", "Subscript consonant cluster slurred or misread.", "#3B82F6"),
        ("NASAL_FAIL", "Nasal Error", "បញ្ចេញសំឡេងច្រមុះមិនច្បាស់", "phonetic", "Nasal initials (/ŋ/, /ɲ/) dropped or distorted.", "#0EA5E9"),
        ("DIALECT", "Non-Standard Accent", "សំឡេងបញ្ចេញបែបតំបន់", "phonetic", "Pronunciation differs noticeably from standard Phnom Penh speech.", "#10B981"),
        ("NONE", "Clean Audio", "សំឡេងល្អឥតខ្ចោះ", "quality", "No defects heard; clear, natural pronunciation.", "#059669")
    ]
    
    for code, en, km, cat, desc, col in clinical_taxonomies:
        tax_id = f"tax-{code.lower()}"
        cur.execute("""
        INSERT OR REPLACE INTO taxonomies (id, project_id, code, name_en, name_km, category, description, badge_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (tax_id, project_id, code, en, km, cat, desc, col))

    # 4. Models & Physical Telemetry
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data")
    telemetry_path = os.path.join(data_dir, "telemetry.json")
    if os.path.exists(telemetry_path):
        with open(telemetry_path, "r", encoding="utf-8") as f:
            telemetry = json.load(f)
    else:
        telemetry = {}

    model_metadata = [
        {
            "id": "model-voxcpm2",
            "code": "C-002",
            "name": "VoxCPM2",
            "repo": "openbmb/VoxCPM2",
            "license": "Apache 2.0",
            "hardware": "NVIDIA RTX 2060 / Kaggle Tesla T4",
            "audio_base": "audio/openbmb-voxcpm2/run_20261022_225128/audio"
        },
        {
            "id": "model-mms",
            "code": "C-001",
            "name": "Meta MMS-TTS",
            "repo": "facebook/mms-tts-khm",
            "license": "CC-BY-NC 4.0",
            "hardware": "CPU / Edge Device",
            "audio_base": "audio/facebook-mms-tts-khm/run_20261020_165836/audio"
        },
        {
            "id": "model-khmertts",
            "code": "C-003",
            "name": "Khmer-TTS (VITS)",
            "repo": "khmerttsopensource/khmer-tts",
            "license": "MIT",
            "hardware": "Local GPU / CPU",
            "audio_base": "audio/khmerttsopensource-khmer-tts/run_20261020_210752/audio"
        },
        {
            "id": "model-sengtha",
            "code": "C-004",
            "name": "Sengtha Female V2",
            "repo": "sengtha/khmer-tts-female-v2",
            "license": "MIT / Academic",
            "hardware": "Local GPU / CPU",
            "audio_base": "audio/sengtha-khmer-tts-female-v2/run_20261026_204357/audio"
        }
    ]

    for m in model_metadata:
        repo = m["repo"]
        tel = telemetry.get(repo, {})
        cur.execute("""
        INSERT OR REPLACE INTO models (
            id, project_id, candidate_code, name, repo_id, license, hardware_target,
            sample_rate_hz, latency_ms, rtf, vram_mb, audio_base_dir
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            m["id"],
            project_id,
            m["code"],
            m["name"],
            repo,
            m["license"],
            m["hardware"],
            tel.get("sample_rate_hz", 16000),
            tel.get("latency_ms", 0.0),
            tel.get("rtf", 0.0),
            tel.get("vram_mb", 0.0),
            m["audio_base"]
        ))

    # Clear old mock campaigns, test items, and evaluations to ensure 100% clean state
    cur.execute("DELETE FROM defect_tags")
    cur.execute("DELETE FROM evaluations")
    cur.execute("DELETE FROM campaigns")
    cur.execute("DELETE FROM test_items")
    cur.execute("DELETE FROM test_suites")

    # 5. Single Benchmark Test Suite: 23 Dialogue Sentences across 4 Models
    suite_dev23_id = "suite-dev23"
    cur.execute("""
    INSERT INTO test_suites (id, project_id, name, description)
    VALUES (?, ?, ?, ?)
    """, (
        suite_dev23_id,
        project_id,
        "DEV-23 Benchmark Suite (4 Acoustic Models)",
        "Standard 23 conversational dialogue prompts evaluated across all 4 candidate acoustic models (92 total items)."
    ))

    # 6. Populate 92 Test Items (23 Sentences x 4 Candidate TTS Models)
    model_key_mapping = {
        "openbmb/VoxCPM2": ("model-voxcpm2", "VoxCPM2", "voxcpm2"),
        "facebook/mms-tts-khm": ("model-mms", "Meta MMS-TTS", "mms"),
        "khmerttsopensource/khmer-tts": ("model-khmertts", "Khmer-TTS (VITS)", "khmertts"),
        "sengtha/khmer-tts-female-v2": ("model-sengtha", "Sengtha Female V2", "sengtha")
    }

    sentences_path = os.path.join(data_dir, "sentences_23.json")
    if os.path.exists(sentences_path):
        with open(sentences_path, "r", encoding="utf-8") as f:
            sentences = json.load(f)
            
        for s in sentences:
            audio_map = s.get("audio_files", {})
            for repo_key, (m_id, m_name, m_suffix) in model_key_mapping.items():
                m_audio = audio_map.get(repo_key, {})
                audio_url = m_audio.get("url", "")
                item_id = f"item-dev23-{s['id']}-{m_suffix}"
                item_key = f"{s['id']} • {m_name}"

                audio_files_dict = {
                    m_id: {
                        "model_id": m_id,
                        "model_name": m_name,
                        "url": audio_url
                    }
                }

                cur.execute("""
                INSERT INTO test_items (
                    id, suite_id, item_key, text, source_text, category, intent,
                    coverage_tags_json, notes, audio_files_json, audio_url, model_id, model_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item_id,
                    suite_dev23_id,
                    item_key,
                    s["tts_input"],
                    s["source_text"],
                    s["category"],
                    s.get("intent", ""),
                    json.dumps(s.get("coverage_tags", [])),
                    s.get("native_review", ""),
                    json.dumps(audio_files_dict),
                    audio_url,
                    m_id,
                    m_name
                ))

    # 7. Only One Clean Production Study: 23 Dialogue Sentences (4 Models)
    default_defects = [
        {"code": "MISPRON", "label": "Mispronunciation", "label_km": "បញ្ចេញសំឡេងខុស"},
        {"code": "NOISE", "label": "Noise / Click", "label_km": "សំឡេងរំខាន / ផ្ទុះ"},
        {"code": "UNNAT_PAUSE", "label": "Awkward Pause", "label_km": "ការផ្អាកខុសធម្មជាតិ"},
        {"code": "ROBOTIC", "label": "Robotic Buzz", "label_km": "សំឡេងរ៉ូបូត / រំញ័រ"},
        {"code": "PITCH", "label": "Unnatural Pitch", "label_km": "កម្ពស់សំឡេងមិនធម្មជាតិ"},
        {"code": "OTHER", "label": "Other Defect", "label_km": "បញ្ហាផ្សេងទៀត"}
    ]
    cur.execute("""
    INSERT INTO campaigns (id, project_id, name, suite_id, rubric_id, instructions, defect_types_json, collect_transcription, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    """, (
        "camp-dev23-4models",
        project_id,
        "Khmer Speech Evaluation: DEV-23 (4 Candidate Models)",
        suite_dev23_id,
        rubric_id_acr,
        "Please listen to each speech audio sample and rate its pronunciation, intelligibility, naturalness, and voice quality on the 1-5 scale. You can also drag across any defect on the waveform to flag it.",
        json.dumps(default_defects),
        1
    ))

    # 9. Default Raters (From team roles)
    raters = [
        ("rater-bora", "Bora (Listening Lead)", "Protocol Lead"),
        ("rater-monirath", "Svay Monirath (TTS Lead)", "TTS Subsystem Lead"),
        ("rater-khai", "Khai (NLP Lead)", "NLP Lead"),
        ("rater-sreylenn", "Sreylenn (Vocab Lead)", "Vocabulary Lead"),
        ("rater-panhaseth", "Panhaseth (Infra Lead)", "Infrastructure Lead")
    ]
    for r_id, r_name, r_role in raters:
        cur.execute("""
        INSERT OR REPLACE INTO raters (id, name, role)
        VALUES (?, ?, ?)
        """, (r_id, r_name, r_role))

    conn.commit()
    conn.close()
    print("SUCCESS: Database initialized and seeded with real project data.")

if __name__ == "__main__":
    seed_project_khmer_speech()
