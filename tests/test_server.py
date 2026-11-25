#!/usr/bin/env python3
"""
test_server.py
Automated end-to-end unit and integration tests for the TTS Evaluation & Acoustic Studio backend.
Tests database integrity, REST API endpoints, real audio streaming, and admin summaries.
"""

import os
import sys
import json
import sqlite3
import unittest
import threading
import time
from urllib.request import urlopen, Request
from urllib.error import HTTPError

# Set paths
TOOL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, TOOL_DIR)

from database import init_db, seed_project_khmer_speech, get_connection
from run_server import StudioHandler
from http.server import HTTPServer

TEST_PORT = 8999
TEST_DB_PATH = os.path.join(TOOL_DIR, "test_workbench.db")

class StudioServerTestCase(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Override DB path for clean test isolation
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
            
        seed_project_khmer_speech(TEST_DB_PATH)
        
        # Patch default DB in database module
        import database
        database.DEFAULT_DB_PATH = TEST_DB_PATH
        
        # Start background server
        cls.server = HTTPServer(("127.0.0.1", TEST_PORT), StudioHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.5)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_database_seed_integrity(self):
        """Verify all tables were populated with real benchmark data."""
        conn = get_connection(TEST_DB_PATH)
        cur = conn.cursor()
        
        # Projects
        projects = cur.execute("SELECT * FROM projects").fetchall()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["name"], "Veaja Khmer Speech")
        
        # Suites (Single clean benchmark suite for all 4 candidate models)
        suites = cur.execute("SELECT * FROM test_suites").fetchall()
        self.assertEqual(len(suites), 1)
        
        # Items (23 DEV sentences x 4 models = 92 items)
        items = cur.execute("SELECT * FROM test_items").fetchall()
        self.assertEqual(len(items), 92)
        
        # Models (4 candidate models)
        models = cur.execute("SELECT * FROM models").fetchall()
        self.assertEqual(len(models), 4)
        model_names = [m["name"] for m in models]
        self.assertIn("VoxCPM2", model_names)
        self.assertIn("Meta MMS-TTS", model_names)
        
        # Taxonomies (19 clinical error codes)
        tax = cur.execute("SELECT * FROM taxonomies").fetchall()
        self.assertEqual(len(tax), 19)
        codes = [t["code"] for t in tax]
        self.assertIn("V_DEL_INS", codes)
        self.assertIn("CODE", codes)
        self.assertIn("NONE", codes)
        
        conn.close()

    def test_02_api_get_projects_and_campaigns(self):
        """Verify REST API returns projects and active campaigns."""
        url = f"http://127.0.0.1:{TEST_PORT}/api/projects"
        with urlopen(url) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertIn("projects", data)
            self.assertEqual(len(data["projects"]), 1)

        url = f"http://127.0.0.1:{TEST_PORT}/api/campaigns"
        with urlopen(url) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertIn("campaigns", data)
            self.assertEqual(len(data["campaigns"]), 1)

    def test_03_api_get_items_and_audio_existence(self):
        """Verify test items contain verified audio file URLs."""
        url = f"http://127.0.0.1:{TEST_PORT}/api/items?suite_id=suite-dev23"
        with urlopen(url) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(data["count"], 92)
            
            # Check item KH01 audio paths
            kh01 = next(item for item in data["items"] if "KH01" in item["item_key"])
            self.assertTrue(kh01["audio_url"].startswith("/audio/"))

    def test_04_real_audio_streaming(self):
        """Verify the server streams real physical WAV audio without errors."""
        audio_subpath = "openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav"
        url = f"http://127.0.0.1:{TEST_PORT}/audio/{audio_subpath}"
        
        with urlopen(url) as res:
            self.assertEqual(res.status, 200)
            self.assertEqual(res.headers.get("Content-Type"), "audio/wav")
            audio_bytes = res.read()
            self.assertGreater(len(audio_bytes), 1000)
            # RIFF header check
            self.assertEqual(audio_bytes[:4], b"RIFF")

    def test_05_rater_registration_and_evaluation_submission(self):
        """Verify evaluator registration, score submission, and defect tagging."""
        # 1. Register test rater without needing PIN
        req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps({"name": "Test Evaluator Dr. Kim"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req) as res:
            self.assertIn(res.status, [200, 201])
            rater_data = json.loads(res.read().decode("utf-8"))
            rater_id = rater_data["rater"]["id"]

        # 2. Submit evaluation with clinical defect tag
        eval_payload = {
            "campaign_id": "camp-dev23-4models",
            "rater_id": rater_id,
            "item_id": "item-dev23-KH01-voxcpm2",
            "model_id": "model-voxcpm2",
            "scores": {
                "pronunciation": 5,
                "intelligibility": 5,
                "naturalness": 4,
                "voice_quality": 5
            },
            "blind_transcript": "អាឡូ សួស្តីបង!",
            "comments": "Very clear greeting, natural pitch contour.",
            "duration_seconds": 12.5,
            "defect_tags": [
                {
                    "word_index": 1,
                    "word_text": "សួស្តីបង",
                    "error_code": "NONE",
                    "note": "Clean pronunciation"
                }
            ]
        }
        req_eval = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps(eval_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_eval) as res:
            self.assertEqual(res.status, 201)
            eval_res = json.loads(res.read().decode("utf-8"))
            self.assertTrue(eval_res["success"])
            self.assertIn("evaluation_id", eval_res)

        # 3. Retrieve evaluation
        url = f"http://127.0.0.1:{TEST_PORT}/api/evaluations?campaign_id=camp-dev23-4models&rater_id={rater_id}"
        with urlopen(url) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(data["count"], 1)
            eval_item = data["evaluations"][0]
            self.assertEqual(eval_item["scores"]["pronunciation"], 5)
            self.assertEqual(len(eval_item["defect_tags"]), 1)
            self.assertEqual(eval_item["defect_tags"][0]["error_code"], "NONE")

    def test_06_admin_summary_and_csv_export(self):
        """Verify admin summary computes statistics with 95% confidence intervals and CSV exports cleanly."""
        url = f"http://127.0.0.1:{TEST_PORT}/api/admin/summary"
        req = Request(url, headers={"X-Admin-PIN": "2026"})
        with urlopen(req) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertGreaterEqual(data["total_evaluations"], 1)
            self.assertGreaterEqual(data["total_raters"], 1)
            self.assertTrue(len(data["model_statistics"]) > 0)
            
            voxcpm_stat = next((m for m in data["model_statistics"] if m["code"] == "C-002"), None)
            self.assertIsNotNone(voxcpm_stat)
            self.assertIn("pronunciation", voxcpm_stat["summary"])
            self.assertEqual(voxcpm_stat["summary"]["pronunciation"]["mean"], 5.0)

        # Test CSV export
        url_csv = f"http://127.0.0.1:{TEST_PORT}/api/admin/export.csv"
        req_csv = Request(url_csv, headers={"X-Admin-PIN": "2026"})
        with urlopen(req_csv) as res:
            self.assertEqual(res.status, 200)
            self.assertIn("text/csv", res.headers.get("Content-Type"))
            content = res.read().decode("utf-8-sig")
            lines = content.strip().split("\n")
            self.assertGreaterEqual(len(lines), 2)
            self.assertTrue(lines[0].startswith("trial_id,campaign_id,campaign_name,item_id") or lines[0].startswith("trial_id,item_id,category_name"))

    def test_07_dynamic_model_suite_and_campaign_setup(self):
        """Verify dynamic setup of new candidate model, custom prompt suite, and campaign."""
        # 1. Register new candidate model
        model_payload = {
            "name": "VoxCPM2 4-Steps Fast",
            "candidate_code": "C-005",
            "repo_id": "openbmb/voxcpm2-4steps",
            "sample_rate_hz": 48000,
            "audio_base_dir": "audio/openbmb-voxcpm2-4steps/audio"
        }
        req_m = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/models",
            data=json.dumps(model_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_m) as res:
            self.assertEqual(res.status, 201)
            m_res = json.loads(res.read().decode("utf-8"))
            self.assertTrue(m_res["success"])

        # 2. Create custom prompt test suite
        suite_payload = {
            "name": "Diffusion Step Screening Suite",
            "description": "5 prompt sentences to test diffusion speed vs quality",
            "items": [
                "អាឡូ សួស្តីបង!",
                "សូមកុម្ម៉ង់អាយឡាតេមួយកែវផ្អែមតិច",
                "តម្លៃសរុបដប់ពីរដុល្លារកន្លះ"
            ]
        }
        req_s = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps(suite_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_s) as res:
            self.assertEqual(res.status, 201)
            s_res = json.loads(res.read().decode("utf-8"))
            self.assertTrue(s_res["success"])
            suite_id = s_res["suite_id"]

        # 3. Launch campaign linking model and suite
        camp_payload = {
            "name": "Sprint 2: 4-Step vs 8-Step Benchmark",
            "suite_id": suite_id,
            "rubric_id": "rubric-pairwise"
        }
        req_c = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps(camp_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_c) as res:
            self.assertEqual(res.status, 201)
            c_res = json.loads(res.read().decode("utf-8"))
            self.assertTrue(c_res["success"])
            camp_id = c_res["campaign_id"]

        # 4. Verify the campaign items can be retrieved dynamically
        url_items = f"http://127.0.0.1:{TEST_PORT}/api/items?suite_id={suite_id}"
        with urlopen(url_items) as res:
            self.assertEqual(res.status, 200)
            items_data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(items_data["count"], 3)
            self.assertEqual(items_data["items"][0]["text"], "អាឡូ សួស្តីបង!")

    def test_08_seed_capstone_endpoint(self):
        """Verify POST /api/seed/capstone seeds benchmark on demand."""
        req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/seed/capstone",
            data=b"{}",
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(data["success"])

    def test_09_custom_rubrics_and_audio_upload(self):
        """Verify dynamic custom evaluation matrix creation and base64 audio upload."""
        import base64
        # 1. Test POST /api/rubrics
        rubric_payload = {
            "name": "Custom Conversational Prosody Matrix",
            "protocol_type": "Custom",
            "scale_min": 1,
            "scale_max": 7,
            "metrics": [
                {"id": "naturalness", "name": "Naturalness", "desc": "Conversational realism"},
                {"id": "prosody", "name": "Prosodic Intonation", "desc": "Pitch and rhythm"},
                {"id": "artifacts", "name": "Audio Artifacts", "desc": "Buzz, clicks, phase distortion"}
            ]
        }
        req_r = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/rubrics",
            data=json.dumps(rubric_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_r) as res:
            self.assertEqual(res.status, 201)
            r_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(r_data["success"])
            rubric_id = r_data["rubric_id"]

        # 2. Test GET /api/rubrics
        url_r = f"http://127.0.0.1:{TEST_PORT}/api/rubrics"
        with urlopen(url_r) as res:
            self.assertEqual(res.status, 200)
            all_rubrics = json.loads(res.read().decode("utf-8"))["rubrics"]
            created = next(r for r in all_rubrics if r["id"] == rubric_id)
            self.assertEqual(created["scale_max"], 7)
            self.assertEqual(len(created["metrics"]), 3)

        # 3. Test POST /api/upload-audio
        test_wav = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
        upload_payload = {
            "filename": "custom_sample.wav",
            "data_base64": base64.b64encode(test_wav).decode("ascii")
        }
        req_u = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/upload-audio",
            data=json.dumps(upload_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_u) as res:
            self.assertEqual(res.status, 201)
            u_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(u_data["success"])
            self.assertTrue(u_data["url"].startswith("/audio/uploads/"))

        # 4. Verify uploaded audio is accessible via GET /audio/uploads/...
        url_audio = f"http://127.0.0.1:{TEST_PORT}{u_data['url']}"
        with urlopen(url_audio) as res:
            self.assertEqual(res.status, 200)
            self.assertEqual(res.read(), test_wav)

    def test_10_campaign_management_lifecycle_and_deletion(self):
        """Verify Active Studies management: telemetry metrics, status toggle, and HTTP DELETE."""
        # 1. Create a transient study campaign
        camp_payload = {
            "name": "Temporary Benchmark Study",
            "suite_id": "suite-dev23",
            "rubric_id": "rubric-pairwise",
            "instructions": "Testing deletion lifecycle"
        }
        req_c = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps(camp_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_c) as res:
            self.assertEqual(res.status, 201)
            c_data = json.loads(res.read().decode("utf-8"))
            camp_id = c_data["campaign_id"]

        # 2. Check telemetry in GET /api/campaigns
        url_list = f"http://127.0.0.1:{TEST_PORT}/api/campaigns"
        with urlopen(url_list) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            created = next(c for c in data["campaigns"] if c["id"] == camp_id)
            self.assertIn("items_count", created)
            self.assertIn("evaluations_count", created)
            self.assertIn("raters_count", created)
            self.assertEqual(created["is_active"], 1)

        # 3. Toggle Status to Archived (0)
        req_status = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns/status",
            data=json.dumps({"campaign_id": camp_id, "is_active": 0}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_status) as res:
            self.assertEqual(res.status, 200)
            s_data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(s_data["is_active"], 0)

        # 4. Delete the campaign via HTTP DELETE
        req_del = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns?id={camp_id}",
            method="DELETE",
            headers={"X-Admin-PIN": "2026"}
        )
        with urlopen(req_del) as res:
            self.assertEqual(res.status, 200)
            del_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(del_data["success"])
            self.assertEqual(del_data["deleted_campaign_id"], camp_id)

        # 5. Confirm campaign is gone
        with urlopen(url_list) as res:
            data = json.loads(res.read().decode("utf-8"))
            found = any(c["id"] == camp_id for c in data["campaigns"])
            self.assertFalse(found, "Deleted campaign should not appear in campaigns list")

    def test_11_admin_pin_security(self):
        """Verify endpoints reject requests without a valid PIN and accept requests with a valid PIN."""
        # 1. Accessing admin summary without PIN should fail with 401
        url_summary = f"http://127.0.0.1:{TEST_PORT}/api/admin/summary"
        with self.assertRaises(HTTPError) as ctx:
            urlopen(url_summary)
        self.assertEqual(ctx.exception.code, 401)

        # 2. Accessing admin summary with wrong PIN should fail with 401
        req_wrong = Request(url_summary, headers={"X-Admin-PIN": "wrong-pin-999"})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_wrong)
        self.assertEqual(ctx.exception.code, 401)

        # 3. Admin login endpoint with invalid PIN
        req_login_bad = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/login",
            data=json.dumps({"pin": "invalid"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_login_bad)
        self.assertEqual(ctx.exception.code, 401)

        # 4. Admin login endpoint with valid PIN (test with 'veaja' or '2026')
        req_login_ok = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/login",
            data=json.dumps({"pin": "veaja"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_login_ok) as res:
            self.assertEqual(res.status, 200)
            login_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(login_data["success"])
            self.assertIn("pin-veaja", login_data["token"])

        # 5. Admin registration endpoint: Invalid PIN length returns 400
        req_reg_bad = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/register",
            data=json.dumps({"username": "dr_kim", "pin": "123", "current_pin": "2026"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_reg_bad)
        self.assertEqual(ctx.exception.code, 400)

        # 6. Admin registration endpoint: Missing/Wrong current PIN returns 401
        req_reg_unauth = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/register",
            data=json.dumps({"username": "dr_kim", "pin": "9876", "current_pin": "wrong-pin"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_reg_unauth)
        self.assertEqual(ctx.exception.code, 401)

        # 7. Admin registration endpoint: Valid 4-digit PIN returns 200
        req_reg_ok = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/register",
            data=json.dumps({"username": "dr_kim", "pin": "9876", "current_pin": "2026"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_reg_ok) as res:
            self.assertEqual(res.status, 200)
            reg_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(reg_data["success"])
            self.assertIn("pin-9876", reg_data["token"])

        # 8. Admin login with newly registered PIN
        req_login_new = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/login",
            data=json.dumps({"pin": "9876"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_login_new) as res:
            self.assertEqual(res.status, 200)
            login_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(login_data["success"])

        # 9. Verify new PIN authorizes admin endpoints
        req_summary_new = Request(url_summary, headers={"X-Admin-PIN": "9876"})
        with urlopen(req_summary_new) as res:
            self.assertEqual(res.status, 200)

    def test_12_asr_campaign_and_adjudication(self):
        """Verify ASR campaign setup, evaluation with asr_adjudication, and ASR summary telemetry."""
        # 1. Create custom ASR test suite with reference & hypothesis transcripts
        suite_payload = {
            "name": "ASR Telephony Benchmark Suite",
            "description": "ASR test suite with reference speech and model transcripts",
            "items": [
                {
                    "item_key": "ASR-001",
                    "reference_transcript": "សូមស្វាគមន៍មកកាន់សេវាកម្មអតិថិជន",
                    "hypothesis_transcript": "សូមស្វាគមន៍មកកាន់សេវាអតិថិជន",
                    "audio_url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav"
                },
                {
                    "item_key": "ASR-002",
                    "reference_transcript": "ផ្ទេរប្រាក់ដប់ដុល្លារ",
                    "hypothesis_transcript": "ផ្ទេរប្រាក់មួយរយដុល្លារ",
                    "audio_url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav"
                }
            ]
        }
        req_suite = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps(suite_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_suite) as res:
            self.assertEqual(res.status, 201)
            s_data = json.loads(res.read().decode("utf-8"))
            suite_id = s_data["suite_id"]

        # 2. Create ASR Campaign
        camp_payload = {
            "name": "Khmer ASR Telephony Trial",
            "modality": "ASR",
            "suite_id": suite_id,
            "rubric_id": "rubric-pairwise",
            "instructions": "Compare reference speech to decoded hypothesis"
        }
        req_camp = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps(camp_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_camp) as res:
            self.assertEqual(res.status, 201)
            c_data = json.loads(res.read().decode("utf-8"))
            camp_id = c_data["campaign_id"]

        # 3. Retrieve items and verify ASR fields are present
        url_items = f"http://127.0.0.1:{TEST_PORT}/api/items?suite_id={suite_id}"
        with urlopen(url_items) as res:
            self.assertEqual(res.status, 200)
            items_data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(items_data["count"], 2)
            item1 = items_data["items"][0]
            item2 = items_data["items"][1]
            self.assertEqual(item1["reference_transcript"], "សូមស្វាគមន៍មកកាន់សេវាកម្មអតិថិជន")
            self.assertEqual(item1["hypothesis_transcript"], "សូមស្វាគមន៍មកកាន់សេវាអតិថិជន")

        # 4. Register a rater and submit ASR evaluations
        req_rater = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps({"name": "ASR Linguistic Reviewer"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_rater) as res:
            rater_id = json.loads(res.read().decode("utf-8"))["rater"]["id"]

        # Submit ACCEPTABLE_VARIATION for item 1
        eval1 = {
            "campaign_id": camp_id,
            "rater_id": rater_id,
            "item_id": item1["id"],
            "model_id": "model-voxcpm2",
            "asr_adjudication": "ACCEPTABLE_VARIATION",
            "comments": "Minor colloquial omission of កម្ម but meaning intact"
        }
        req_eval1 = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps(eval1).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_eval1) as res:
            self.assertEqual(res.status, 201)

        # Submit CRITICAL_ERROR for item 2
        eval2 = {
            "campaign_id": camp_id,
            "rater_id": rater_id,
            "item_id": item2["id"],
            "model_id": "model-voxcpm2",
            "asr_adjudication": "CRITICAL_ERROR",
            "comments": "Ten dollars misheard as one hundred dollars - catastrophic error"
        }
        req_eval2 = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps(eval2).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_eval2) as res:
            self.assertEqual(res.status, 201)

        # 5. Check admin summary telemetry for ASR metrics
        url_summary = f"http://127.0.0.1:{TEST_PORT}/api/admin/summary?campaign_id={camp_id}"
        req_summary = Request(url_summary, headers={"X-Admin-PIN": "2026"})
        with urlopen(req_summary) as res:
            self.assertEqual(res.status, 200)
            summary_data = json.loads(res.read().decode("utf-8"))
            self.assertIn("asr_summary", summary_data)
            asr_stats = summary_data["asr_summary"]
            self.assertEqual(asr_stats["total_judgments"], 2)
            self.assertEqual(asr_stats["acceptable_variations"], 1)
            self.assertEqual(asr_stats["critical_errors"], 1)
            self.assertAlmostEqual(asr_stats["acceptable_rate"], 50.0)

    def test_ui_config_and_folder_linking(self):
        """Test persisting ui_config_json in campaigns and linking local audio folder."""
        # 1. Test POST /api/link-folder with existing audio directory
        req_folder = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/link-folder",
            data=json.dumps({"folder_path": "audio"}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_folder) as res:
            self.assertEqual(res.status, 200)
            data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(data.get("success"))
            self.assertIn("files", data)
            self.assertIsInstance(data["files"], list)

        # 2. Test creating campaign with ui_config
        suite_payload = {
            "name": "Modular Suite",
            "items": [{"item_key": "M01", "text": "តេស្ត", "audio_url": "/audio/test.wav"}]
        }
        req_suite = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps(suite_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_suite) as res:
            suite_id = json.loads(res.read().decode("utf-8"))["suite_id"]

        test_ui_config = {
            "archetype": "conversational_telephone_mos",
            "dsp": {"phone_filter_8khz": True, "speed_controls": True},
            "presentation": {"blind_gating": False, "word_pills": True}
        }
        camp_payload = {
            "name": "Modular UI Campaign",
            "suite_id": suite_id,
            "rubric_id": "rubric-veaja-p85",
            "instructions": "Modular instructions",
            "ui_config": test_ui_config
        }
        req_camp = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps(camp_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_camp) as res:
            self.assertEqual(res.status, 201)
            camp_id = json.loads(res.read().decode("utf-8"))["campaign_id"]

        # 3. Retrieve campaign and verify ui_config_json is returned and matches
        url_camps = f"http://127.0.0.1:{TEST_PORT}/api/campaigns"
        with urlopen(url_camps) as res:
            self.assertEqual(res.status, 200)
            camps = json.loads(res.read().decode("utf-8"))["campaigns"]
            target = next((c for c in camps if c["id"] == camp_id), None)
            self.assertIsNotNone(target)
            self.assertIn("ui_config_json", target)
            stored_cfg = json.loads(target["ui_config_json"])
            self.assertTrue(stored_cfg["dsp"]["phone_filter_8khz"])

    def test_modular_campaign_end_to_end(self):
        """Task 8: End-to-end integration test of modular builder, ui_config, and evaluator rating."""
        # 1. Create a suite with 5 items
        suite_id = f"suite-modular-e2e-{int(time.time())}"
        items_payload = [
            {
                "item_key": f"E2E-{i}",
                "source_text": f"ឃ្លាគំរូទី {i}",
                "text": f"ឃ្លាគំរូទី {i}",
                "audio_url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav"
            }
            for i in range(1, 6)
        ]
        req_suite = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps({"id": suite_id, "name": "E2E Modular Suite", "items": items_payload}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_suite) as res:
            self.assertIn(res.status, [200, 201])

        # 2. Post campaign with modular ui_config (phone filter + blind gating)
        ui_config = {
            "dsp": {"phone_filter_8khz": True, "speeds": [0.8, 1.0, 1.2]},
            "presentation": {"blind_gating": True, "font_size": "32px"},
            "blocks": [
                {"id": "blk-prompt-1", "type": "text_prompt", "mode": "blind_gated"},
                {"id": "blk-audio-1", "type": "audio_player", "phone_filter": True},
                {"id": "blk-scoring-1", "type": "scoring_questions", "scale_max": 5}
            ]
        }
        camp_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps({
                "name": "E2E Modular Builder Study",
                "suite_id": suite_id,
                "rubric_id": "rubric-veaja-p85",
                "instructions": "E2E evaluation instructions",
                "ui_config_json": json.dumps(ui_config)
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(camp_req) as res:
            self.assertEqual(res.status, 201)
            camp_data = json.loads(res.read().decode("utf-8"))
            camp_id = camp_data["campaign_id"]

        # 3. Fetch items for this campaign
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/items?campaign_id={camp_id}") as res:
            items_data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(items_data["count"], 5)
            first_item = items_data["items"][0]

        # 4. Register evaluator and submit evaluation
        req_rater = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps({"name": "Modular Evaluator Sokha"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_rater) as res:
            rater_id = json.loads(res.read().decode("utf-8"))["rater"]["id"]

        eval_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps({
                "campaign_id": camp_id,
                "rater_id": rater_id,
                "item_id": first_item["id"],
                "model_id": "model-voxcpm2",
                "scores": {"naturalness": 5, "pronunciation": 4},
                "comments": "Auditioned with 8kHz telephone bandpass filter."
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(eval_req) as res:
            self.assertEqual(res.status, 201)

        # 5. Check admin summary consensus
        req_summary = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/summary?campaign_id={camp_id}",
            headers={"X-Admin-PIN": "2026"}
        )
        with urlopen(req_summary) as res:
            self.assertEqual(res.status, 200)
            summary = json.loads(res.read().decode("utf-8"))
            self.assertEqual(summary["total_evaluations"], 1)
            self.assertEqual(summary["total_raters"], 1)

    def test_campaign_launch_with_empty_models(self):
        """Verify POST /api/suites and POST /api/campaigns succeed even when items have no predefined model_id or models array is empty."""
        suite_id = f"suite-empty-models-{int(time.time() * 1000)}"
        # Suite items without predefined model_id or with fallback candidate model
        items_payload = [
            {
                "item_key": f"ITEM-ZERO-{i}",
                "text": f"ឃ្លាសាកល្បងគំរូទទេ {i}",
                "audio_url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav",
                "audio_files_json": json.dumps({
                    "model-candidate": {
                        "model_name": "Candidate Voice",
                        "model_id": "model-candidate",
                        "url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav"
                    }
                })
            }
            for i in range(1, 3)
        ]

        req_suite = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps({"id": suite_id, "name": "Zero Model Suite", "items": items_payload}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_suite) as res:
            self.assertIn(res.status, [200, 201])
            suite_data = json.loads(res.read().decode("utf-8"))
            self.assertTrue(suite_data.get("success", True))

        # Launch campaign linked to this suite
        camp_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps({
                "name": "Zero Model Campaign",
                "suite_id": suite_id,
                "rubric_id": "rubric-veaja-p85",
                "instructions": "Single candidate model evaluation without predefined comparison models."
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(camp_req) as res:
            self.assertEqual(res.status, 201)
            camp_data = json.loads(res.read().decode("utf-8"))
            camp_id = camp_data["campaign_id"]

        # Verify items can be fetched for campaign
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/items?campaign_id={camp_id}") as res:
            items_data = json.loads(res.read().decode("utf-8"))
            self.assertEqual(items_data["count"], 2)

    def test_decluttered_admin_html_structure(self):
        """Verify public/admin.html contains the de-cluttered studio creator structure."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        self.assertTrue(os.path.exists(admin_html_path), "public/admin.html must exist")

        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 1. Verify unified dropzone and multi-file input
        self.assertIn('id="dropzone-unified"', content)
        self.assertIn('id="multi-file-input"', content)

        # 2. Verify expanded viewport width
        self.assertTrue('max-w-[1560px]' in content or 'max-w-6xl' in content)

        # 3. Verify no hardcoded default models rendered in the initial HTML template
        # Check models chips container is clean and empty
        chips_container_marker = 'id="models-chips-container"'
        self.assertIn(chips_container_marker, content)
        chips_section = content.split(chips_container_marker, 1)[1].split('</div>', 1)[0]
        self.assertNotIn("VoxCPM", chips_section)
        self.assertNotIn("Meta MMS", chips_section)
        self.assertNotIn("Kokoro", chips_section)
        self.assertNotIn("Bark", chips_section)

    def test_dropzone_loading_overlay_structure(self):
        """Verify public/admin.html contains the dropzone loading overlay and spinner elements."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn('id="dropzone-loading-overlay"', content)
        self.assertIn('id="dropzone-loading-text"', content)
        self.assertIn('id="dropzone-spinner"', content)

    def test_step3_plain_english_toolbox(self):
        """Verify Step 3 toolbox uses plain-English labels and clean icons without rainbow dots."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Check plain English replacements
        self.assertIn("Audio Player", content)
        self.assertIn("Prompt Text", content)
        self.assertIn("Word Highlighter", content)
        self.assertIn("Rating Scale", content)
        self.assertIn("Listener Hearing", content)
        # Confirm rainbow dot classes removed from toolbox items
        toolbox_section = content.split('id="builder-toolbox"', 1)[1].split('<!-- ZONE 2', 1)[0]
        self.assertNotIn("bg-emerald-500", toolbox_section)
        self.assertNotIn("bg-blue-500", toolbox_section)
        self.assertNotIn("bg-amber-500", toolbox_section)
        self.assertNotIn("bg-purple-500", toolbox_section)

    def test_step3_wysiwyg_canvas_structure(self):
        """Verify Step 3 canvas provides expansive layout and WYSIWYG preview container."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Check expanded allocation (Canvas gets flex-1 dominant width)
        self.assertIn('id="builder-canvas"', content)
        self.assertIn('flex-1', content)



    def test_csv_upload_loading_state_wiring(self):
        """Verify admin_app.js wraps processCsvFile calls with setDropzoneLoading."""
        admin_js_path = os.path.join(TOOL_DIR, "public", "js", "admin_app.js")
        with open(admin_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn('setDropzoneLoading(true, "Reading and parsing CSV transcript...")', content)


    def test_step3_expanded_viewport_and_clean_header(self):
        """Verify admin.html uses max-w-[1560px] layout and starter kits noise is removed."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("max-w-[1560px]", content)
        self.assertNotIn("Starter Kits:", content)
        self.assertNotIn("btn-kit-mos", content)


    def test_step3_customize_drawer_structure(self):
        """Verify Step 3 contains the collapsible Customize Drawer."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn('id="drawer-customize"', content)
        self.assertIn("Customize Component", content)

    def test_wysiwyg_real_waveform_and_no_fake_defaults(self):
        """Verify renderCanvas generates 76px waveform canvas structure matching eval.html."""
        admin_js_path = os.path.join(TOOL_DIR, "public", "js", "admin_app.js")
        with open(admin_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("preview-waveform-canvas", content)
        self.assertIn("h-[76px]", content)
        self.assertIn("drawPreviewWaveform", content)

    def test_step3_drag_drop_insertion_and_polite_guide(self):
        """Verify Step 3 supports drop indicator positioning and uses polite guide copy."""
        admin_js_path = os.path.join(TOOL_DIR, "public", "js", "admin_app.js")
        with open(admin_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("getDropInsertionIndex", content)
        self.assertIn("drop-indicator", content)
        self.assertNotIn("Blocker: Missing", content)
        self.assertIn("Audio Player Needed", content)

    def test_step4_celebration_and_reset_structure(self):
        """Verify Step 4 contains celebration card and + Create Another Study button."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="published-celebration-card"', html)
        self.assertIn('id="btn-create-another-study"', html)
        self.assertIn('id="btn-view-study-results"', html)

    def test_smart_navigation_tab_structure(self):
        """Verify navigation header supports dynamic draft status indicator."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="tab-btn-wizard-text"', html)
        self.assertIn('id="tab-wizard-indicator-dot"', html)

    def test_inactive_study_rater_submission_blocked(self):
        """Verify raters cannot submit evaluations to a closed/inactive campaign."""
        # 1. Create a campaign
        suite_id = "suite-dev23"
        rubric_id = "rubric-veaja-p85"
        req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps({
                "project_id": "proj-veaja-khmer",
                "name": "Test Inactive Study",
                "suite_id": suite_id,
                "rubric_id": rubric_id,
                "instructions": "Test"
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        res = urlopen(req)
        c_id = json.loads(res.read().decode("utf-8"))["campaign_id"]

        # 2. Toggle status to closed (is_active = 0)
        req_status = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns/status",
            data=json.dumps({"campaign_id": c_id, "is_active": 0}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        urlopen(req_status)

        # 3. Register a rater
        rater_id = f"rater-closed-{int(time.time() * 1000)}"
        req_rater = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps({"id": rater_id, "name": "Closed Study Tester"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        urlopen(req_rater)

        # 4. Attempt to submit evaluation to closed campaign
        eval_payload = {
            "campaign_id": c_id,
            "rater_id": rater_id,
            "item_id": "item-dev23-KH01-voxcpm2",
            "model_id": "model-voxcpm2",
            "scores": {"naturalness": 4}
        }
        req_eval = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps(eval_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        try:
            urlopen(req_eval)
            self.fail("Expected HTTP 403 Forbidden when submitting to closed study")
        except HTTPError as e:
            self.assertEqual(e.code, 403)


    def test_results_and_scores_chart_containers(self):
        """Verify Results & Scores view contains visual chart containers and empty state."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="chart-mos-comparison"', html)
        self.assertIn('id="chart-defect-distribution"', html)
        self.assertIn('id="analytics-empty-state"', html)

    def test_admin_results_dynamic_ui_containers(self):
        """Verify Task 4 requirements: admin.html has dynamic filters, metric select, ASR card, and word heatmap."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="analytics-model-filter"', html)
        self.assertIn('id="analytics-rater-filter"', html)
        self.assertIn('id="chart-metric-select"', html)
        self.assertIn('id="analytics-asr-card"', html)
        self.assertIn('id="analytics-word-heatmap-tbody"', html)
        self.assertIn('id="analytics-data-content"', html)


    def test_delete_modal_double_confirmation_input(self):
        """Verify delete modal requires typing study name before enabling delete button."""
        admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
        with open(admin_html_path, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="delete-study-confirm-input"', html)
        self.assertIn('id="delete-study-prompt-name"', html)


    def test_backup_export_and_import_cycle(self):
        """Verify admin backup export produces valid zip archive and import restores successfully."""
        import zipfile
        import io
        import base64

        # 1. Test GET /api/admin/export-backup
        req_export = Request(f"http://127.0.0.1:{TEST_PORT}/api/admin/export-backup", headers={"X-Admin-PIN": "2026"})
        try:
            with urlopen(req_export) as resp:
                self.assertEqual(resp.status, 200)
                self.assertEqual(resp.headers.get("Content-Type"), "application/zip")
                zip_bytes = resp.read()
        except HTTPError as e:
            print("ERROR BODY:", e.read().decode())
            raise

        # Validate that the downloaded zip file has valid zip structure
        zip_buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(zip_buf, "r") as zf:
            namelist = zf.namelist()
            self.assertTrue(len(namelist) > 0)
            self.assertIn("workbench.db", namelist)

        # 2. Test POST /api/admin/import-backup
        zip_b64 = base64.b64encode(zip_bytes).decode("ascii")
        req_import = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/import-backup",
            data=json.dumps({"zip_base64": zip_b64}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_import) as resp:
            self.assertEqual(resp.status, 200)
            res_data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(res_data.get("success"))
            self.assertIn("studies_count", res_data)


    def test_campaign_safe_in_place_update(self):
        """Verify POST /api/campaigns/update allows non-destructive live updates to study instructions and name."""
        req_update = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns/update",
            data=json.dumps({
                "campaign_id": "camp-dev23-4models",
                "name": "Capstone-Sprint2-Updated",
                "instructions": "Listen carefully to consonant boundaries."
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_update) as resp:
            self.assertEqual(resp.status, 200)
            res_data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(res_data.get("success"))

        # Verify update in GET /api/campaigns
        req_get = Request(f"http://127.0.0.1:{TEST_PORT}/api/campaigns")
        with urlopen(req_get) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            campaigns = data.get("campaigns", data if isinstance(data, list) else [])
            found = next((c for c in campaigns if c["id"] == "camp-dev23-4models"), None)
            self.assertIsNotNone(found)
            self.assertEqual(found["name"], "Capstone-Sprint2-Updated")
            self.assertEqual(found["instructions"], "Listen carefully to consonant boundaries.")


    def test_binary_metrics_and_sprint3_studies(self):
        """Verify binary metrics calculation (pass_rate, pass_count) and simplified error taxonomies."""
        # 1. Verify taxonomies include 4 clean categories
        conn = sqlite3.connect(TEST_DB_PATH)
        cur = conn.cursor()
        taxonomies = cur.execute("SELECT code, category, name_en FROM taxonomies").fetchall()
        self.assertGreaterEqual(len(taxonomies), 19)
        categories = set(t[1] for t in taxonomies)
        self.assertTrue({"pronunciation", "glitch", "pacing", "missing"}.issubset(categories))
        conn.close()

        # 2. Register rater and submit binary evaluations
        rater_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps({"name": "BinaryRaterTest"}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(rater_req) as resp:
            rater_data = json.loads(resp.read().decode("utf-8"))
            rater_id = rater_data["rater"]["id"]

        eval_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps({
                "campaign_id": "camp-dev23-4models",
                "rater_id": rater_id,
                "item_id": "item-dev23-KH01-voxcpm2",
                "model_id": "model-voxcpm2",
                "scores": {"pronunciation": 1, "telephone_intelligibility": 0},
                "defect_tags": []
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(eval_req) as resp:
            self.assertEqual(resp.status, 201)

        # 3. Query admin summary and verify is_binary & pass_rate telemetry
        sum_req = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/admin/summary?campaign_id=camp-dev23-4models",
            headers={"X-Admin-PIN": "2026"}
        )
        with urlopen(sum_req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = data.get("model_statistics", [])
            vox = next((m for m in models if m.get("model_id") == "model-voxcpm2"), None)
            self.assertIsNotNone(vox)
            tel_stat = vox.get("summary", {}).get("telephone_intelligibility")
            self.assertIsNotNone(tel_stat)
            self.assertTrue(tel_stat.get("is_binary"))
            self.assertEqual(tel_stat.get("pass_count"), 0)
            self.assertEqual(tel_stat.get("fail_count"), 1)
            self.assertEqual(tel_stat.get("pass_rate"), 0.0)

    def test_admin_summary_dynamic_scale_rater_stats_and_scoped_csv(self):
        """Verify dynamic scale bounds, rater_statistics, and scoped CSV export with defect_tags_json."""
        # 1. Create a custom rubric with scale_min=1, scale_max=7
        rubric_payload = {
            "name": "7-Point Quality Scale",
            "protocol_type": "ACR",
            "scale_min": 1,
            "scale_max": 7,
            "metrics": [
                {"key": "overall_quality", "label_en": "Overall Quality", "min": 1, "max": 7}
            ]
        }
        req_rubric = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/rubrics",
            data=json.dumps(rubric_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_rubric) as resp:
            self.assertEqual(resp.status, 201)
            rubric_res = json.loads(resp.read().decode("utf-8"))
            rubric_id = rubric_res["rubric_id"]

        # 2. Create custom suite & campaign
        suite_payload = {
            "name": "Dynamic Scale Test Suite",
            "description": "Suite for testing dynamic scale admin telemetry",
            "items": ["ប្រយោគតេស្តខ្នាតទីមួយ"]
        }
        req_suite = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/suites",
            data=json.dumps(suite_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_suite) as resp:
            suite_res = json.loads(resp.read().decode("utf-8"))
            suite_id = suite_res["suite_id"]

        camp_payload = {
            "name": "Dynamic Scale Campaign 7pt",
            "suite_id": suite_id,
            "rubric_id": rubric_id,
            "modality": "TTS"
        }
        req_camp = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
            data=json.dumps(camp_payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"}
        )
        with urlopen(req_camp) as resp:
            camp_res = json.loads(resp.read().decode("utf-8"))
            camp_id = camp_res["campaign_id"]

        # Get test item id
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/items?suite_id={suite_id}") as resp:
            items_data = json.loads(resp.read().decode("utf-8"))
            item_id = items_data["items"][0]["id"]

        # 3. Register rater and submit evaluations with high score (6 and 7)
        rater_payload = {"name": "ScaleRaterSeven"}
        req_rater = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/raters",
            data=json.dumps(rater_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_rater) as resp:
            rater_res = json.loads(resp.read().decode("utf-8"))
            rater_id = rater_res["rater"]["id"]

        eval_payload = {
            "campaign_id": camp_id,
            "rater_id": rater_id,
            "item_id": item_id,
            "model_id": "model-voxcpm2",
            "scores": {"overall_quality": 7},
            "defect_tags": [
                {"word_index": 0, "word_text": "ប្រយោគ", "error_code": "MISPRONUNCIATION"}
            ],
            "duration_seconds": 12.4
        }
        req_eval = Request(
            f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
            data=json.dumps(eval_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urlopen(req_eval) as resp:
            self.assertEqual(resp.status, 201)

        # 4. Check /api/evaluations includes audio_url, audio_files_json and filters by model_id
        evals_url = f"http://127.0.0.1:{TEST_PORT}/api/evaluations?campaign_id={camp_id}&model_id=model-voxcpm2"
        with urlopen(evals_url) as resp:
            self.assertEqual(resp.status, 200)
            evals_data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(len(evals_data["evaluations"]), 1)
            ev0 = evals_data["evaluations"][0]
            self.assertIn("audio_url", ev0)
            self.assertIn("audio_files_json", ev0)
            self.assertEqual(ev0["model_id"], "model-voxcpm2")

        # Non-matching model filter should return empty
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/evaluations?campaign_id={camp_id}&model_id=nonexistent") as resp:
            empty_evals = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(len(empty_evals["evaluations"]), 0)

        # 5. Check /api/admin/summary with campaign_id
        summary_url = f"http://127.0.0.1:{TEST_PORT}/api/admin/summary?campaign_id={camp_id}"
        req_sum = Request(summary_url, headers={"X-Admin-PIN": "2026"})
        with urlopen(req_sum) as resp:
            self.assertEqual(resp.status, 200)
            sdata = json.loads(resp.read().decode("utf-8"))
            
            # study_meta presence and dynamic bounds
            self.assertIn("study_meta", sdata)
            self.assertEqual(sdata["study_meta"]["scale_max"], 7)
            self.assertEqual(sdata["study_meta"]["scale_min"], 1)
            self.assertEqual(sdata["study_meta"]["total_items"], 1)

            # model_stats has model_name and name
            self.assertTrue(len(sdata["model_statistics"]) > 0)
            m0 = sdata["model_statistics"][0]
            self.assertIn("name", m0)
            self.assertIn("model_name", m0)
            self.assertEqual(m0["name"], m0["model_name"])

            # rater_statistics telemetry
            self.assertIn("rater_statistics", sdata)
            self.assertEqual(len(sdata["rater_statistics"]), 1)
            r0 = sdata["rater_statistics"][0]
            self.assertEqual(r0["rater_id"], rater_id)
            self.assertEqual(r0["rater_name"], "ScaleRaterSeven")
            self.assertEqual(r0["eval_count"], 1)
            self.assertEqual(r0["avg_duration_sec"], 12.4)
            self.assertEqual(r0["mean_score"], 7.0)
            self.assertEqual(r0["defect_count"], 1)
            self.assertIsNotNone(r0["last_submitted_at"])

            # Check ci_upper allowed above 5.0 when scale_max is 7
            # With mean 7.0, single score margin is 0, but mean is 7.0 > 5.0
            stat_summary = m0["summary"]["overall_quality"]
            self.assertGreater(stat_summary["mean"], 5.0)
            self.assertGreater(stat_summary["ci_upper"], 5.0)
            self.assertLessEqual(stat_summary["ci_upper"], 7.0)

        # 6. Verify scoped CSV export with defect_tags_json and new columns
        csv_url = f"http://127.0.0.1:{TEST_PORT}/api/admin/export.csv?campaign_id={camp_id}"
        req_csv = Request(csv_url, headers={"X-Admin-PIN": "2026"})
        with urlopen(req_csv) as resp:
            self.assertEqual(resp.status, 200)
            content = resp.read().decode("utf-8-sig")
            lines = content.strip().split("\n")
            header = lines[0]
            self.assertIn("campaign_id", header)
            self.assertIn("campaign_name", header)
            self.assertIn("defect_tags_json", header)
            self.assertIn("duration_seconds", header)
            self.assertIn("asr_adjudication", header)
            
            # Row check
            self.assertEqual(len(lines), 2)
            row_data = lines[1]
            self.assertIn(camp_id, row_data)
            self.assertIn("MISPRONUNCIATION", row_data)

    def test_delete_rater_scoped_and_global(self):
        """Verify DELETE /api/raters endpoint for scoped and global deletion."""
        # 1. Unauthenticated request should fail with 401
        del_url = f"http://127.0.0.1:{TEST_PORT}/api/raters?id=rater-dummy"
        req_unauth = Request(del_url, method="DELETE")
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_unauth)
        self.assertEqual(ctx.exception.code, 401)

        # 2. Setup 2 campaigns and 1 rater with evaluations in both
        # Register rater
        req_reg = Request(f"http://127.0.0.1:{TEST_PORT}/api/raters",
                          data=json.dumps({"name": f"ModeratedRater_{int(time.time()*1000)}", "role": "Evaluator"}).encode("utf-8"),
                          headers={"Content-Type": "application/json"})
        with urlopen(req_reg) as resp:
            rater_data = json.loads(resp.read().decode())
            rater_id = rater_data["rater"]["id"]

        camp1_id = "camp-dev23-4models"
        # Create camp2
        suite_id = f"suite-{int(time.time()*1000)}"
        req_suite = Request(f"http://127.0.0.1:{TEST_PORT}/api/suites",
                            data=json.dumps({
                                "id": suite_id,
                                "name": "Suite for Moderation",
                                "items": [{"model_id": "model-voxcpm2", "audio_url": "/audio/openbmb-voxcpm2/run_20261022_225128/audio/KH01.wav", "text": "Test"}]
                            }).encode("utf-8"),
                            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"})
        with urlopen(req_suite) as resp:
            self.assertEqual(resp.status, 201)

        camp2_id = f"camp-{int(time.time()*1000)}"
        req_camp2 = Request(f"http://127.0.0.1:{TEST_PORT}/api/campaigns",
                            data=json.dumps({"id": camp2_id, "name": "Moderation Study 2", "suite_id": suite_id}).encode("utf-8"),
                            headers={"Content-Type": "application/json", "X-Admin-PIN": "2026"})
        with urlopen(req_camp2) as resp:
            self.assertEqual(resp.status, 201)
            camp2_id = json.loads(resp.read().decode())["campaign_id"]

        # Submit eval to camp1
        # Fetch an item from camp1
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/items?campaign_id={camp1_id}") as resp:
            item1 = json.loads(resp.read().decode())["items"][0]

        eval1_payload = {
            "campaign_id": camp1_id,
            "item_id": item1["id"],
            "model_id": "model-voxcpm2",
            "rater_id": rater_id,
            "scores": {"overall_quality": 4},
            "defect_tags": [{"category": "NOISE", "severity": 2}]
        }
        req_eval1 = Request(f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
                            data=json.dumps(eval1_payload).encode("utf-8"),
                            headers={"Content-Type": "application/json"})
        with urlopen(req_eval1) as resp:
            self.assertEqual(resp.status, 201)

        # Submit eval to camp2
        with urlopen(f"http://127.0.0.1:{TEST_PORT}/api/items?campaign_id={camp2_id}") as resp:
            item2 = json.loads(resp.read().decode())["items"][0]

        eval2_payload = {
            "campaign_id": camp2_id,
            "item_id": item2["id"],
            "model_id": "model-voxcpm2",
            "rater_id": rater_id,
            "scores": {"overall_quality": 3},
            "defect_tags": [{"category": "MISPRONUNCIATION", "severity": 3}]
        }
        req_eval2 = Request(f"http://127.0.0.1:{TEST_PORT}/api/evaluations",
                            data=json.dumps(eval2_payload).encode("utf-8"),
                            headers={"Content-Type": "application/json"})
        with urlopen(req_eval2) as resp:
            self.assertEqual(resp.status, 201)

        # Verify DB has evaluations for rater in both campaigns
        conn = get_connection(TEST_DB_PATH)
        c1_count = conn.execute("SELECT COUNT(*) FROM evaluations WHERE rater_id = ? AND campaign_id = ?", (rater_id, camp1_id)).fetchone()[0]
        c2_count = conn.execute("SELECT COUNT(*) FROM evaluations WHERE rater_id = ? AND campaign_id = ?", (rater_id, camp2_id)).fetchone()[0]
        self.assertGreaterEqual(c1_count, 1)
        self.assertGreaterEqual(c2_count, 1)
        conn.close()

        # 3. Test Scoped clear (campaign_id provided)
        del_scoped_url = f"http://127.0.0.1:{TEST_PORT}/api/raters?id={rater_id}&campaign_id={camp1_id}"
        req_scoped = Request(del_scoped_url, method="DELETE", headers={"X-Admin-PIN": "2026"})
        with urlopen(req_scoped) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data.get("success"))
            self.assertEqual(data.get("scope"), "campaign")
            self.assertEqual(data.get("rater_id"), rater_id)
            self.assertEqual(data.get("campaign_id"), camp1_id)
            self.assertEqual(data.get("deleted_evaluations"), c1_count)

        # Verify rater still exists in DB, camp1 evals gone, camp2 evals remain
        conn = get_connection(TEST_DB_PATH)
        rater_exists = conn.execute("SELECT COUNT(*) FROM raters WHERE id = ?", (rater_id,)).fetchone()[0]
        self.assertEqual(rater_exists, 1)
        c1_after = conn.execute("SELECT COUNT(*) FROM evaluations WHERE rater_id = ? AND campaign_id = ?", (rater_id, camp1_id)).fetchone()[0]
        c2_after = conn.execute("SELECT COUNT(*) FROM evaluations WHERE rater_id = ? AND campaign_id = ?", (rater_id, camp2_id)).fetchone()[0]
        self.assertEqual(c1_after, 0)
        self.assertEqual(c2_after, c2_count)
        conn.close()

        # 4. Test Global delete (no campaign_id provided)
        del_global_url = f"http://127.0.0.1:{TEST_PORT}/api/raters?id={rater_id}"
        req_global = Request(del_global_url, method="DELETE", headers={"X-Admin-PIN": "2026"})
        with urlopen(req_global) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data.get("success"))
            self.assertEqual(data.get("scope"), "global")
            self.assertEqual(data.get("rater_id"), rater_id)

        # Verify rater is deleted and remaining evals are deleted via cascade
        conn = get_connection(TEST_DB_PATH)
        rater_exists_after = conn.execute("SELECT COUNT(*) FROM raters WHERE id = ?", (rater_id,)).fetchone()[0]
        self.assertEqual(rater_exists_after, 0)
        c2_global_after = conn.execute("SELECT COUNT(*) FROM evaluations WHERE rater_id = ?", (rater_id,)).fetchone()[0]
        self.assertEqual(c2_global_after, 0)
        conn.close()

        # 5. Non-existent rater delete should return 404
        req_notfound = Request(f"http://127.0.0.1:{TEST_PORT}/api/raters?id=nonexistent-id", method="DELETE", headers={"X-Admin-PIN": "2026"})
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req_notfound)
        self.assertEqual(ctx.exception.code, 404)

    def test_eval_portal_draft_reset_and_state_contracts(self):
        """Verify Task 3 contracts for eval portal draft reset, client persistence and sorting."""
        eval_html_path = os.path.join(TOOL_DIR, "public", "eval.html")
        eval_js_path = os.path.join(TOOL_DIR, "public", "js", "eval_app.js")

        with open(eval_html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        self.assertIn('id="btn-reset-item"', html_content)

        with open(eval_js_path, "r", encoding="utf-8") as f:
            js_content = f.read()
        self.assertIn("saveDraftForCurrentItem", js_content)
        self.assertIn("sortItemsForSidebar", js_content)
        self.assertIn("getVisibleSequenceIndices", js_content)
        self.assertIn("currentWordHighlights", js_content)
        # autoSaveCurrentItem is removed/no longer in code
        self.assertNotIn("autoSaveCurrentItem", js_content)


if __name__ == "__main__":

    unittest.main()
