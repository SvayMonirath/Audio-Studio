# Evaluation Audit Log & Waveform Defect Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Audio Studio Results & Scores view into an interactive Evaluation Audit Studio featuring a Top Raters activity card, a searchable and sortable submissions audit log, 1-click test submission deletion, and an expandable waveform inspector rendering highlighted defect regions with isolated slice playback.

**Architecture:** A lightweight client-server architecture using Python standard library SQLite and HTTP server endpoints feeding a high-performance vanilla ES6+ reactive dashboard. Audio waveforms and millisecond-accurate defect regions render onto HTML5 Canvas via Web Audio API peaks caching and native slice decoding.

**Tech Stack:** Pure Python 3.10+ standard library (`http.server`, `sqlite3`, `json`, `unittest`), Vanilla ES6+ JavaScript, Web Audio API, HTML5 Canvas, Tailwind CSS.

**Spec:** [EVALUATION_AUDIT_LOG_PLAN.md](file:///Users/sorpheatepy/.gemini/antigravity-cli/brain/0c6e8aad-5480-4fcb-84f9-7552f02f5dc5/EVALUATION_AUDIT_LOG_PLAN.md)

## Global Constraints

- Backend must run entirely on Python's built-in standard library with zero external dependencies.
- SQLite foreign keys must remain strictly enforced (`PRAGMA foreign_keys = ON;`).
- All queries must be parameterized (`?`) to prevent SQL injection.
- UI styling must strictly maintain anti-slop neutral aesthetic with zero colored glowing shadows and zero overshooting animations.
- Deleting an evaluation must cascade cleanly to remove associated `defect_tags` records without leaving orphan rows.
- Audio playback must support both isolated defect time intervals (`playSlice(startSec, endSec)`) and continuous playback with animated cursor tracking.

## Review Focus

- **Cascade Deletion Integrity**: When an evaluation is deleted via `DELETE /api/evaluations?id=<id>`, linked rows in `defect_tags` must be deleted in the same transaction.
- **Empty / Clean Submissions**: Evaluations with zero defect tags must render cleanly in the audit log without canvas errors or broken badges.
- **Multi-Filter State Combinations**: Combining search text, rater filter, model filter, and defect state (e.g., search="ផ្ទះ" + rater="Sophea" + defect="With Defects") must correctly intersect without dropping records.
- **Waveform Canvas Re-use**: Expanding multiple rows sequentially must not leak Web Audio context nodes or cause canvas redraw collisions.
- **Audio File URL Resolution**: Submissions referencing multi-model JSON or flat audio URLs must resolve cleanly to `/audio/...` endpoints for inline audio playback.

---

### Task 1: Backend API Contracts & Defect Cascade Deletion

**Files:**
- Modify: `run_server.py:388-415` (Add `i.audio_files_json` to `SELECT` query)
- Modify: `run_server.py:691-702` (Implement cascade deletion of `defect_tags` on `DELETE /api/evaluations`)
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `GET /api/evaluations?campaign_id=<id>`, `DELETE /api/evaluations?id=<id>`
- Produces: Evaluation records containing `audio_files_json`, clean cascade deletion response `{ "success": True, "deleted_evaluation_id": id }`

- [ ] **Step 1: Write failing test in `tests/test_server.py`**

```python
def test_evaluation_api_audio_files_and_cascade_delete(self):
    """Verify GET /api/evaluations returns audio_files_json and DELETE cascades defect_tags."""
    # 1. Register rater and submit evaluation with defect tag
    r_resp = self.fetch("/api/raters", method="POST", data={"name": "Cascade Auditor"})
    rater_id = json.loads(r_resp.read().decode())["rater"]["id"]
    
    eval_payload = {
        "campaign_id": "camp-dev23-4models",
        "rater_id": rater_id,
        "item_id": "item-001",
        "model_id": "model-mms",
        "scores": {"pronunciation": 4},
        "defect_tags": [{
            "word_index": 0,
            "word_text": "សាកល្បង",
            "error_code": "SUB_FAIL",
            "time_start_ms": 250,
            "time_end_ms": 650,
            "note": "Test defect"
        }]
    }
    sub_resp = self.fetch("/api/evaluations", method="POST", data=eval_payload)
    self.assertEqual(sub_resp.status, 201)

    # 2. Verify GET returns audio_files_json
    get_resp = self.fetch(f"/api/evaluations?campaign_id=camp-dev23-4models&rater_id={rater_id}")
    data = json.loads(get_resp.read().decode())
    evals = data.get("evaluations", [])
    self.assertTrue(len(evals) > 0)
    target_eval = evals[0]
    self.assertIn("audio_files_json", target_eval)
    self.assertTrue(len(target_eval["defect_tags"]) > 0)
    eval_id = target_eval["id"]

    # 3. Test DELETE cascade
    del_resp = self.fetch(f"/api/evaluations?id={eval_id}", method="DELETE")
    self.assertEqual(del_resp.status, 200)

    # 4. Verify evaluation and defect_tags are gone from DB
    import sqlite3
    conn = sqlite3.connect("workbench.db")
    cur = conn.cursor()
    e_count = cur.execute("SELECT COUNT(*) FROM evaluations WHERE id = ?", (eval_id,)).fetchone()[0]
    dt_count = cur.execute("SELECT COUNT(*) FROM defect_tags WHERE evaluation_id = ?", (eval_id,)).fetchone()[0]
    conn.close()
    self.assertEqual(e_count, 0)
    self.assertEqual(dt_count, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_server.py -k test_evaluation_api_audio_files_and_cascade_delete -v`
Expected: FAIL (`audio_files_json` missing or `dt_count > 0` before cascade implementation)

- [ ] **Step 3: Implement minimal backend changes in `run_server.py`**

In `run_server.py:390`, include `i.audio_files_json` in the `SELECT` query:
```python
SELECT e.*, r.name as rater_name, m.name as model_name, m.repo_id,
       i.item_key, i.text as item_text, i.audio_files_json
FROM evaluations e
JOIN raters r ON e.rater_id = r.id
JOIN models m ON e.model_id = m.id
JOIN test_items i ON e.item_id = i.id
{where_sql}
ORDER BY e.created_at DESC
```

In `run_server.py:692`, cascade delete `defect_tags`:
```python
if path == "/api/evaluations":
    e_id = query.get("id", [None])[0]
    if not e_id:
        self.send_json_response({"error": "id parameter required."}, status=400)
        return
    cur.execute("DELETE FROM defect_tags WHERE evaluation_id = ?", (e_id,))
    cur.execute("DELETE FROM evaluations WHERE id = ?", (e_id,))
    conn.commit()
    self.send_json_response({"success": True, "deleted_evaluation_id": e_id})
    return
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_server.py -k test_evaluation_api_audio_files_and_cascade_delete -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add run_server.py tests/test_server.py
git commit -m "feat(api): include audio_files_json in evaluations query and cascade delete defect tags"
```

---

### Task 2: Admin HTML Blueprint for Audit Studio & Top Raters

**Files:**
- Modify: `public/admin.html:926-1027` (Insert Top Raters Activity Card, Filter Toolbar, and Audit Log Table into `#view-results`)
- Test: `tests/test_server.py` (Structure assertion)

**Interfaces:**
- Consumes: Static DOM elements in `#view-results`
- Produces: Element IDs `#analytics-raters-card`, `#audit-search-input`, `#audit-filter-rater`, `#audit-filter-model`, `#audit-filter-defect`, `#audit-sort-select`, `#audit-count-badge`, `#analytics-audit-tbody`

- [ ] **Step 1: Write structural test in `tests/test_server.py`**

```python
def test_admin_html_audit_studio_structure(self):
    """Verify admin.html contains the Audit Studio elements and Top Raters card."""
    with open("public/admin.html", "r", encoding="utf-8") as f:
        html = f.read()
    self.assertIn('id="analytics-raters-card"', html)
    self.assertIn('id="audit-search-input"', html)
    self.assertIn('id="audit-filter-rater"', html)
    self.assertIn('id="audit-filter-model"', html)
    self.assertIn('id="audit-filter-defect"', html)
    self.assertIn('id="audit-sort-select"', html)
    self.assertIn('id="analytics-audit-tbody"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_server.py -k test_admin_html_audit_studio_structure -v`
Expected: FAIL with `AssertionError: 'id="analytics-raters-card"' not found`

- [ ] **Step 3: Implement HTML markup in `public/admin.html`**

Insert the following sections into `public/admin.html` inside `#analytics-data-content`:

1. **Top Raters Activity Card**:
```html
<div id="analytics-raters-card" class="studio-card p-5 space-y-3">
  <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
    <div>
      <h3 class="text-xs font-bold text-zinc-900">Active Evaluators & Rater Consensus</h3>
      <p class="text-[11px] text-zinc-500">Evaluator progress, scoring strictness, and flagged defects</p>
    </div>
    <span id="audit-rater-count-badge" class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">0 Raters</span>
  </div>
  <div id="analytics-raters-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
    <!-- Populated via admin_app.js -->
  </div>
</div>
```

2. **Submissions Audit Log & Filter Toolbar**:
```html
<div class="studio-card p-0 overflow-hidden space-y-0">
  <div class="p-4 border-b border-zinc-200 bg-zinc-50/75 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
    <div>
      <h3 class="text-xs font-bold text-zinc-900">Submissions Audit Log & Defect Inspector</h3>
      <p class="text-[11px] text-zinc-500">Inspect individual submissions, listen to audio, and audit waveform defects.</p>
    </div>
    <div class="flex items-center gap-2 text-xs">
      <span id="audit-count-badge" class="text-[11px] font-mono font-semibold px-2 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700">Showing 0 evaluations</span>
    </div>
  </div>
  
  <!-- Filter Toolbar -->
  <div class="p-3 border-b border-zinc-200 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
    <div class="relative">
      <input type="text" id="audit-search-input" placeholder="Search prompt, key, rater..." class="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-900">
    </div>
    <select id="audit-filter-rater" class="px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:bg-white text-zinc-700">
      <option value="all">All Evaluators</option>
    </select>
    <select id="audit-filter-model" class="px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:bg-white text-zinc-700">
      <option value="all">All Models</option>
    </select>
    <select id="audit-filter-defect" class="px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:bg-white text-zinc-700">
      <option value="all">All Defect States</option>
      <option value="with_defects">Flagged Defects Only</option>
      <option value="clean">Clean / Passed Only</option>
      <option value="with_transcription">With Transcription</option>
    </select>
    <select id="audit-sort-select" class="px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:bg-white text-zinc-700">
      <option value="newest">Sort: Newest First</option>
      <option value="oldest">Sort: Oldest First</option>
      <option value="lowest_score">Sort: Lowest Score First</option>
      <option value="highest_score">Sort: Highest Score First</option>
      <option value="duration">Sort: Longest Review Time</option>
    </select>
  </div>

  <!-- Audit Table -->
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs">
      <thead class="bg-zinc-50/80 border-b border-zinc-200 text-zinc-600 font-semibold">
        <tr>
          <th class="p-3 w-10 text-center">Audio</th>
          <th class="p-3">Prompt & Key</th>
          <th class="p-3">Model</th>
          <th class="p-3">Evaluator</th>
          <th class="p-3">Scores</th>
          <th class="p-3">Defects Flagged</th>
          <th class="p-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody id="analytics-audit-tbody" class="divide-y divide-zinc-100">
        <tr>
          <td colspan="7" class="p-6 text-center text-zinc-400 font-medium">Select a study to view evaluation submissions.</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_server.py -k test_admin_html_audit_studio_structure -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html tests/test_server.py
git commit -m "feat(ui): add audit studio table and top raters activity blueprint in admin.html"
```

---

### Task 3: Client-Side Audit Engine, Multi-Facet Filters & Rater Leaderboard

**Files:**
- Modify: `public/js/admin_app.js:405-430` (Element bindings)
- Modify: `public/js/admin_app.js:3670-3860` (Fetch evaluations, render leaderboard, wire live filtering and sorting)
- Test: `tests/test_server.py` (Script binding check)

**Interfaces:**
- Consumes: `GET /api/evaluations?campaign_id=<id>`, DOM elements from Task 2
- Produces: `renderAuditStudio()`, `renderRatersLeaderboard()`, `filterAndSortAuditEvaluations()`

- [ ] **Step 1: Write integration test in `tests/test_server.py`**

```python
def test_admin_app_audit_bindings(self):
    """Verify admin_app.js contains audit studio functions and state bindings."""
    with open("public/js/admin_app.js", "r", encoding="utf-8") as f:
        js = f.read()
    self.assertIn("auditSearchInput", js)
    self.assertIn("renderAuditStudio", js)
    self.assertIn("renderRatersLeaderboard", js)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_server.py -k test_admin_app_audit_bindings -v`
Expected: FAIL

- [ ] **Step 3: Implement logic in `public/js/admin_app.js`**

1. Bind DOM elements in `el`:
   - `auditSearchInput`, `auditFilterRater`, `auditFilterModel`, `auditFilterDefect`, `auditSortSelect`, `auditCountBadge`, `analyticsAuditTbody`, `analyticsRatersGrid`, `auditRaterCountBadge`.
2. In `loadAnalyticsSummary()`:
   - Call `const evResp = await adminFetch(`/api/evaluations?campaign_id=${campaignId}`);`
   - Store list in `state.auditData = { evaluations: evData.evaluations || [], activeFilter: {} };`
   - Call `renderRatersLeaderboard()` and `renderAuditStudio()`.
3. Implement `renderRatersLeaderboard()`:
   - Group evaluations by `rater_id`.
   - Calculate total items, mean score, total defects, and relative strictness (strict, neutral, generous).
   - Render clickable cards. Clicking a card sets `auditFilterRater.value = rater_id` and triggers filter update.
4. Implement `filterAndSortAuditEvaluations()`:
   - Filter by query string (case-insensitive search in `item_text`, `item_key`, `rater_name`).
   - Filter by `model_id` and `rater_id`.
   - Filter by defect state (`with_defects`, `clean`, `with_transcription`).
   - Sort by selected mode (`newest`, `oldest`, `lowest_score`, `highest_score`, `duration`).
5. Render table rows in `analyticsAuditTbody`:
   - Inline audio play button using `resolveAudioUrl(ev)`.
   - Score badges (green/amber pills for Pass/Fail or 1-5 metrics).
   - Flagged defect badges with error code pills.
   - Expand indicator button.
   - Delete button sending `DELETE /api/evaluations?id=${ev.id}` with UI feedback.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_server.py -k test_admin_app_audit_bindings -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/admin_app.js tests/test_server.py
git commit -m "feat(ui): implement evaluation audit engine, rater leaderboard, and multi-facet filtering"
```

---

### Task 4: Expandable Waveform Defect Canvas & Dual Audio Playback

**Files:**
- Modify: `public/js/admin_app.js` (Expandable row renderer, canvas peak drawing, slice audio player)
- Modify: `public/js/audio_dsp.js` (Export helper or instantiate lightweight player)
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `ev.defect_tags`, `ev.audio_files_json`, `window.dspEngine`
- Produces: `expandEvaluationInspector(rowEl, ev)`, `playDefectSlice(url, startSec, endSec)`

- [ ] **Step 1: Write integration test in `tests/test_server.py`**

```python
def test_waveform_inspector_canvas_wiring(self):
    """Verify admin_app.js contains waveform canvas inspector and slice playback."""
    with open("public/js/admin_app.js", "r", encoding="utf-8") as f:
        js = f.read()
    self.assertIn("expandEvaluationInspector", js)
    self.assertIn("playDefectSlice", js)
    self.assertIn("audit-waveform-canvas", js)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_server.py -k test_waveform_inspector_canvas_wiring -v`
Expected: FAIL

- [ ] **Step 3: Implement expandable inspector logic in `public/js/admin_app.js`**

1. Add row click handler to toggle expand container:
   - Insert an expanded `<tr><td colspan="7">...</td></tr>` container below the row.
2. Inside the container, render:
   - An HTML5 `<canvas class="audit-waveform-canvas w-full h-[76px] rounded-lg bg-zinc-900"></canvas>`.
   - Defect tags list with pill badges (`SUB_FAIL`, `0.28s - 0.52s`).
   - Dual Playback Controls:
     - `btnPlaySlice`: Reads `d.time_start_ms / 1000` and `d.time_end_ms / 1000`, calls Web Audio API source node with `source.start(0, startSec, endSec - startSec)`.
     - `btnPlayFull`: Plays the entire audio sample with real-time cursor line tracking on the canvas.
   - Rater Notes & Transcription Diff section (if entered).
3. Fetch the audio buffer using `fetch(audioUrl) -> arrayBuffer() -> audioCtx.decodeAudioData()`.
4. Draw waveform peaks on the canvas and overlay defect regions as semi-transparent red bounding boxes with labeled flags.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_server.py -k test_waveform_inspector_canvas_wiring -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/admin_app.js tests/test_server.py
git commit -m "feat(ui): add expandable waveform defect inspector with isolated slice playback"
```

---

### Task 5: End-to-End Regression Verification & Integrity Checks

**Files:**
- Modify: `tests/test_server.py`
- Test: Full test suite

**Interfaces:**
- Consumes: All updated files
- Produces: 100% passing tests, verified clean package

- [ ] **Step 1: Run the full test suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: 33+ tests pass in under 2 seconds with `OK`.

- [ ] **Step 2: Run package validator**

Run: `python3 scripts/validate_package.py`
Expected: `PACKAGE VALIDATION: PASS`

- [ ] **Step 3: Verify live endpoints on local port 8080**

Run: `curl -s "http://localhost:8080/api/evaluations?campaign_id=camp-vocab-200" | python3 -c "import sys, json; print('Evaluations endpoint functional:', 'evaluations' in json.load(sys.stdin))"`
Expected: `Evaluations endpoint functional: True`

- [ ] **Step 4: Commit**

```bash
git commit -am "chore: verify end-to-end audit studio test suite and package integrity"
```
