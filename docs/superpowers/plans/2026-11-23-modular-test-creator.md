# Modular Test Creator & Smart Data Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Audio Studio study creation wizard into a scalable, flexible, 3-zone modular builder with fault-tolerant CSV/audio ingestion and AI helper prompts.

**Architecture:** 
1. Preserves the 4-step wizard structure.
2. Step 1 greys out ASR with a "Coming Soon" badge and locks TTS as the active modality.
3. Step 2 introduces a Smart Ingestion Engine that tolerates flexible CSV column headers, normalizes filenames (with or without `.wav`), supports multi-model folders, catches Excel non-UTF8 encoding issues, provides a visual reconciliation card with 1-click fixes, and offers two AI helper prompts (generation template + dynamic error fix).
4. Step 3 implements a 3-zone modular builder (Toolbox on left, dynamic reorderable Canvas in center, Inspector settings on right) with 1-click starter kits and a live floating Smart Feedback Bar calculating rater test time.
5. All component toggles persist into a unified `ui_config_json` field on the `campaigns` SQLite table, which the Evaluator Portal (`eval_app.js`) consumes to render active tools dynamically (such as the 8 kHz telephone switch, clickable word pills, and blind-gated blurred prompts).

**Tech Stack:** Python 3 (standard library `http.server`, `sqlite3`), Vanilla JavaScript (ES6+), Tailwind CSS (CDN), Web Audio API.

**Spec:** Audio Studio Architecture and Design Conversation `ae9a7171-c0bb-42cc-8abf-615893857dd7`.

---

## Global Constraints

- **No external npm/Node dependencies**: Use vanilla JavaScript and Tailwind CSS via CDN.
- **Plain English first**: UI labels and code comments must be simple, clear, and direct without unnecessary corporate or academic jargon.
- **Zero emojis**: Do not use emojis in UI buttons, code, console logs, or status strings. Use clean SVG icons or clear text tags.
- **SQLite backwards compatibility**: Use `ALTER TABLE` or `IF NOT EXISTS` migrations so existing database data is never lost.
- **Fast model executable**: All steps must be unambiguous with exact filenames, DOM element IDs, function signatures, and test commands specified.

---

## Review Focus

The five critical failure modes and edge cases this plan specifically guards against:
1. **Excel Non-UTF8 Khmer Mojibake**: A user saves a CSV in Excel on Windows/Mac without UTF-8, turning Khmer text into `?????`. The system must detect invalid byte sequences and display an actionable alert before saving.
2. **Missing Audio Files**: The CSV references 50 audio files, but only 48 were uploaded. The system must not crash or block; it must present a reconciliation card with 1-click "Skip Missing Rows" or "Upload Missing".
3. **Severe Evaluator Fatigue**: A user creates a 200-word test with mandatory typing enabled. The Smart Feedback Bar must flag an amber warning: *"Test will take ~75 mins and cause rater fatigue."*
4. **Multiple Blocks of Same Type**: A user adds two Audio Player blocks (e.g. Model Candidate vs. Ground Truth). Both must receive unique instance IDs and independent settings in the Inspector.
5. **Missing Critical Tools**: A user removes all audio players or all question sliders. The Smart Guide must display a red blocker preventing launch until at least one audio player and one question block are present.

---

## File Structure

```
Audio-Studio/
├── database.py                          # SQLite schema, migrations (ui_config_json), CRUD
├── run_server.py                        # REST API routing (/api/campaigns, /api/link-folder, etc.)
├── public/
│   ├── admin.html                       # 4-step wizard UI (ASR badge, smart ingestion, 3-zone canvas)
│   ├── eval.html                        # Evaluator portal shell (8 kHz phone toggle, word pills, blur)
│   └── js/
│       ├── admin_app.js                 # Wizard state, smart CSV parser, 3-zone drag & drop, inspector
│       └── eval_app.js                  # Dynamic mounting of active tools from ui_config_json
└── tests/
    └── test_server.py                   # Automated unit & integration tests
```

---

## Implementation Tasks

### Task 1: Database & API Backend (`ui_config_json` & Local Folder Linking)

**Files:**
- Modify: `database.py`
- Modify: `run_server.py`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: Existing SQLite tables (`campaigns`, `test_suites`, `test_items`).
- Produces: 
  - `database.py: init_db()` adds `ui_config_json TEXT` column to `campaigns` table if missing.
  - `database.py: create_campaign(..., ui_config_json=None)` persists layout JSON.
  - `run_server.py: handle_api_post("/api/link-folder")` verifies local folder path on server and returns discovered `.wav`/`.mp3` files.

- [ ] **Step 1: Write failing test in `tests/test_server.py`**
Add test `test_ui_config_and_folder_linking` testing:
1. `POST /api/campaigns` accepts `ui_config={"dsp": {"phone_filter_8khz": True}}` and persists it.
2. `GET /api/campaigns` returns the stored `ui_config_json`.
3. `POST /api/link-folder` with `{"folder_path": "audio"}` returns `{"success": true, "files": [...]}`.

- [ ] **Step 2: Run test to verify it fails**
Run: `python3 tests/test_server.py`
Expected: FAIL on missing `ui_config_json` or 404 on `/api/link-folder`.

- [ ] **Step 3: Implement database migration in `database.py`**
In `database.py`:
1. In `init_db()`, check if `ui_config_json` exists in `campaigns`; if not, execute:
   `ALTER TABLE campaigns ADD COLUMN ui_config_json TEXT;`
2. Update `create_campaign()` to accept `ui_config_json=None` and insert it into SQLite.
3. Update `get_campaigns()` and `get_campaign_by_id()` to return `ui_config_json`.

- [ ] **Step 4: Implement `/api/link-folder` in `run_server.py`**
In `run_server.py`:
1. Handle `POST /api/link-folder`: parse `folder_path`, verify it exists, scan for `.wav` and `.mp3` files, and return list of filenames and relative audio URLs.

- [ ] **Step 5: Run tests to verify they pass**
Run: `python3 tests/test_server.py`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**
```bash
git add database.py run_server.py tests/test_server.py
git commit -m "feat(backend): add ui_config_json support and local folder linking API"
```

---

### Task 2: Step 1 Wizard UI — Grey Out ASR & Add "Coming Soon" Badge

**Files:**
- Modify: `public/admin.html:227-254`
- Modify: `public/js/admin_app.js`

**Interfaces:**
- Consumes: Radio input `wiz-modality`.
- Produces: Disabled ASR radio option with visual grey-out styling and a pill badge `[Coming Soon / នៅពេលខាងមុខ]`. TTS remains permanently checked.

- [ ] **Step 1: Update ASR card in `public/admin.html`**
1. On `#opt-modality-asr`:
   - Add `opacity-50 cursor-not-allowed bg-zinc-100/70 border-dashed pointer-events-none` styling.
   - Set `<input type="radio" name="wiz-modality" value="ASR" disabled>`
   - Add badge next to title:
     `<span class="px-2 py-0.5 text-[10px] font-semibold bg-zinc-200 text-zinc-600 rounded-md uppercase tracking-wider">Coming Soon</span>`
2. Keep `#opt-modality-tts` active with `border-zinc-900 bg-zinc-50` and `<input type="radio" name="wiz-modality" value="TTS" checked>`.

- [ ] **Step 2: Update `public/js/admin_app.js`**
Ensure state initialization locks `wizardData.modality = "TTS"`. If an ASR event is triggered, ignore it.

- [ ] **Step 3: Manual browser verification**
Open `admin.html`, verify Voice Generation (TTS) is selected, and Speech Recognition (ASR) is disabled with the "Coming Soon" badge.

- [ ] **Step 4: Commit**
```bash
git add public/admin.html public/js/admin_app.js
git commit -m "feat(admin): grey out ASR modality with coming soon badge in Step 1"
```

---

### Task 3: Step 2 — Smart Ingestion & Reconciliation Engine

**Files:**
- Modify: `public/admin.html:292-515`
- Modify: `public/js/admin_app.js`

**Interfaces:**
- Consumes: Dropped/selected audio files + CSV file, or local folder path.
- Produces:
  - `parseCsvSmart(content)`: Auto-detects columns, strips quotes, handles embedded commas, checks UTF-8 BOM.
  - `reconcileAudioAndText(audioFiles, csvRows)`: Matches files via exact name, stem, or ID prefix.
  - Reconciliation card: renders `Matched`, `Missing Audio`, `Orphan Audio` count badges, 1-click play buttons in table, and 1-click action buttons (`Skip Missing`, `Upload Missing`, `Discard Orphans`).

- [ ] **Step 1: Update Step 2 HTML structure in `public/admin.html`**
Add:
1. Local folder path input row: `#input-local-folder-path` with button `#btn-link-local-folder`.
2. Flexible column selector modal/dropdown (hidden by default): `#box-column-fallback` with selects `#sel-col-text` and `#sel-col-audio`.
3. Reconciliation Summary Card container: `#reconciliation-card` with:
   - Badges: `#badge-matched-count`, `#badge-missing-count`, `#badge-orphan-count`.
   - Action buttons: `#btn-skip-missing-rows`, `#btn-upload-missing-files`, `#btn-discard-orphans`.
   - Missing files list container: `#missing-files-list`.
4. In matched items preview table (`#items-preview-tbody`), add a column with an interactive audio play button (`#btn-preview-audio-${index}`).

- [ ] **Step 2: Implement smart CSV parser in `public/js/admin_app.js`**
Write `parseCsvSmart(text)`:
1. Handle UTF-8 BOM (`\uFEFF`) stripping. Check for invalid Unicode replacement characters (`\uFFFD`).
2. Robust CSV line splitter that respects quoted strings containing commas.
3. Column header auto-detection:
   - Text column candidates: `["text", "tts_input", "prompt", "sentence", "transcript", "khmer_text"]`
   - Audio column candidates: `["audio_file", "filename", "file", "audio", "wav", "item_id", "id"]`
   - Model column candidates: `["model", "model_name", "system"]`
4. If no candidate matches, display `#box-column-fallback` so the user picks the column manually.

- [ ] **Step 3: Implement tolerant audio reconciliation logic**
Write `reconcileAudioAndText()`:
1. Normalize audio filenames: lower-cased stem without `.wav`/`.mp3`, stripped folder paths (`outputs/S01.wav` -> `s01`).
2. Pair rows:
   - Check exact filename (`S01.wav` == `S01.wav`).
   - Check stem match (`S01` == `S01.wav`).
   - Check prefix match (`S01` matches `S01_Greeting.wav`).
3. Partition results into `matched`, `missingAudio` (in CSV but no audio), and `orphans` (audio uploaded but no CSV row).
4. Render status badges and missing list. Wire 1-click actions:
   - `#btn-skip-missing-rows`: removes missing items from wizard dataset and proceeds.
   - `#btn-discard-orphans`: deletes orphan audio files from wizard items.

- [ ] **Step 4: Implement 1-click audio playback in table**
Add click listener for `.btn-row-audio-preview` to play the corresponding audio clip using standard HTML5 Audio.

- [ ] **Step 5: Verify with test CSV and audio files**
Test dropping `data/locked/scenarios_50.csv` and audio files. Verify matching succeeds even with different column names.

- [ ] **Step 6: Commit**
```bash
git add public/admin.html public/js/admin_app.js
git commit -m "feat(admin): implement smart tolerant CSV and audio reconciliation engine in Step 2"
```

---

### Task 4: Step 2 — AI Helper Prompt Generator System

**Files:**
- Modify: `public/admin.html:300-315`
- Modify: `public/js/admin_app.js`

**Interfaces:**
- Consumes: Matched/missing data state from Task 3.
- Produces:
  - Button `#btn-copy-ai-generation-prompt` in Step 2 header: copies audio generation prompt.
  - Button `#btn-copy-ai-fix-prompt` in `#reconciliation-card`: dynamically builds prompt with exact missing filenames and text, copying to clipboard.

- [ ] **Step 1: Add prompt buttons to `public/admin.html`**
1. Next to `#btn-download-csv-template`, add:
   `<button type="button" id="btn-copy-ai-gen-prompt" class="btn-ghost text-xs">Copy AI Generation Prompt</button>`
2. Inside `#reconciliation-card` (under missing files), add:
   `<button type="button" id="btn-copy-ai-fix-prompt" class="hidden px-3 py-1.5 text-xs bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition">Copy Fix Prompt for AI</button>`

- [ ] **Step 2: Implement prompt generator logic in `public/js/admin_app.js`**
1. In `btnCopyAiGenPrompt` click handler:
   Generate standard prompt explaining 16 kHz WAV requirements, CSV column headers, and UTF-8 encoding. Write to `navigator.clipboard.writeText()` and show toast.
2. In `btnCopyAiFixPrompt` click handler:
   Inspect `state.reconciliation.missingAudio`. Generate dynamic prompt:
   - List each missing item ID and its Khmer text.
   - Provide instruction for AI to generate a Python script to either re-generate audio or filter the CSV.
   Write to `navigator.clipboard.writeText()` and show toast.

- [ ] **Step 3: Verify clipboard output**
Click both buttons in browser; verify clipboard receives clean, formatted prompt text.

- [ ] **Step 4: Commit**
```bash
git add public/admin.html public/js/admin_app.js
git commit -m "feat(admin): add AI generation prompt and dynamic error fix prompt generator"
```

---

### Task 5: Step 3 — 3-Zone Dynamic Layout & Customization Canvas

**Files:**
- Modify: `public/admin.html:520-730`
- Modify: `public/js/admin_app.js`
- Modify: `public/css/style.css`

**Interfaces:**
- Consumes: Dataset from Step 2.
- Produces:
  - 1-Click Starter Kits (`#btn-kit-mos`, `#btn-kit-vocab`, `#btn-kit-arena`, `#btn-kit-blank`).
  - 3-Zone layout:
    - Zone 1 (`#builder-toolbox`): Draggable tool chips (Audio Player, Text Prompt, Word Pills, Questions, Transcription).
    - Zone 2 (`#builder-canvas`): Draggable card containers with drag handles (`☰`), selection border, and delete button (`✕`).
    - Zone 3 (`#builder-inspector`): Settings for the selected card (8 kHz phone filter toggle, speed buttons, blind-gating blur, 19 error codes, slider questions).
  - Serializes state into `state.wizardData.ui_config`.

- [ ] **Step 1: Replace Step 3 HTML in `public/admin.html`**
Construct the 3-zone layout:
1. Top bar: Starter Kit buttons (`Conversational MOS`, `Blind Vocab Gating`, `A/B Arena`, `Blank Canvas`).
2. Main area (`grid grid-cols-12 gap-5`):
   - Left Zone (Cols 1-3): `#builder-toolbox` with draggable block chips.
   - Center Zone (Cols 4-8): `#builder-canvas` holding active card blocks.
   - Right Zone (Cols 9-12): `#builder-inspector` with dynamic property controls.
3. Sticky bottom bar: `#smart-guide-bar` with test time estimate and warnings.

- [ ] **Step 2: Implement canvas block data model in `public/js/admin_app.js`**
Define block archetypes:
- `audio_player`: `{ id, label, source_model, phone_filter: false, speeds: true, auto_play: false }`
- `text_prompt`: `{ id, mode: "open"|"blind_gated", font_size: "32px", show_badges: true }`
- `word_tagger`: `{ id, mode: "both", active_taxonomies: "all", require_note: false }`
- `scoring_questions`: `{ id, scale_max: 5, criteria: [...] }`
- `transcription`: `{ id, enabled: true, show_diff: true }`

- [ ] **Step 3: Implement drag-and-drop & click insertion**
1. Add `draggable="true"` to toolbox chips.
2. In `#builder-canvas`, implement `dragover`, `dragleave`, `drop` handlers to append blocks.
3. Also support clicking `[+]` on a toolbox chip to immediately add it to the canvas.
4. Implement card reordering via drag handles (`.card-drag-handle`).
5. Implement card selection: clicking a card adds an active ring (`ring-2 ring-zinc-900`) and populates `#builder-inspector`.

- [ ] **Step 4: Implement Inspector panel controls**
When a card is selected, render its matching inspector drawer:
- For Audio: render 8 kHz telephone switch, speed controls, label input.
- For Prompt: render Blind-Gating blur toggle (Standard vs Blurred), font size selector.
- For Tagger: render tagging mode (Pills / Waveform / Both), error code checklist (19 codes).
- For Questions: render scale selector (1-5, 1-7, Pass/Fail), question list with add/delete.
- For Transcription: render show diff toggle.
Any change in the inspector immediately updates that block in the state and re-renders the card.

- [ ] **Step 5: Implement Starter Kit presets**
Wire `#btn-kit-mos`, `#btn-kit-vocab`, `#btn-kit-arena`, `#btn-kit-blank`:
- Clicking a kit clears canvas and loads the predefined block configuration for that test type.

- [ ] **Step 6: Commit**
```bash
git add public/admin.html public/js/admin_app.js public/css/style.css
git commit -m "feat(admin): implement 3-zone modular layout canvas and inspector sidebar in Step 3"
```

---

### Task 6: Step 3 — Live Smart Feedback Bar & Safety Auditor

**Files:**
- Modify: `public/admin.html`
- Modify: `public/js/admin_app.js`

**Interfaces:**
- Consumes: Items count from Step 2, active blocks from Step 3.
- Produces: Live updates to `#smart-guide-bar`:
  - Estimated time: `Math.round(itemCount * (avgAudioSec + questionCount * 3 + (hasTyping ? 15 : 0)) / 60)`.
  - Amber warnings (fatigue if > 25 mins; missing intelligibility question when phone filter active).
  - Red blockers (missing audio player or question block). Disables `#wiz-btn-step3-next` if critical blocker exists.

- [ ] **Step 1: Write `updateSmartGuide()` in `public/js/admin_app.js`**
Calculate:
1. `itemCount = state.wizardData.items.length || 50`
2. `questionCount = activeScoringBlocks.reduce(...)`
3. `hasPhoneFilter = activeAudioBlocks.some(b => b.phone_filter)`
4. `hasIntelligibility = activeQuestions.some(q => q.id === "intelligibility")`
5. `hasBlindGating = activePromptBlocks.some(b => b.mode === "blind_gated")`
6. `hasTranscription = activeBlocks.some(b => b.type === "transcription")`

- [ ] **Step 2: Generate feedback warnings & readiness status**
1. If `activeAudioBlocks.length === 0`: show Red Error *"Every test requires at least one Audio Player."*
2. If `activeScoringBlocks.length === 0`: show Red Error *"Please add at least one Scoring Question block."*
3. If `hasPhoneFilter && !hasIntelligibility`: show Amber Warning *"You enabled the 8 kHz Phone Filter; consider adding an Intelligibility question."*
4. If `itemCount > 100 && hasTranscription`: show Amber Warning *"Typing on 100+ items will cause rater fatigue (~" + estMinutes + " mins)."*
5. If no errors: show Green Check *"Layout is balanced and ready. Estimated time per rater: ~" + estMinutes + " mins."*
Disable/Enable `#wiz-btn-step3-next` accordingly.

- [ ] **Step 3: Test smart guide reactions**
In browser: remove audio player -> check red error appears; add phone filter -> check amber recommendation appears; select 200 items + transcription -> check fatigue alert appears.

- [ ] **Step 4: Commit**
```bash
git add public/admin.html public/js/admin_app.js
git commit -m "feat(admin): add live smart feedback bar and safety auditor in Step 3"
```

---

### Task 7: Step 4 Review & Evaluator Portal Dynamic Rendering

**Files:**
- Modify: `public/admin.html:740-830`
- Modify: `public/eval.html`
- Modify: `public/js/eval_app.js`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: Campaign launch payload with `ui_config_json`.
- Produces:
  - Step 4 review screen showing active tools summary.
  - `eval_app.js` reads `state.campaign.ui_config` and dynamically:
    - Renders the 8 kHz Phone Simulation toggle switch in header if `phone_filter_8khz` is true.
    - Blurs prompt text with a "Click to Reveal / Press Space" button if `blind_gated` is true.
    - Mounts clickable word pills under waveform if `word_pills` is true.
    - Mounts the configured 1-5 / 1-7 question sliders.

- [ ] **Step 1: Wire Step 4 Launch Review in `public/js/admin_app.js`**
In `renderWizardStep4()`:
1. Summarize: Title, Modality, Total Audio Items, Total Models, Active Tools (Phone filter, Blind gating, Word pills, Number of questions).
2. On `#wiz-btn-launch`, call `POST /api/campaigns` passing `ui_config_json: JSON.stringify(state.wizardData.ui_config)`.
3. Display share link box with 1-click clipboard copy.

- [ ] **Step 2: Update `public/eval.html` with modular hooks**
In `public/eval.html`:
1. In header: add `#phone-filter-wrapper` with `#btn-phone-filter-toggle` (hidden by default).
2. In prompt area: add `#prompt-gating-overlay` with `#btn-reveal-prompt` (hidden by default).
3. Under waveform: ensure `#word-pills-container` hook exists.

- [ ] **Step 3: Update `public/js/eval_app.js` to parse `ui_config`**
In `eval_app.js: initCampaign()`:
1. Parse `state.campaign.ui_config_json`.
2. If `ui_config.dsp?.phone_filter_8khz`: unhide `#phone-filter-wrapper` and wire toggle to `audioDsp.setPhoneFilter()`.
3. If `ui_config.presentation?.blind_gating`:
   - Apply `filter: blur(8px)` to prompt text.
   - Show `#prompt-gating-overlay`. Clicking `#btn-reveal-prompt` or pressing `Space` removes blur.
4. Render exact criteria sliders configured in `ui_config`.

- [ ] **Step 4: Verify dynamic evaluator portal**
Launch a test with Blind-Gating and 8 kHz Phone filter. Open evaluator link in browser: verify prompt is blurred, click Reveal unblurs, and 8 kHz telephone switch functions.

- [ ] **Step 5: Commit**
```bash
git add public/admin.html public/eval.html public/js/eval_app.js
git commit -m "feat(eval): dynamically mount modular tools from campaign ui_config"
```

---

### Task 8: End-to-End Verification & Integration Test

**Files:**
- Modify: `tests/test_server.py`

**Interfaces:**
- Consumes: All updated API endpoints and database migrations.
- Produces: Passing automated test suite.

- [ ] **Step 1: Write comprehensive integration test in `tests/test_server.py`**
Add `test_modular_campaign_end_to_end()`:
1. Initialize test database.
2. Create test suite with 5 items.
3. Post campaign with modular `ui_config` (phone filter, blind gating, 2 sliders).
4. Fetch campaign via `/api/campaigns` and verify `ui_config_json` matches.
5. Post evaluation from a rater.
6. Verify `/api/admin/summary` returns valid consensus metrics.

- [ ] **Step 2: Run all tests**
Run: `python3 tests/test_server.py`
Expected: PASS (all tests pass).

- [ ] **Step 3: Commit**
```bash
git add tests/test_server.py
git commit -m "test(integration): verify modular test creator and campaign persistence end-to-end"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-23-modular-test-creator.md`. Please review the plan. Does it capture what you want?