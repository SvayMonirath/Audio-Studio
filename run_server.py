#!/usr/bin/env python3
"""
run_server.py
Zero-dependency Python HTTP server and REST API for the Speech Evaluation & Acoustic Engineering Studio.
Serves static frontend, real benchmark audio, and handles SQLite evaluations with zero mock data.
"""

import os
import sys
import json
import sqlite3
import argparse
import subprocess
import mimetypes
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

# Import database module
from database import (
    get_connection, init_db, seed_project_khmer_speech,
    save_admin, verify_admin_credentials
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
BENCHMARK_AUDIO_DIR = os.path.join(BASE_DIR, "audio")

# Configurable Admin PINs for team access
DEFAULT_ADMIN_PINS = set([p.strip() for p in os.environ.get("ADMIN_PINS", "2026,1234,veaja,cadt").split(",") if p.strip()])

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

class StudioHandler(BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Clean plain log formatting
        sys.stderr.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {format % args}\n")

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, X-Admin-PIN, Authorization")

    def is_authenticated_admin(self, provided_pin=None):
        if provided_pin:
            if provided_pin in DEFAULT_ADMIN_PINS:
                return True
            valid, _ = verify_admin_credentials(provided_pin)
            return valid

        pin_header = self.headers.get("X-Admin-PIN", "").strip()
        auth_header = self.headers.get("Authorization", "").strip()
        candidate_pins = []
        if pin_header:
            candidate_pins.append(pin_header)
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            clean_pin = token[4:] if token.startswith("pin-") else token
            candidate_pins.append(clean_pin)

        for pin in candidate_pins:
            if pin in DEFAULT_ADMIN_PINS:
                return True
            valid, _ = verify_admin_credentials(pin)
            if valid:
                return True
        return False

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Route API requests
        if path.startswith("/api/"):
            self.handle_api_get(path, query)
            return

        # Route Audio requests
        if path.startswith("/audio/"):
            self.handle_audio_file(path)
            return

        # Route Static Frontend Assets
        self.handle_static_file(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(post_body) if post_body else {}
            except Exception as e:
                self.send_json_response({"error": f"Invalid JSON payload: {str(e)}"}, status=400)
                return
            self.handle_api_post(path, payload)
            return

        self.send_error(404, "Endpoint not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/api/"):
            self.handle_api_delete(path, query)
            return

        self.send_error(404, "Endpoint not found")

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def handle_static_file(self, path):
        if path.startswith("/eval"):
            rel_path = "eval.html"
        elif path.startswith("/admin"):
            rel_path = "admin.html"
        elif path == "/" or path == "":
            rel_path = "admin.html"
        else:
            rel_path = path.lstrip("/")

        file_path = os.path.join(PUBLIC_DIR, rel_path)
        
        # Security check: disallow escaping public directory
        if not os.path.abspath(file_path).startswith(PUBLIC_DIR):
            self.send_error(403, "Forbidden")
            return

        if not os.path.exists(file_path) or os.path.isdir(file_path):
            file_path = os.path.join(PUBLIC_DIR, "admin.html")

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {str(e)}")

    def handle_audio_file(self, path):
        # /audio/sprint-2/outputs/benchmark_runs/...
        # Maps directly to BASE_DIR/<clean_path>
        prefix = "/audio/"
        if path.startswith(prefix):
            clean_path = path[len(prefix):]
        else:
            clean_path = path.lstrip("/")

        if clean_path.startswith("uploads/"):
            full_audio_path = os.path.join(PUBLIC_DIR, clean_path)
            if not os.path.abspath(full_audio_path).startswith(PUBLIC_DIR):
                self.send_error(403, "Forbidden")
                return
        elif os.path.exists(os.path.join(BASE_DIR, "audio", clean_path)):
            full_audio_path = os.path.join(BASE_DIR, "audio", clean_path)
            if not os.path.abspath(full_audio_path).startswith(BASE_DIR):
                self.send_error(403, "Forbidden")
                return
        else:
            full_audio_path = os.path.join(BASE_DIR, clean_path)
            if not os.path.abspath(full_audio_path).startswith(BASE_DIR):
                self.send_error(403, "Forbidden")
                return

        if not os.path.exists(full_audio_path) or not os.path.isfile(full_audio_path):
            self.send_error(404, f"Real audio file not found: {clean_path}")
            return

        mime_type, _ = mimetypes.guess_type(full_audio_path)
        if mime_type in ("audio/x-wav", None):
            content_type = "audio/wav"
        else:
            content_type = mime_type

        file_size = os.path.getsize(full_audio_path)
        range_header = self.headers.get("Range")

        # Range request support for smooth audio seeking in browsers
        if range_header:
            try:
                ranges = range_header.replace("bytes=", "").split("-")
                start = int(ranges[0]) if ranges[0] else 0
                end = int(ranges[1]) if ranges[1] else file_size - 1
                length = end - start + 1

                with open(full_audio_path, "rb") as f:
                    f.seek(start)
                    data = f.read(length)

                self.send_response(206)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception as e:
                pass

        # Standard full response
        try:
            with open(full_audio_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, f"Error streaming audio: {str(e)}")

    def handle_api_get(self, path, query):
        conn = get_connection()
        cur = conn.cursor()

        try:
            if path == "/api/projects":
                rows = cur.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
                projects = [dict(r) for r in rows]
                self.send_json_response({"projects": projects})
                return

            if path == "/api/campaigns":
                project_id = query.get("project_id", [None])[0]
                sql = """
                SELECT c.*, p.name as project_name, s.name as suite_name, r.name as rubric_name,
                       r.protocol_type, r.scale_min, r.scale_max, r.metrics_json,
                       (SELECT COUNT(*) FROM test_items ti WHERE ti.suite_id = c.suite_id) as items_count,
                       (SELECT COUNT(*) FROM evaluations ev WHERE ev.campaign_id = c.id) as evaluations_count,
                       (SELECT COUNT(DISTINCT rater_id) FROM evaluations ev WHERE ev.campaign_id = c.id) as raters_count
                FROM campaigns c
                JOIN projects p ON c.project_id = p.id
                JOIN test_suites s ON c.suite_id = s.id
                JOIN rubrics r ON c.rubric_id = r.id
                """
                if project_id:
                    rows = cur.execute(sql + " WHERE c.project_id = ? ORDER BY c.created_at DESC", (project_id,)).fetchall()
                else:
                    rows = cur.execute(sql + " ORDER BY c.created_at DESC").fetchall()
                
                campaigns = []
                for r in rows:
                    cd = dict(r)
                    cd["metrics"] = json.loads(cd["metrics_json"])
                    if cd.get("defect_types_json"):
                        try:
                            cd["defect_types"] = json.loads(cd["defect_types_json"])
                        except Exception:
                            cd["defect_types"] = []
                    else:
                        cd["defect_types"] = [
                            {"code": "MISPRON", "label": "Mispronunciation"},
                            {"code": "NOISE", "label": "Noise / Click"},
                            {"code": "UNNAT_PAUSE", "label": "Awkward Pause"},
                            {"code": "ROBOTIC", "label": "Robotic Buzz"},
                            {"code": "PITCH", "label": "Unnatural Pitch"},
                            {"code": "OTHER", "label": "Other Defect"}
                        ]
                    cd["collect_transcription"] = bool(cd.get("collect_transcription", 0))
                    cd["items_count"] = cd.get("items_count", 0)
                    cd["evaluations_count"] = cd.get("evaluations_count", 0)
                    cd["raters_count"] = cd.get("raters_count", 0)
                    campaigns.append(cd)
                self.send_json_response({"campaigns": campaigns})
                return

            if path == "/api/rubrics":
                project_id = query.get("project_id", [None])[0]
                sql = "SELECT * FROM rubrics"
                if project_id:
                    rows = cur.execute(sql + " WHERE project_id = ? ORDER BY created_at ASC", (project_id,)).fetchall()
                else:
                    rows = cur.execute(sql + " ORDER BY created_at ASC").fetchall()
                rubrics = []
                for r in rows:
                    rd = dict(r)
                    rd["metrics"] = json.loads(rd["metrics_json"])
                    rubrics.append(rd)
                self.send_json_response({"rubrics": rubrics})
                return

            if path == "/api/items":
                suite_id = query.get("suite_id", [None])[0]
                campaign_id = query.get("campaign_id", [None])[0]
                
                if campaign_id and not suite_id:
                    c_row = cur.execute("SELECT suite_id FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
                    if c_row:
                        suite_id = c_row["suite_id"]

                sql = "SELECT * FROM test_items"
                if suite_id:
                    rows = cur.execute(sql + " WHERE suite_id = ? ORDER BY item_key ASC", (suite_id,)).fetchall()
                else:
                    rows = cur.execute(sql + " ORDER BY item_key ASC").fetchall()

                items = []
                for r in rows:
                    item_d = dict(r)
                    if item_d.get("coverage_tags_json"):
                        item_d["coverage_tags"] = json.loads(item_d["coverage_tags_json"])
                    if item_d.get("audio_files_json"):
                        item_d["audio_files"] = json.loads(item_d["audio_files_json"])
                    items.append(item_d)
                self.send_json_response({"items": items, "count": len(items)})
                return

            if path == "/api/models":
                project_id = query.get("project_id", [None])[0]
                sql = "SELECT * FROM models"
                if project_id:
                    rows = cur.execute(sql + " WHERE project_id = ? ORDER BY candidate_code ASC", (project_id,)).fetchall()
                else:
                    rows = cur.execute(sql + " ORDER BY candidate_code ASC").fetchall()
                models = [dict(r) for r in rows]
                self.send_json_response({"models": models})
                return

            if path == "/api/taxonomies":
                project_id = query.get("project_id", [None])[0]
                sql = "SELECT * FROM taxonomies"
                if project_id:
                    rows = cur.execute(sql + " WHERE project_id = ? ORDER BY category, code", (project_id,)).fetchall()
                else:
                    rows = cur.execute(sql + " ORDER BY category, code").fetchall()
                taxonomies = [dict(r) for r in rows]
                self.send_json_response({"taxonomies": taxonomies})
                return

            if path == "/api/raters":
                rows = cur.execute("SELECT * FROM raters ORDER BY name ASC").fetchall()
                raters = [dict(r) for r in rows]
                self.send_json_response({"raters": raters})
                return

            if path == "/api/evaluations":
                campaign_id = query.get("campaign_id", [None])[0]
                rater_id = query.get("rater_id", [None])[0]
                item_id = query.get("item_id", [None])[0]

                clauses = []
                params = []
                if campaign_id:
                    clauses.append("e.campaign_id = ?")
                    params.append(campaign_id)
                if rater_id:
                    clauses.append("e.rater_id = ?")
                    params.append(rater_id)
                if item_id:
                    clauses.append("e.item_id = ?")
                    params.append(item_id)

                where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
                sql = f"""
                SELECT e.*, r.name as rater_name, m.name as model_name, m.repo_id,
                       i.item_key, i.text as item_text
                FROM evaluations e
                JOIN raters r ON e.rater_id = r.id
                JOIN models m ON e.model_id = m.id
                JOIN test_items i ON e.item_id = i.id
                {where_sql}
                ORDER BY e.created_at DESC
                """
                rows = cur.execute(sql, params).fetchall()
                evaluations = []
                for r in rows:
                    ed = dict(r)
                    ed["scores"] = json.loads(ed["scores_json"])
                    
                    # Fetch defect tags
                    tag_rows = cur.execute("""
                    SELECT * FROM defect_tags WHERE evaluation_id = ? ORDER BY word_index ASC
                    """, (ed["id"],)).fetchall()
                    ed["defect_tags"] = [dict(tr) for tr in tag_rows]
                    evaluations.append(ed)

                self.send_json_response({"evaluations": evaluations, "count": len(evaluations)})
                return

            if path == "/api/admin/summary":
                if not self.is_authenticated_admin():
                    self.send_json_response({"error": "Admin authentication required. Please provide X-Admin-PIN header."}, status=401)
                    return
                # Compute statistical aggregates across real evaluations
                campaign_id = query.get("campaign_id", [None])[0]
                where_clause = "WHERE e.campaign_id = ?" if campaign_id else ""
                params = [campaign_id] if campaign_id else []

                # Total counts
                total_evals = cur.execute(f"SELECT count(*) FROM evaluations e {where_clause}", params).fetchone()[0]
                total_raters = cur.execute(f"SELECT count(DISTINCT e.rater_id) FROM evaluations e {where_clause}", params).fetchone()[0]

                # Per-model scoring aggregates
                sql_evals = f"""
                SELECT e.model_id, m.name as model_name, m.candidate_code, e.scores_json
                FROM evaluations e
                JOIN models m ON e.model_id = m.id
                {where_clause}
                """
                eval_rows = cur.execute(sql_evals, params).fetchall()

                model_stats = {}
                for row in eval_rows:
                    mid = row["model_id"]
                    if mid not in model_stats:
                        model_stats[mid] = {
                            "model_id": mid,
                            "name": row["model_name"],
                            "code": row["candidate_code"],
                            "eval_count": 0,
                            "metrics": {}
                        }
                    model_stats[mid]["eval_count"] += 1
                    try:
                        scores = json.loads(row["scores_json"])
                        for m_key, m_val in scores.items():
                            if isinstance(m_val, (int, float)):
                                if m_key not in model_stats[mid]["metrics"]:
                                    model_stats[mid]["metrics"][m_key] = []
                                model_stats[mid]["metrics"][m_key].append(m_val)
                    except Exception:
                        pass

                # Calculate Mean, Standard Deviation, and 95% Confidence Intervals
                import math
                for mid, mdata in model_stats.items():
                    mdata["summary"] = {}
                    for m_key, values in mdata["metrics"].items():
                        n = len(values)
                        if n > 0:
                            mean_val = sum(values) / n
                            variance = sum((x - mean_val) ** 2 for x in values) / n if n > 1 else 0.0
                            std_dev = math.sqrt(variance)
                            margin_of_error = 1.96 * (std_dev / math.sqrt(n)) if n > 1 else 0.0
                            mdata["summary"][m_key] = {
                                "n": n,
                                "mean": round(mean_val, 2),
                                "std_dev": round(std_dev, 2),
                                "ci_lower": round(max(1.0, mean_val - margin_of_error), 2),
                                "ci_upper": round(min(5.0, mean_val + margin_of_error), 2)
                            }

                # Defect tag frequency breakdown
                sql_defects = f"""
                SELECT dt.error_code, t.name_en, t.name_km, t.badge_color, m.name as model_name, count(*) as count
                FROM defect_tags dt
                JOIN evaluations e ON dt.evaluation_id = e.id
                JOIN models m ON e.model_id = m.id
                LEFT JOIN taxonomies t ON dt.error_code = t.code
                {where_clause}
                GROUP BY dt.error_code, e.model_id
                ORDER BY count DESC
                """
                defect_rows = cur.execute(sql_defects, params).fetchall()
                defects_summary = [dict(dr) for dr in defect_rows]

                # Word-level defect heatmap (frequently failing words)
                sql_words = f"""
                SELECT dt.word_text, dt.error_code, m.name as model_name, count(*) as count
                FROM defect_tags dt
                JOIN evaluations e ON dt.evaluation_id = e.id
                JOIN models m ON e.model_id = m.id
                {where_clause}
                GROUP BY dt.word_text, dt.error_code, e.model_id
                ORDER BY count DESC
                LIMIT 20
                """
                word_rows = cur.execute(sql_words, params).fetchall()
                word_defect_heatmap = [dict(wr) for wr in word_rows]

                # Perceived transcription discrepancies ("What raters heard")
                trans_where = f"{where_clause} AND e.blind_transcript IS NOT NULL AND trim(e.blind_transcript) != ''" if where_clause else "WHERE e.blind_transcript IS NOT NULL AND trim(e.blind_transcript) != ''"
                sql_transcripts = f"""
                SELECT e.blind_transcript, e.comments, e.created_at, r.name as rater_name, m.name as model_name,
                       i.item_key, i.text as expected_text
                FROM evaluations e
                JOIN raters r ON e.rater_id = r.id
                JOIN models m ON e.model_id = m.id
                JOIN test_items i ON e.item_id = i.id
                {trans_where}
                ORDER BY e.created_at DESC
                LIMIT 50
                """
                trans_rows = cur.execute(sql_transcripts, params).fetchall()
                transcriptions_summary = [dict(tr) for tr in trans_rows]

                # ASR evaluation adjudication breakdown
                asr_where = f"{where_clause} AND e.asr_adjudication IS NOT NULL" if where_clause else "WHERE e.asr_adjudication IS NOT NULL"
                sql_asr = f"""
                SELECT e.asr_adjudication, count(*) as count
                FROM evaluations e
                {asr_where}
                GROUP BY e.asr_adjudication
                """
                asr_rows = cur.execute(sql_asr, params).fetchall()
                total_asr = sum(r["count"] for r in asr_rows)
                acc_count = sum(r["count"] for r in asr_rows if r["asr_adjudication"] == "ACCEPTABLE_VARIATION")
                err_count = sum(r["count"] for r in asr_rows if r["asr_adjudication"] == "CRITICAL_ERROR")
                asr_summary = {
                    "total_judgments": total_asr,
                    "acceptable_variations": acc_count,
                    "critical_errors": err_count,
                    "acceptable_rate": round((acc_count / total_asr * 100), 2) if total_asr > 0 else 0.0,
                    "breakdown": {r["asr_adjudication"]: r["count"] for r in asr_rows}
                }

                self.send_json_response({
                    "total_evaluations": total_evals,
                    "total_raters": total_raters,
                    "model_statistics": list(model_stats.values()),
                    "defects_summary": defects_summary,
                    "word_defect_heatmap": word_defect_heatmap,
                    "transcriptions_summary": transcriptions_summary,
                    "asr_summary": asr_summary
                })
                return

            if path == "/api/admin/export.csv":
                if not self.is_authenticated_admin():
                    self.send_json_response({"error": "Admin authentication required. Please provide X-Admin-PIN header."}, status=401)
                    return
                # Export clean CSV matching scoring_sheet_v2.csv format
                sql = """
                SELECT e.id as trial_id, i.item_key as item_id, i.category as category_name,
                       i.text as khmer_text, i.target_ipa_standard, i.target_ipa_colloquial,
                       m.repo_id as model_id, r.name as evaluator_id, e.scores_json,
                       e.blind_transcript, e.comments, e.created_at
                FROM evaluations e
                JOIN test_items i ON e.item_id = i.id
                JOIN models m ON e.model_id = m.id
                JOIN raters r ON e.rater_id = r.id
                ORDER BY i.item_key ASC, e.created_at ASC
                """
                rows = cur.execute(sql).fetchall()

                import csv
                import io
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow([
                    "trial_id", "item_id", "category_name", "khmer_text",
                    "target_ipa_standard", "target_ipa_colloquial", "model_id",
                    "evaluator_id", "scores_json", "blind_transcript", "comments", "created_at"
                ])
                for row in rows:
                    writer.writerow([
                        row["trial_id"], row["item_id"], row["category_name"], row["khmer_text"],
                        row["target_ipa_standard"] or "", row["target_ipa_colloquial"] or "",
                        row["model_id"], row["evaluator_id"], row["scores_json"],
                        row["blind_transcript"] or "", row["comments"] or "", row["created_at"]
                    ])

                csv_data = output.getvalue().encode("utf-8-sig")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", "attachment; filename=\"veaja_tts_evaluations.csv\"")
                self.send_header("Content-Length", str(len(csv_data)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(csv_data)
                return

            self.send_error(404, "API endpoint not found")

        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)
        finally:
            conn.close()

    def handle_api_delete(self, path, query):
        if not self.is_authenticated_admin():
            self.send_json_response({"error": "Admin authentication required. Please provide X-Admin-PIN header."}, status=401)
            return

        conn = get_connection()
        cur = conn.cursor()

        try:
            if path == "/api/campaigns":
                c_id = query.get("id", [None])[0] or query.get("campaign_id", [None])[0]
                if not c_id:
                    self.send_json_response({"error": "id parameter required."}, status=400)
                    return

                # Fetch campaign to check suite_id
                c_row = cur.execute("SELECT suite_id FROM campaigns WHERE id = ?", (c_id,)).fetchone()
                if not c_row:
                    self.send_json_response({"error": "Campaign not found."}, status=404)
                    return

                suite_id = c_row["suite_id"]

                # Delete campaign (foreign keys cascade to evaluations and defect tags)
                cur.execute("DELETE FROM campaigns WHERE id = ?", (c_id,))

                # If this suite is only used by this campaign, delete suite and test items
                other = cur.execute("SELECT COUNT(*) as cnt FROM campaigns WHERE suite_id = ?", (suite_id,)).fetchone()
                if other and other["cnt"] == 0 and suite_id not in ("suite-dev23", "suite-vocab200"):
                    cur.execute("DELETE FROM test_suites WHERE id = ?", (suite_id,))

                conn.commit()
                self.send_json_response({"success": True, "deleted_campaign_id": c_id})
                return

            if path == "/api/evaluations":
                e_id = query.get("id", [None])[0]
                if not e_id:
                    self.send_json_response({"error": "id parameter required."}, status=400)
                    return
                cur.execute("DELETE FROM evaluations WHERE id = ?", (e_id,))
                conn.commit()
                self.send_json_response({"success": True, "deleted_evaluation_id": e_id})
                return

            self.send_error(404, "Delete endpoint not found")

        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)
        finally:
            conn.close()

    def handle_api_post(self, path, payload):
        conn = get_connection()
        cur = conn.cursor()

        try:
            if path == "/api/admin/login":
                pin = str(payload.get("pin", "")).strip()
                username = str(payload.get("username", "")).strip() or None
                if pin in DEFAULT_ADMIN_PINS:
                    self.send_json_response({"success": True, "token": f"pin-{pin}", "admin": True, "username": username or "admin"})
                    return
                valid, admin_row = verify_admin_credentials(pin, username)
                if valid:
                    self.send_json_response({"success": True, "token": f"pin-{pin}", "admin": True, "username": admin_row.get("username", "admin")})
                    return
                self.send_json_response({"success": False, "error": "Invalid Admin PIN. Please check and try again."}, status=401)
                return

            if path == "/api/admin/register":
                username = str(payload.get("username", "admin")).strip() or "admin"
                new_pin = str(payload.get("pin", "")).strip()
                current_pin = str(payload.get("current_pin", "")).strip()

                if not new_pin or not new_pin.isdigit() or len(new_pin) not in (4, 6):
                    self.send_json_response({"error": "PIN must be exactly 4 or 6 numeric digits."}, status=400)
                    return

                # If admins already exist or default PINs exist, require current_pin authorization
                existing_admins = cur.execute("SELECT COUNT(*) as cnt FROM admins").fetchone()["cnt"]
                if existing_admins > 0 or len(DEFAULT_ADMIN_PINS) > 0:
                    auth_ok = self.is_authenticated_admin() or (current_pin in DEFAULT_ADMIN_PINS)
                    if not auth_ok and current_pin:
                        valid, _ = verify_admin_credentials(current_pin)
                        auth_ok = valid
                    if not auth_ok:
                        self.send_json_response({"error": "Current admin PIN is required to create or change PIN."}, status=401)
                        return

                saved = save_admin(username=username, pin=new_pin)
                self.send_json_response({"success": True, "admin": saved, "token": f"pin-{new_pin}", "message": "Admin PIN successfully updated."})
                return

            admin_endpoints = {
                "/api/campaigns", "/api/campaigns/status", "/api/models",
                "/api/suites", "/api/rubrics", "/api/upload-audio",
                "/api/upload-batch", "/api/seed/capstone", "/api/projects"
            }
            if path in admin_endpoints:
                if not self.is_authenticated_admin():
                    self.send_json_response({"error": "Admin authentication required. Please provide X-Admin-PIN header."}, status=401)
                    return

            if path == "/api/campaigns/status":
                c_id = payload.get("campaign_id") or payload.get("id")
                is_active = payload.get("is_active")
                if not c_id or is_active is None:
                    self.send_json_response({"error": "campaign_id and is_active required."}, status=400)
                    return
                cur.execute("UPDATE campaigns SET is_active = ? WHERE id = ?", (1 if is_active else 0, c_id))
                conn.commit()
                self.send_json_response({"success": True, "campaign_id": c_id, "is_active": 1 if is_active else 0})
                return
            if path == "/api/models":
                p_id = payload.get("project_id", "proj-veaja-khmer")
                name = payload.get("name", "").strip()
                code = payload.get("candidate_code", "CUSTOM").strip()
                repo = payload.get("repo_id", name.lower().replace(" ", "-")).strip()
                license_val = payload.get("license", "Custom")
                hardware = payload.get("hardware_target", "Local GPU")
                sr = int(payload.get("sample_rate_hz", 24000))
                audio_dir = payload.get("audio_base_dir", "").strip()

                if not name:
                    self.send_json_response({"error": "Model name is required."}, status=400)
                    return

                m_id = f"model-{int(datetime.now().timestamp() * 1000)}"
                cur.execute("""
                INSERT INTO models (id, project_id, candidate_code, name, repo_id, license, hardware_target, sample_rate_hz, audio_base_dir)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (m_id, p_id, code, name, repo, license_val, hardware, sr, audio_dir))
                conn.commit()
                self.send_json_response({"success": True, "model_id": m_id, "repo_id": repo}, status=201)
                return

            if path == "/api/campaigns":
                p_id = payload.get("project_id", "proj-veaja-khmer")
                name = payload.get("name", "").strip()
                suite_id = payload.get("suite_id", "suite-dev23")
                rubric_id = payload.get("rubric_id", "rubric-pairwise")
                instructions = payload.get("instructions", "Please listen to each audio carefully and rate the naturalness and intelligibility.").strip()
                defect_types = payload.get("defect_types") or payload.get("defect_types_json")
                if isinstance(defect_types, list):
                    defect_types_json = json.dumps(defect_types)
                elif isinstance(defect_types, str):
                    defect_types_json = defect_types
                else:
                    defect_types_json = None
                collect_transcription = 1 if payload.get("collect_transcription") else 0

                if not name:
                    self.send_json_response({"error": "Campaign name is required."}, status=400)
                    return
                c_id = f"camp-{int(datetime.now().timestamp() * 1000)}"
                modality = str(payload.get("modality", "TTS")).strip().upper()
                if modality not in ("TTS", "ASR"):
                    modality = "TTS"
                cur.execute("""
                INSERT INTO campaigns (id, project_id, name, suite_id, rubric_id, instructions, defect_types_json, collect_transcription, modality, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (c_id, p_id, name, suite_id, rubric_id, instructions, defect_types_json, collect_transcription, modality))
                conn.commit()
                self.send_json_response({"success": True, "campaign_id": c_id}, status=201)
                return

            if path == "/api/suites":
                p_id = payload.get("project_id", "proj-veaja-khmer")
                name = payload.get("name", "").strip()
                desc = payload.get("description", "").strip()
                raw_items = payload.get("items", []) # list of strings or dicts

                if not name or not raw_items:
                    self.send_json_response({"error": "Suite name and at least one item are required."}, status=400)
                    return

                suite_id = payload.get("id") or f"suite-{int(datetime.now().timestamp() * 1000)}"
                cur.execute("INSERT INTO test_suites (id, project_id, name, description) VALUES (?, ?, ?, ?)", (suite_id, p_id, name, desc))

                for i, itm in enumerate(raw_items):
                    item_id = f"item-{suite_id}-{i+1:03d}"
                    key = itm.get("item_key", f"ITEM-{i+1:02d}") if isinstance(itm, dict) else f"ITEM-{i+1:02d}"
                    if isinstance(itm, dict):
                        text = itm.get("text", "")
                        source_text = itm.get("source_text", text)
                        category = itm.get("category", "Custom")
                        ref_trans = itm.get("reference_transcript", "")
                        hyp_trans = itm.get("hypothesis_transcript", "")
                        audio_url = itm.get("audio_url", "")
                        if itm.get("audio_files_json"):
                            audio_files = itm["audio_files_json"] if isinstance(itm["audio_files_json"], str) else json.dumps(itm["audio_files_json"])
                        elif itm.get("audio_url"):
                            audio_files = json.dumps({
                                "audio_sample": {
                                    "model_name": "Audio Sample",
                                    "model_id": "audio-sample",
                                    "url": itm.get("audio_url")
                                }
                            })
                        else:
                            audio_files = json.dumps(itm.get("audio_files", {}))
                    else:
                        text = str(itm).strip()
                        source_text = text
                        category = "Custom"
                        ref_trans = ""
                        hyp_trans = ""
                        audio_url = ""
                        audio_files = "{}"

                    if text or ref_trans or audio_url:
                        cur.execute("""
                        INSERT INTO test_items (id, suite_id, item_key, text, source_text, category, audio_files_json, reference_transcript, hypothesis_transcript, audio_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (item_id, suite_id, key, text or ref_trans, source_text, category, audio_files, ref_trans, hyp_trans, audio_url))

                conn.commit()
                self.send_json_response({"success": True, "suite_id": suite_id, "items_count": len(raw_items)}, status=201)
                return

            if path == "/api/rubrics":
                p_id = payload.get("project_id", "proj-veaja-khmer")
                name = payload.get("name", "").strip()
                protocol = payload.get("protocol_type", "Custom").strip()
                scale_min = int(payload.get("scale_min", 1))
                scale_max = int(payload.get("scale_max", 5))
                metrics = payload.get("metrics", [])
                if not name:
                    self.send_json_response({"error": "Rubric name is required."}, status=400)
                    return
                r_id = f"rubric-{int(datetime.now().timestamp() * 1000)}"
                cur.execute("""
                INSERT INTO rubrics (id, project_id, name, protocol_type, scale_min, scale_max, metrics_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (r_id, p_id, name, protocol, scale_min, scale_max, json.dumps(metrics)))
                conn.commit()
                self.send_json_response({"success": True, "rubric_id": r_id}, status=201)
                return

            if path == "/api/upload-audio":
                filename = payload.get("filename", "audio.wav")
                data_base64 = payload.get("data_base64") or payload.get("file_data") or payload.get("base64") or ""
                if not data_base64:
                    self.send_json_response({"error": "Missing audio base64 data."}, status=400)
                    return
                safe_name = os.path.basename(filename).replace(" ", "_")
                import time, base64
                unique_name = f"{int(time.time() * 1000)}_{safe_name}"
                uploads_dir = os.path.join(PUBLIC_DIR, "uploads")
                os.makedirs(uploads_dir, exist_ok=True)
                dest_path = os.path.join(uploads_dir, unique_name)
                raw_bytes = base64.b64decode(data_base64)
                with open(dest_path, "wb") as f:
                    f.write(raw_bytes)
                url = f"/audio/uploads/{unique_name}"
                self.send_json_response({
                    "success": True,
                    "url": url,
                    "filename": unique_name,
                    "size_bytes": len(raw_bytes)
                }, status=201)
                return

            if path == "/api/upload-batch":
                files_payload = payload.get("files", [])
                if not files_payload or not isinstance(files_payload, list):
                    self.send_json_response({"error": "files array required."}, status=400)
                    return

                import time, base64
                uploads_dir = os.path.join(PUBLIC_DIR, "uploads")
                os.makedirs(uploads_dir, exist_ok=True)

                saved_items = []
                for idx, f_item in enumerate(files_payload):
                    filename = f_item.get("filename", f"audio_{idx+1}.wav")
                    data_base64 = f_item.get("data_base64") or f_item.get("file_data") or f_item.get("base64") or ""
                    text = f_item.get("text", "").strip()
                    if not data_base64:
                        continue

                    safe_name = os.path.basename(filename).replace(" ", "_")
                    unique_name = f"{int(time.time() * 1000)}_{idx}_{safe_name}"
                    dest_path = os.path.join(uploads_dir, unique_name)
                    raw_bytes = base64.b64decode(data_base64)
                    with open(dest_path, "wb") as f:
                        f.write(raw_bytes)

                    url = f"/audio/uploads/{unique_name}"
                    saved_items.append({
                        "filename": filename,
                        "unique_name": unique_name,
                        "url": url,
                        "text": text,
                        "size_bytes": len(raw_bytes)
                    })

                self.send_json_response({
                    "success": True,
                    "uploaded_count": len(saved_items),
                    "items": saved_items
                }, status=201)
                return

            if path == "/api/seed/capstone":
                seed_project_khmer_speech()
                self.send_json_response({"success": True, "message": "Capstone benchmark DEV-23 and VOCAB-200 loaded."}, status=200)
                return

            if path == "/api/projects":
                p_name = payload.get("name", "").strip()
                p_lang = payload.get("language", "").strip()
                p_desc = payload.get("description", "").strip()
                if not p_name or not p_lang:
                    self.send_json_response({"error": "Project name and language are required."}, status=400)
                    return
                p_id = f"proj-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
                cur.execute("""
                INSERT INTO projects (id, name, language, description)
                VALUES (?, ?, ?, ?)
                """, (p_id, p_name, p_lang, p_desc))
                conn.commit()
                self.send_json_response({"success": True, "project_id": p_id}, status=201)
                return

            if path == "/api/raters":
                name = payload.get("name", "").strip()
                role = payload.get("role", "Evaluator").strip()

                if not name:
                    self.send_json_response({"error": "Rater name is required."}, status=400)
                    return
                
                # Check existing rater
                existing = cur.execute("SELECT * FROM raters WHERE lower(name) = lower(?)", (name,)).fetchone()
                if existing:
                    self.send_json_response({"success": True, "rater": dict(existing)}, status=200)
                    return
                
                r_id = f"rater-{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
                cur.execute("INSERT INTO raters (id, name, role) VALUES (?, ?, ?)", (r_id, name, role))
                conn.commit()
                new_rater = dict(cur.execute("SELECT * FROM raters WHERE id = ?", (r_id,)).fetchone())
                self.send_json_response({"success": True, "rater": new_rater}, status=201)
                return

            if path == "/api/evaluations":
                campaign_id = payload.get("campaign_id")
                rater_id = payload.get("rater_id")
                item_id = payload.get("item_id")
                model_id = payload.get("model_id")
                scores = payload.get("scores", {})
                blind_transcript = payload.get("blind_transcript", "")
                comments = payload.get("comments", "")
                duration_seconds = payload.get("duration_seconds", 0.0)
                defect_tags = payload.get("defect_tags", [])
                asr_adjudication = payload.get("asr_adjudication")

                if not all([campaign_id, rater_id, item_id, model_id]):
                    self.send_json_response({"error": "campaign_id, rater_id, item_id, and model_id are required."}, status=400)
                    return

                # Ensure rater and model exist to satisfy foreign key constraints
                r_check = cur.execute("SELECT id FROM raters WHERE id = ?", (rater_id,)).fetchone()
                if not r_check:
                    existing_by_name = cur.execute("SELECT id FROM raters WHERE name = ?", (rater_id,)).fetchone()
                    if existing_by_name:
                        rater_id = existing_by_name["id"]
                    else:
                        cur.execute("INSERT OR IGNORE INTO raters (id, name, role) VALUES (?, ?, 'Evaluator')", (rater_id, rater_id))

                m_check = cur.execute("SELECT id FROM models WHERE id = ?", (model_id,)).fetchone()
                if not m_check:
                    c_row = cur.execute("SELECT project_id FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
                    proj_id = c_row["project_id"] if c_row else "proj-veaja-khmer"
                    cur.execute("""
                    INSERT OR IGNORE INTO models (id, project_id, candidate_code, name, repo_id, hardware_target)
                    VALUES (?, ?, ?, ?, ?, 'Audio')
                    """, (model_id, proj_id, model_id[:8], "Audio Sample", model_id))

                eval_id = f"eval-{int(datetime.now().timestamp() * 1000)}"
                scores_json = json.dumps(scores)

                # Upsert evaluation record
                cur.execute("""
                INSERT INTO evaluations (
                    id, campaign_id, rater_id, item_id, model_id,
                    scores_json, blind_transcript, comments, duration_seconds, asr_adjudication
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign_id, rater_id, item_id, model_id) DO UPDATE SET
                    scores_json = excluded.scores_json,
                    blind_transcript = excluded.blind_transcript,
                    comments = excluded.comments,
                    duration_seconds = excluded.duration_seconds,
                    asr_adjudication = excluded.asr_adjudication,
                    created_at = CURRENT_TIMESTAMP
                """, (
                    eval_id, campaign_id, rater_id, item_id, model_id,
                    scores_json, blind_transcript, comments, duration_seconds, asr_adjudication
                ))

                # If updated, fetch existing eval_id
                actual_eval_id = cur.execute("""
                SELECT id FROM evaluations
                WHERE campaign_id = ? AND rater_id = ? AND item_id = ? AND model_id = ?
                """, (campaign_id, rater_id, item_id, model_id)).fetchone()["id"]

                # Remove prior defect tags for this evaluation if re-scoring
                cur.execute("DELETE FROM defect_tags WHERE evaluation_id = ?", (actual_eval_id,))

                # Insert new defect tags
                for tag in defect_tags:
                    tag_id = f"dt-{int(datetime.now().timestamp() * 1000)}-{tag.get('word_index', 0)}"
                    cur.execute("""
                    INSERT INTO defect_tags (
                        id, evaluation_id, word_index, word_text, error_code,
                        note, time_start_ms, time_end_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        tag_id,
                        actual_eval_id,
                        tag.get("word_index", 0),
                        tag.get("word_text", ""),
                        tag.get("error_code", "NONE"),
                        tag.get("note", ""),
                        tag.get("time_start_ms", 0.0),
                        tag.get("time_end_ms", 0.0)
                    ))

                conn.commit()
                self.send_json_response({"success": True, "evaluation_id": actual_eval_id}, status=201)
                return

            self.send_error(404, "API endpoint not found")

        except Exception as e:
            sys.stderr.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] API error on {path}: {e}\n")
            conn.rollback()
            self.send_json_response({"error": str(e)}, status=500)
        finally:
            conn.close()

def start_server(port=8080, share=False):
    # Ensure database is seeded
    seed_project_khmer_speech()

    server_address = ("", port)
    httpd = ReusableHTTPServer(server_address, StudioHandler)
    local_url = f"http://localhost:{port}"

    print(f"===============================================================")
    print(f"Speech Evaluation & Acoustic Engineering Studio")
    print(f"Local Studio:   {local_url}")
    print(f"Public Assets:  {PUBLIC_DIR}")
    print(f"Audio Source:   {BENCHMARK_AUDIO_DIR}")
    print(f"===============================================================")

    tunnel_proc = None
    if share:
        try:
            print("Starting Cloudflare tunnel for external zero-login distribution...")
            tunnel_proc = subprocess.Popen(
                ["cloudflared", "tunnel", "--url", local_url],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            # Find and display the public HTTPS link from stderr
            import re
            public_url = None
            for _ in range(30):
                line = tunnel_proc.stderr.readline()
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
                if match:
                    public_url = match.group(0)
                    break
            if public_url:
                print("=" * 65)
                print(f"PUBLIC SHAREABLE LINK: {public_url}/eval")
                print("=" * 65)
            else:
                print("Cloudflare tunnel active. Check console for tunnel logs.")
        except FileNotFoundError:
            print("Notice: 'cloudflared' command not found in PATH.")
            print("Install via: brew install cloudflared")
            print("Proceeding in local-only mode.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Studio server...")
        if tunnel_proc:
            tunnel_proc.terminate()
        httpd.server_close()
        print("Studio server stopped.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Speech Evaluation & Acoustic Engineering Studio Server")
    parser.add_argument("--port", type=int, default=8080, help="Local port (default: 8080)")
    parser.add_argument("--share", action="store_true", help="Launch Cloudflare tunnel for remote testing")
    args = parser.parse_args()

    start_server(port=args.port, share=args.share)
