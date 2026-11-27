# Rater UX & Dynamic Admin Results / Moderation Design Spec

**Date:** 2026-11-25  
**Scope:** Rater Evaluation Portal (`public/eval.html`, `public/js/eval_app.js`), Backend API (`run_server.py`), Admin Results & Raters Console (`public/admin.html`, `public/js/admin_app.js`), Automated Tests (`tests/test_server.py`).

## 1. Global Constraints
- **Zero Third-Party Python Dependencies:** Backend uses Python standard library only (`http.server`, `sqlite3`, `json`, `csv`, `io`, `math`, `urllib`, `unittest`).
- **Frontend Stack:** Vanilla ES6+ JavaScript, Web Audio API (`public/js/audio_dsp.js`), HTML5 Canvas, Tailwind CSS, and `public/css/style.css`.
- **Database Integrity:** SQLite 3 (`workbench.db`) with `PRAGMA foreign_keys = ON;` and parameterized `?` queries.
- **Security Boundaries:** Admin endpoints (`/api/admin/*`, `DELETE /api/raters`, `DELETE /api/evaluations`) require `X-Admin-PIN` or `Authorization: Bearer pin-<token>`. Rater endpoints (`/api/raters` POST/GET, `/api/evaluations` POST/GET) remain unauthenticated for crowdsourced evaluation.
- **Test Gate:** `python3 -m unittest discover -s tests -v` must pass 100% with zero regressions.

---

## 2. Rater Portal UX & State Architecture

### 2.1 Local Draft + Explicit Submit Lifecycle
- **Draft Storage:** `localStorage` key `audio_studio_rater_drafts_v1:<campaignId>:<raterId>` stores a map `{ [itemId]: DraftRecord }`.
- **DraftRecord Shape:**
  ```json
  {
    "scores": { "naturalness": 4 },
    "defect_tags": [
      { "word_index": 0, "word_text": "", "error_code": "C_DEL", "note": "", "time_start_ms": 120, "time_end_ms": 450 }
    ],
    "comments": "...",
    "blind_transcript": "...",
    "asr_adjudication": null,
    "updated_at": 1732550000000
  }
  ```
- **Navigation Behavior:**
  - Navigating away (`navigateItem`, sidebar cell/list click, or mode switch) **never** calls `POST /api/evaluations`. Instead, `saveDraftForCurrentItem()` persists the current UI state into `state.drafts[item.id]` and `localStorage` (or deletes the draft if empty/identical to `state.existingEvaluations[item.id]`).
  - Only clicking **Submit & Next** / **Update & Next** (or pressing `Enter`) validates required fields and posts to `POST /api/evaluations`.
  - On successful submission: normalize the stored entry in `state.existingEvaluations[item.id]` (containing both `scores`, `scores_json`, `defect_tags`, `comments`, `blind_transcript`, `asr_adjudication`), delete `state.drafts[item.id]`, and persist `localStorage`.

### 2.2 Full State Restoration & Guarded Editing
- When `renderCurrentItem()` loads `item`:
  1. Source priority: `state.drafts[item.id]` (if present) -> `state.existingEvaluations[item.id]` (if present) -> empty defaults.
  2. **Scores:** Read from `source.scores` or `JSON.parse(source.scores_json)`.
  3. **Waveform Defect Regions:** Filter `source.defect_tags` where `time_end_ms > time_start_ms` (or `!word_text`), map to DSP region objects (`id`, `startSec`, `endSec`, `startMs`, `endMs`, `errorCode`, `errorLabel`, `note`), load into `state.currentDefects` and `window.dspEngine.setRegions(...)`, and render `#defect-tags-list`.
  4. **Word-Pill Highlights:** Filter `source.defect_tags` where `word_text` is non-empty, store in `state.currentWordHighlights` (`Map<word_index, { word_index, word_text, error_code }>`), and restore active highlight classes on `#word-pills-container` buttons.
  5. **Comments, Heard Transcript, ASR Adjudication:** Restore `el.evalNotesInput.value`, `el.heardTranscriptInput.value` (+ `updateHeardDiff()`), and `state.currentAsrAdjudication` (+ `updateAsrButtonStyles()`).
- **Reset Action:** Show a `#btn-reset-item` button in the bottom dock when `state.drafts[item.id]` exists. Clicking it discards the local draft for `item.id` and re-renders from `state.existingEvaluations[item.id]` (or clean defaults).
- **Sidebar Indicators:**
  - `Draft` (has `state.drafts[item.id]`): amber badge/cell ring.
  - `Completed` (has `state.existingEvaluations[item.id]` and no draft): emerald green.
  - `Unrated`: neutral zinc.

### 2.3 Toggleable (Cancelable) Ratings
- In `renderRubricForm()` (both continuous `1..N` pills and binary `Pass`/`Fail` pills) and `setupAsrControls()` (`ACCEPTABLE_VARIATION` / `TRUE_ERROR`):
  - If the clicked value equals `state.currentScores[metricKey]` (or `state.currentAsrAdjudication`), **delete/clear** it instead of re-assigning it.
  - Immediately update pill active states and `#eval-status-indicator` (`Incomplete: X of Y answered` vs `All answered - Ready to Submit`).
  - Keyboard number keys (`1–5`, `0`) also support toggling off if pressed on a single-metric item or when explicitly matching the active score.

### 2.4 Unified Word + Waveform Defect Tagging
- Clicking a word pill in `#word-pills-container` toggles an entry in `state.currentWordHighlights` with `word_index`, `word_text`, and `error_code: "WORD_FLAG"`.
- Both `state.currentDefects` (waveform regions) and `state.currentWordHighlights` (word pills) are serialized together into `defect_tags` on draft save and `POST /api/evaluations`.

### 2.5 Predictable Sidebar-Ordered Navigation
- Introduce `sortItemsForSidebar(items)` that groups items by `resolveItemModelId(item)` and sorts within each model naturally by `KH01..KH23` / `W001..W200` / `ITEM-01` / numeric `item_key`.
- Apply this sorted order directly to `state.items` upon load in `loadCampaignData()`, so `state.currentIndex` and the visual sidebar grid/list share the exact same 1:1 ordering.
- Introduce `getVisibleSequenceIndices()` returning the ordered indices matching `state.selectedModelFilter` (and `all` if no model filter is active).
- `submitAndNext()` advances strictly to the **next index in `getVisibleSequenceIndices()`** after `state.currentIndex` (e.g., `1 -> 2 -> 3`). Only when at the end of the visible sequence:
  - If all items in `state.items` are evaluated, show `showCompletionScreen()`.
  - Otherwise, if a model filter was active and finished, switch to the next unrated item in the study (or notify the rater that this model group is complete and advance to the next model).

---

## 3. Backend Analytics, Exports & Moderation API (`run_server.py`)

### 3.1 Study-Aware `GET /api/admin/summary`
- Accept query parameters: `campaign_id` (optional), `model_id` (optional), `rater_id` (optional).
- Load campaign & rubric metadata (`modality`, `protocol_type`, `scale_min`, `scale_max`, `metrics_json`, `items_count`) into `study_meta`.
- Fix `ci_upper`: clamp to `scale_max` (from `study_meta`, default `5.0`) instead of hardcoded `5.0`.
- Include both `"name"` and `"model_name"` on each entry in `model_statistics` for full backwards compatibility (`admin_view.js` + `admin_app.js`).
- Add `"rater_statistics"`: array of `{ rater_id, rater_name, role, eval_count, avg_duration_sec, mean_score, defect_count, last_submitted_at }` ordered by `eval_count DESC`.

### 3.2 Scoped & Enriched `GET /api/admin/export.csv`
- Filter by `campaign_id` (and optional `rater_id`, `model_id`) when provided.
- Export columns: `trial_id`, `campaign_id`, `campaign_name`, `item_id`, `category_name`, `khmer_text`, `target_ipa_standard`, `target_ipa_colloquial`, `model_id`, `evaluator_id`, `scores_json`, `asr_adjudication`, `defect_tags_json`, `duration_seconds`, `blind_transcript`, `comments`, `created_at`.

### 3.3 Rater Deletion & Study-Clear Endpoint (`DELETE /api/raters`)
- Admin-PIN protected (`handle_api_delete`).
- Query params: `id` (required `rater_id`), `campaign_id` (optional).
- Behavior:
  - If `campaign_id` is provided: `DELETE FROM evaluations WHERE rater_id = ? AND campaign_id = ?` (cascades `defect_tags`), keeping the rater record and their evaluations in other studies. Return `{ success: true, scope: "campaign", rater_id, campaign_id, deleted_evaluations }`.
  - If `campaign_id` is omitted: `DELETE FROM raters WHERE id = ?` (cascades all `evaluations` and `defect_tags` globally). Return `{ success: true, scope: "global", rater_id }`.

---

## 4. Adaptive Admin Results, Evaluation Inspector & Rater Console (`admin.html`, `admin_app.js`)

### 4.1 Dynamic Study-Aware Results Dashboard
- **Filter Bar:** Campaign selector + **Filter by Model** + **Filter by Rater** + **Export CSV**.
- **Adaptive KPI Cards:**
  - Card 1: `Total Evaluations` (with completion % vs `study_meta.items_count` when applicable)
  - Card 2: `Distinct Listeners`
  - Card 3: Adapts to study type:
    - Binary Pass/Fail -> `Overall Pass Rate (%)`
    - Pairwise -> `Evaluations Logged` / `Leading Choice`
    - ASR -> `Acceptable Rate (%)`
    - MOS 1–5 / 1–7 -> `Mean Score (1 to <scale_max>)`
- **Adaptive Charts:**
  - **Model Comparison Chart:** Metric selector dropdown (switch between any rubric metric, not just the first), dynamic Y-axis (`0–100%` for binary, `scale_min..scale_max` for numeric scales), real `m.name || m.model_name`.
  - **ASR Adjudication Card:** Shown when `modality === "ASR"` or `asr_summary.total_judgments > 0`, displaying Acceptable Variation vs True/Critical Error counts and rate bar.
  - **Defect Distribution & Word-Level Defect Heatmap:** Render both `#chart-defect-distribution` and `#analytics-word-heatmap-tbody` (from `data.word_defect_heatmap`), showing word text, error code, model, and failure count.

### 4.2 Per-Rater Management Panel (`#analytics-raters-tbody`)
- Shows each rater in the selected study: `Rater Name`, `Completed (N / Total)`, `Avg Time / Item`, `Mean Score`, `Defects Flagged`, and Actions:
  - **Filter** (filters the Results & Evaluations Inspector to that rater)
  - **Clear from Study** (`DELETE /api/raters?id=...&campaign_id=...` with confirmation)
  - **Delete Rater** (`DELETE /api/raters?id=...` with confirmation)

### 4.3 Full Individual Evaluation Inspector (`#analytics-evaluations-tbody` + `#modal-inspect-evaluation`)
- Paginated/filterable table of all evaluations for the selected study (filtered by Model, Rater, and search text).
- Clicking **Inspect** opens `#modal-inspect-evaluation` showing:
  - Item key, model name, rater name, timestamp, duration
  - Inline HTML5 `<audio controls>` player for the evaluated audio file
  - All metric scores rendered cleanly as badges
  - ASR adjudication badge (if ASR)
  - All tagged waveform defect regions (`time_start_ms`–`time_end_ms`, `error_code`, `note`) and highlighted words (`word_text`, `error_code`)
  - Blind transcript & comments
  - **Delete Evaluation** button (`DELETE /api/evaluations?id=...`) that deletes the row and reloads analytics.
