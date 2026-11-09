#!/usr/bin/env python3
"""
test_server.py
Automated end-to-end unit and integration tests for the TTS Evaluation & Acoustic Studio backend.
Tests database integrity, REST API endpoints, real audio streaming, and admin summaries.
"""

import os
import sys
import json
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
            self.assertTrue(lines[0].startswith("trial_id,item_id,category_name"))

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

if __name__ == "__main__":
    unittest.main()
