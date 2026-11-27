# Rater UX & Dynamic Admin Results / Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all rater evaluation state/navigation/rating-toggle bugs and upgrade the Admin Results & Scores page into a dynamic, study-aware analytics, evaluation-inspection, and rater-moderation console.

**Architecture:** The backend (`run_server.py`) enriches `/api/admin/summary` with study metadata, dynamic scale bounds, and per-rater statistics, fixes `campaign_id`-scoped `/api/admin/export.csv`, and adds `DELETE /api/raters` (study-scoped or global). The rater portal (`eval_app.js`, `eval.html`) separates local `localStorage` drafts from server submissions, restores all scores/waveform defects/word highlights on revisit, supports click-to-cancel ratings, and aligns `state.items` with the visual sidebar sort order. The admin portal (`admin_app.js`, `admin.html`) adapts charts/KPIs to any rubric or modality and adds Per-Rater management and an Individual Evaluation Inspector modal.

**Tech Stack:** Python 3 standard library (`http.server`, `sqlite3`, `unittest`), Vanilla ES6+ JS, Web Audio API (`audio_dsp.js`), HTML5 Canvas, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-25-rater-ux-and-admin-results-design.md`

## Global Constraints
- Zero third-party Python dependencies (`http.server`, `sqlite3`, `json`, `csv`, `io`, `math`, `urllib`, `unittest` only).
- Pure vanilla ES6+ JavaScript on frontend; no new npm packages or build steps.
- SQLite `PRAGMA foreign_keys = ON;` and parameterized `?` queries everywhere.
- Admin endpoints (`/api/admin/*`, `DELETE /api/raters`, `DELETE /api/evaluations`) must enforce `self.is_authenticated_admin()`.
- All existing and new tests in `python3 -m unittest discover -s tests -v` must pass.

## Review Focus
- **1–7 Scale & Binary CI Bounds:** A 1–7 rubric or binary Pass/Fail study must not clamp `ci_upper` at `5.0` or render `"1 to 5"` in Admin Results; verify `ci_upper` clamps to `study_meta.scale_max` and binary metrics report `pass_rate`. (Pinned in Task 1 & Task 4)
- **CSV Export Isolation:** Exporting CSV with `?campaign_id=<id>` must never leak evaluations from other campaigns, and must handle evaluations with multiple `defect_tags` or `asr_adjudication`. (Pinned in Task 1)
- **Rater Deletion Authorization & Scope:** Unauthenticated `DELETE /api/raters` must return `401`; `campaign_id`-scoped delete must remove only that study's evaluations while preserving the rater globally; global delete must cascade all evaluations. (Pinned in Task 2)
- **Draft vs. Submitted State Collision:** Switching away from an unsubmitted item with partial scores, waveform defects, or word highlights must NOT post to `/api/evaluations` or turn the sidebar green; returning to a submitted item (stored in `state.existingEvaluations` in-session without `scores_json` string) must still restore scores, waveform defects, and word highlights. (Pinned in Task 3)
- **Empty / Filtered Visible Sequence on Submit:** When `selectedModelFilter` is active and the rater submits the last item of that model, `submitAndNext()` must not jump to an out-of-order item or show completion if other models still have unrated items. (Pinned in Task 3)

---

### Task 1: Backend Study-Aware `/api/admin/summary` & Scoped `/api/admin/export.csv`

**Files:**
- Modify: `run_server.py:415-604`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: SQLite `campaigns`, `rubrics`, `test_items`, `evaluations`, `defect_tags`, `raters`, `models`.
- Produces:
  - `GET /api/admin/summary?campaign_id=...&model_id=...&rater_id=...` returning `study_meta`, `model_statistics` (with both `name` and `model_name`, `ci_upper` clamped to `study_meta.scale_max`), `rater_statistics`, `defects_summary`, `word_defect_heatmap`, `transcriptions_summary`, `asr_summary`.
  - `GET /api/admin/export.csv?campaign_id=...&model_id=...&rater_id=...` scoped to the requested filters with `asr_adjudication`, `defect_tags_json`, and `duration_seconds`.
  - `GET /api/evaluations` including `audio_url` (resolved from `test_items.audio_url` / `audio_files_json`) and `item_key` so the Admin Inspector can play audio directly.

- [ ] **Step 1: Write the failing tests in `tests/test_server.py`**

Add `test_admin_summary_dynamic_scale_rater_stats_and_scoped_csv` to `StudioServerTestCase` testing:
1. Creating a 1–7 scale campaign and submitting a rating of `7` -> `GET /api/admin/summary?campaign_id=...` returns `study_meta.scale_max == 7`, `model_statistics[0]["summary"][metric]["ci_upper"] <= 7.0` (and `== 7.0` for `7`), `model_name` present, and `rater_statistics` containing `eval_count`, `avg_duration_sec`, `mean_score`, `defect_count`.
2. Filtering `/api/admin/summary?campaign_id=...&rater_id=...` filters counts and stats to that rater.
3. `GET /api/admin/export.csv?campaign_id=<camp_id>` contains ONLY rows from `<camp_id>` (zero rows from `camp-dev23-4models`) and includes `asr_adjudication`, `defect_tags_json`, and `duration_seconds` headers.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_admin_summary_dynamic_scale_rater_stats_and_scoped_csv -v`
Expected: FAIL (`study_meta` missing, `ci_upper` clamped to `5.0`, CSV contains other campaigns).

- [ ] **Step 3: Update `handle_api_get` in `run_server.py`**

1. In `/api/evaluations` (`run_server.py:389-412`), select `i.audio_url, i.audio_files_json` alongside `i.item_key, i.text as item_text` and include `model_id` filter support.
2. In `/api/admin/summary` (`run_server.py:415-558`):
   - Support `campaign_id`, `model_id`, and `rater_id` filters consistently across all queries.
   - When `campaign_id` is given, query `campaigns JOIN rubrics` and `COUNT(*) FROM test_items` to populate `study_meta` (`campaign_id`, `name`, `modality`, `protocol_type`, `scale_min`, `scale_max`, `metrics`, `items_count`). Default `scale_max` to `5` when no campaign is specified.
   - Clamp `ci_upper` to `float(scale_max)` and `ci_lower` to `float(scale_min)` (or `0.0` for binary).
   - Include both `"name"` and `"model_name"` in `model_stats[mid]`.
   - Compute `rater_statistics` from filtered `evaluations` joined with `raters` and `defect_tags` (`rater_id`, `rater_name`, `role`, `eval_count`, `avg_duration_sec`, `mean_score`, `defect_count`, `last_submitted_at`).
3. In `/api/admin/export.csv` (`run_server.py:560-604`):
   - Apply `campaign_id`, `model_id`, `rater_id` `WHERE` clauses.
   - Join `campaigns c ON e.campaign_id = c.id` and fetch `defect_tags` per evaluation; write columns `trial_id`, `campaign_id`, `campaign_name`, `item_id`, `category_name`, `khmer_text`, `target_ipa_standard`, `target_ipa_colloquial`, `model_id`, `evaluator_id`, `scores_json`, `asr_adjudication`, `defect_tags_json`, `duration_seconds`, `blind_transcript`, `comments`, `created_at`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_admin_summary_dynamic_scale_rater_stats_and_scoped_csv -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add run_server.py tests/test_server.py
git commit -m "feat(api): add study-aware summary stats, rater metrics, and scoped csv export"
```

---

### Task 2: Backend Rater Moderation Endpoint (`DELETE /api/raters`)

**Files:**
- Modify: `run_server.py:656-706`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `self.is_authenticated_admin()`, SQLite `raters`, `evaluations`, `defect_tags`.
- Produces: `DELETE /api/raters?id=<rater_id>&campaign_id=<optional>`.

- [ ] **Step 1: Write the failing test in `tests/test_server.py`**

Add `test_delete_rater_scoped_and_global` to `StudioServerTestCase`:
1. Without `X-Admin-PIN`, `DELETE /api/raters?id=...` returns HTTP `401`.
2. Create a rater who submits 1 evaluation in Campaign A and 1 evaluation in Campaign B.
3. With `X-Admin-PIN`, `DELETE /api/raters?id=<rater_id>&campaign_id=<camp_a>` returns `200` with `scope == "campaign"` and `deleted_evaluations == 1`; verify Campaign A has 0 evaluations for that rater while Campaign B and the `raters` row still exist.
4. With `X-Admin-PIN`, `DELETE /api/raters?id=<rater_id>` (no `campaign_id`) returns `200` with `scope == "global"`; verify the `raters` row and Campaign B's evaluation are both deleted.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_delete_rater_scoped_and_global -v`
Expected: FAIL (HTTP 404 "Delete endpoint not found").

- [ ] **Step 3: Implement `/api/raters` in `handle_api_delete` (`run_server.py:656-706`)**

Add `if path == "/api/raters":` inside `handle_api_delete`:
- Require `id` query parameter (`400` if missing).
- Check `raters` existence (`404` if missing).
- If `campaign_id` query param is present, delete from `evaluations WHERE rater_id = ? AND campaign_id = ?` and return `deleted_evaluations = cur.rowcount`.
- Otherwise delete from `raters WHERE id = ?` (FK cascade removes evaluations & defect tags).

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_delete_rater_scoped_and_global -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add run_server.py tests/test_server.py
git commit -m "feat(api): add admin-protected scoped and global rater deletion"
```

---

### Task 3: Rater Portal State Persistence, Cancelable Ratings, Word Highlights & Ordered Navigation

**Files:**
- Modify: `public/eval.html:435-454` (add `#btn-reset-item` button in bottom dock)
- Modify: `public/js/eval_app.js`
- Test: `tests/test_server.py` (DOM/structure contract assertions for `#btn-reset-item` and `eval_app.js` helpers) + live headless/syntax verification.

**Interfaces:**
- Consumes: `GET /api/items`, `GET /api/evaluations`, `POST /api/evaluations`, `window.dspEngine`.
- Produces in `eval_app.js`:
  - `state.drafts` persisted in `localStorage` under `audio_studio_rater_drafts_v1:<campaignId>:<raterId>`.
  - `sortItemsForSidebar(items)` applied directly to `state.items` in `loadCampaignData()`.
  - `getVisibleSequenceIndices()` for `submitAndNext()` sequential ordering.
  - `saveDraftForCurrentItem()`, `clearDraftForItem(itemId)`, `resetCurrentItemDraft()`.
  - `state.currentWordHighlights` (`Map<wordIndex, { word_index, word_text, error_code }>`) merged with `state.currentDefects` into `defect_tags`.
  - Toggleable score pills (`renderRubricForm()`), binary pills, and ASR adjudication buttons (`setupAsrControls()`).

- [ ] **Step 1: Write structural & contract test in `tests/test_server.py`**

Add `test_eval_portal_draft_reset_and_state_contracts` verifying:
- `public/eval.html` contains `id="btn-reset-item"`.
- `public/js/eval_app.js` contains `saveDraftForCurrentItem`, `sortItemsForSidebar`, `getVisibleSequenceIndices`, `currentWordHighlights`, and does NOT fire `POST /api/evaluations` inside `autoSaveCurrentItem` on navigation.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_eval_portal_draft_reset_and_state_contracts -v`
Expected: FAIL.

- [ ] **Step 3: Implement Rater UX fixes in `public/eval.html` and `public/js/eval_app.js`**

1. **`public/eval.html`**: Add `<button type="button" id="btn-reset-item" class="hidden btn-ghost py-1.5 px-2.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50">Reset</button>` next to `#eval-status-indicator` in the bottom dock.
2. **`public/js/eval_app.js`**:
   - **Draft storage:** Add `state.drafts = {}`, `state.currentWordHighlights = new Map()`, `loadDraftsFromStorage()`, `persistDraftsToStorage()`, `saveDraftForCurrentItem()`, `clearDraftForItem(itemId)`.
   - **Replace `autoSaveCurrentItem()`** in `navigateItem()`, sidebar matrix cell click, sidebar list click, and `switchMainMode()` with `saveDraftForCurrentItem()` so navigating away **never** sends partial ratings to `/api/evaluations`.
   - **Normalize `state.existingEvaluations[item.id]`:** In `submitAndNext()`, store `{ ...payload, scores_json: JSON.stringify(payload.scores), defect_tags: payload.defect_tags }` and clear `state.drafts[item.id]`.
   - **Full restoration in `renderCurrentItem()`:**
     - Choose source: `state.drafts[item.id] || state.existingEvaluations[item.id]`.
     - Parse `scores` from `source.scores || JSON.parse(source.scores_json)`.
     - Restore waveform defect regions from `source.defect_tags` (where `time_end_ms > time_start_ms` or `!word_text`) into `state.currentDefects`, `window.dspEngine.setRegions(...)`, and `renderDefectTagsList()`.
     - Restore word highlights from `source.defect_tags` (where `word_text`) into `state.currentWordHighlights` and apply active classes (`bg-amber-100 border-amber-500 text-amber-900`) to `.word-pill-btn`.
     - Restore `comments`, `blind_transcript`, and `asr_adjudication`.
     - Toggle `#btn-reset-item` visibility based on `Boolean(state.drafts[item.id])`; wire click to discard draft and re-render.
   - **Sidebar Draft indicator:** In `renderSidebar()`, check `const hasDraft = !!state.drafts[item.id]`. Style `.matrix-cell.draft` (amber border/dot) and list view `"Draft"` badge when `hasDraft` is true.
   - **Click-to-cancel ratings:** In `renderRubricForm()` (1–N pills & Pass/Fail pills) and `setupAsrControls()`, if `state.currentScores[metricKey] === score` (or `state.currentAsrAdjudication === choice`), delete `state.currentScores[metricKey]` (or set `state.currentAsrAdjudication = null`), then update UI & status pill.
   - **Ordered `state.items` & `submitAndNext()`:** Implement `sortItemsForSidebar(items)` and apply it to `state.items` right after fetching `/api/items`. Implement `getVisibleSequenceIndices()` and advance `submitAndNext()` strictly to the next index in `getVisibleSequenceIndices()` after `state.currentIndex`.

- [ ] **Step 4: Run JS syntax check and unit test**

Run: `node --check public/js/eval_app.js && python3 -m unittest tests.test_server.StudioServerTestCase.test_eval_portal_draft_reset_and_state_contracts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/eval.html public/js/eval_app.js tests/test_server.py
git commit -m "fix(eval): persist drafts locally, restore all state, toggle ratings, and fix next-item order"
```

---

### Task 4: Dynamic Admin Results & Scores Dashboard (`admin.html`, `admin_app.js`)

**Files:**
- Modify: `public/admin.html:880-1028`
- Modify: `public/js/admin_app.js:398-415, 3605-4006`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `GET /api/admin/summary?campaign_id=...&model_id=...&rater_id=...`, `GET /api/admin/export.csv?campaign_id=...&model_id=...&rater_id=...`.
- Produces: Adaptive KPI cards, Model/Rater filter dropdowns, Metric selector for comparison chart, dynamic Y-axis (`scale_min..scale_max` or `0–100%`), ASR Adjudication breakdown card, Word-Level Defect Heatmap table, and fixed `mInfo.name || mInfo.model_name` rendering.

- [ ] **Step 1: Write the failing test in `tests/test_server.py`**

Add `test_admin_results_dynamic_ui_containers` checking `public/admin.html` for:
- `#analytics-model-filter`, `#analytics-rater-filter`, `#chart-metric-select`, `#analytics-asr-card`, `#analytics-word-heatmap-tbody`, `#analytics-raters-tbody`, `#analytics-evaluations-tbody`, `#modal-inspect-evaluation`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_admin_results_dynamic_ui_containers -v`
Expected: FAIL.

- [ ] **Step 3: Update `public/admin.html` and `public/js/admin_app.js`**

1. **`public/admin.html`:**
   - Add `#analytics-model-filter` and `#analytics-rater-filter` `<select>` controls in the `#view-results` header bar.
   - Make KPI Card 3 label dynamic (`#stat-primary-label` instead of hardcoded `"Average Score (1 to 5)"`).
   - Add `#chart-metric-select` `<select>` inside the Model Comparison chart header and make `#chart-mos-title` / `#chart-mos-subtitle` dynamic.
   - Add `#analytics-asr-card` (hidden unless `study_meta.modality === "ASR"` or `asr_summary.total_judgments > 0`).
   - Add Word-Level Defect Heatmap table (`#analytics-word-heatmap-tbody`) next to/below Flagged Speech Defects.
2. **`public/js/admin_app.js`:**
   - Cache all new DOM elements in `el`.
   - Fix `mInfo.name || mInfo.model_name || "Audio Sample"` in both the scorecard table and `renderMosComparisonChart()`.
   - Update `loadAnalyticsData()` to pass `model_id` and `rater_id` query params when selected, populate `#analytics-model-filter` and `#analytics-rater-filter` options, adapt KPI Card 3 to `study_meta` (Pass Rate % for binary, Acceptable Rate % for ASR, Mean Score for `1..scale_max`), render `#chart-metric-select` options from `metricKeys`, scale `renderMosComparisonChart()` Y-axis to `scale_min..scale_max`, render `#analytics-asr-card`, and populate `#analytics-word-heatmap-tbody`.
   - Update `#btn-export-csv` click handler to pass active `model_id` and `rater_id` filters to `/api/admin/export.csv`.

- [ ] **Step 4: Run JS syntax check and unit test**

Run: `node --check public/js/admin_app.js && python3 -m unittest tests.test_server.StudioServerTestCase.test_admin_results_dynamic_ui_containers -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): make results dashboard study-aware with model/rater filters and word heatmap"
```

---

### Task 5: Admin Per-Rater Management & Full Evaluation Inspector Modal

**Files:**
- Modify: `public/admin.html` (Raters table, All Evaluations table, `#modal-inspect-evaluation`, `#modal-delete-rater`)
- Modify: `public/js/admin_app.js` (render raters, render evaluations table, inspect modal with audio playback/defects/scores, delete evaluation & delete rater handlers)
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `GET /api/evaluations?campaign_id=...&model_id=...&rater_id=...`, `DELETE /api/evaluations?id=...`, `DELETE /api/raters?id=...&campaign_id=...`.
- Produces: `renderRatersTable(ratersStats, totalItems)`, `loadEvaluationsInspector()`, `openInspectEvaluationModal(ev)`, `deleteEvaluationById(evalId)`, `confirmDeleteRater(raterId, raterName, scope)`.

- [ ] **Step 1: Write the failing test in `tests/test_server.py`**

Add `test_admin_inspector_and_rater_moderation_wiring` verifying `public/admin.html` and `public/js/admin_app.js` contain the inspector modal audio player (`#inspect-eval-audio`), `#modal-delete-rater`, and wire `DELETE /api/evaluations` and `DELETE /api/raters`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_admin_inspector_and_rater_moderation_wiring -v`
Expected: FAIL.

- [ ] **Step 3: Implement Raters Management & Evaluation Inspector in `public/admin.html` and `public/js/admin_app.js`**

1. **`public/admin.html`:**
   - Add **Participating Listeners (Raters)** card (`#analytics-raters-tbody`) inside `#analytics-data-content`.
   - Add **All Submitted Evaluations** card (`#analytics-evaluations-tbody`, `#evaluations-search-input`, `#evaluations-count-badge`) inside `#analytics-data-content`.
   - Add `#modal-inspect-evaluation` (showing item key, model, rater, duration, timestamp, `<audio id="inspect-eval-audio" controls>`, scores grid, ASR adjudication, defect tags & highlighted words, blind transcript, comments, and `#btn-inspect-delete-eval`).
   - Add `#modal-delete-rater` confirmation modal with **Clear from This Study** and **Delete Rater Globally** buttons.
2. **`public/js/admin_app.js`:**
   - Render `rater_statistics` into `#analytics-raters-tbody` with `Filter`, `Clear Study`, and `Delete Rater` buttons.
   - Fetch `GET /api/evaluations?campaign_id=...&model_id=...&rater_id=...` inside `loadAnalyticsData()` and render `#analytics-evaluations-tbody` with live search filtering.
   - Implement `openInspectEvaluationModal(ev)` resolving `audio_url` (supporting both `ev.audio_url` and `ev.audio_files_json`) and wiring `#btn-inspect-delete-eval` to `DELETE /api/evaluations?id=...` + refresh.
   - Wire `#modal-delete-rater` actions to `DELETE /api/raters?id=...&campaign_id=...` (study scope) or `DELETE /api/raters?id=...` (global scope) + refresh.

- [ ] **Step 4: Run full test suite & JS syntax checks**

Run: `node --check public/js/eval_app.js && node --check public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: All tests PASS with 0 errors and 0 failures.

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): add per-rater management and full evaluation inspector modal"
```
