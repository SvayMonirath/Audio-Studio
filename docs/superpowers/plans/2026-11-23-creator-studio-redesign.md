# Creator Studio UX/UI Redesign & De-Clutter Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Study Creator Wizard from a cluttered, text-heavy prototype with 16 nested card warnings and hardcoded model defaults into an elegant, focused, high-contrast research studio interface.

**Architecture:**
1. Zero out hardcoded default models (`models: []`) so every study starts clean and empty. Model identities are either inferred automatically from CSV manifests/folders or created intentionally by the user.
2. Unify Step 2 into a single drag-and-drop zone that accepts both Audio files and CSV pairing manifests in one drop, eliminating 3 stacked competing boxes and reducing copy by ~75%.
3. Promote the main container from `max-w-4xl` to `max-w-6xl` (responsive fluid) so the 3-Zone Modular Builder in Step 3 has breathing room without horizontal cramping or text wrapping.
4. Upgrade the review table in Step 2 with proper column proportions, expandable text inputs, and clean audio preview controls.

**Tech Stack:** Vanilla JavaScript (ES6+), Tailwind CSS (CDN), SQLite3, HTML5 Audio / Web Audio API.

**Spec:** Impeccable Critique and UX Audit in session `ae9a7171-c0bb-42cc-8abf-615893857dd7`.

---

## Global Constraints

- **No external npm/Node dependencies**: Use vanilla JavaScript and Tailwind CSS via CDN.
- **Zero hardcoded models in state**: New studies must initialize with `models: []`.
- **Plain English first**: Eliminate repetitive gray paragraphs; use concise labels and purposeful placeholders.
- **Zero emojis**: No emojis in UI buttons, code, console logs, or status text.
- **Pass all automated server tests**: Maintain 100% pass rate in `tests/test_server.py`.

---

## Review Focus

The five critical failure modes this plan guards against:
1. **Empty Model Crash on Launch**: If a user uploads audio without defining models, the backend or wizard must gracefully fall back to a clean default (e.g., `Custom Model` or file stem) without throwing a 400 or null reference.
2. **Audio + CSV Ingestion Collision**: Dropping a mixed folder containing both WAV files and a CSV manifest in the unified dropzone must pair correctly without duplicate entries or race conditions.
3. **Step 3 Mobile/Tablet Overflow**: Widening the workspace to `max-w-6xl` must remain fully responsive and stack neatly into a single column on tablet/mobile screens (`lg:grid-cols-12`).
4. **Contrast and Disabled States**: The ASR "Coming Soon" card must remain clearly disabled while maintaining legible contrast that passes WCAG AA.
5. **Table Preview Usability**: Audio preview buttons in the review table must not clip or distort on different screen resolutions.

---

## File Structure

```
Audio-Studio/
├── public/
│   ├── admin.html       # De-clutter Step 2 (unified dropzone), expand width to max-w-6xl, clean typography
│   └── js/
│       └── admin_app.js # models: [] initialization, unified drop handler, streamlined state
└── tests/
    └── test_server.py   # Regression & integration tests
```

---

## Implementation Tasks

### Task 1: Clean State Model Initialization & Zero-Model Safeguards

**Files:**
- Modify: `public/js/admin_app.js:23-30, 610-685, 1260-1360`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `state.wizardData.models`.
- Produces: `wizardData.models = []` as initial state. When files are uploaded without configured models, `resolveItemModelName()` safely falls back to `"Candidate Model"` instead of throwing an undefined error.

- [ ] **Step 1: Write test in `tests/test_server.py` for empty models payload**
Verify `POST /api/campaigns` and `POST /api/suites` function without pre-existing model records.

- [ ] **Step 2: Update `state.wizardData.models` in `public/js/admin_app.js`**
Set `models: []` by default in `state.wizardData`.
In `renderModelsChips()`, if `models.length === 0`, render a quiet, compact prompt: `"No comparison models added yet (Single model study)."` with a clean `+ Add Model` button.
In `setupAudioUploads()`, if audio is uploaded when `models.length === 0`, auto-create a default model `"Candidate Model"` or extract from file/folder metadata.

- [ ] **Step 3: Run tests to verify**
Run: `python3 tests/test_server.py`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add public/js/admin_app.js tests/test_server.py
git commit -m "fix(admin): initialize empty models state and add graceful fallbacks"
```

---

### Task 2: De-Clutter Step 2 HTML (Unified Dropzone & 75% Text Reduction)

**Files:**
- Modify: `public/admin.html:290-585`

**Interfaces:**
- Consumes: File drop events (WAV, MP3, CSV).
- Produces: Single unified drop target `#dropzone-unified`, clean inline models pill bar, and quiet secondary links for Local Folder Binding and AI prompts.

- [ ] **Step 1: Refactor Step 2 Header**
- Keep title: `"Audio & Transcripts"`.
- Remove redundant gray subtitle paragraphs.
- Move "Copy AI Agent Prompt", "Load Demo", and "CSV Template" into a clean secondary utility button group or discreet link bar on the right.

- [ ] **Step 2: Replace 3 Competing Cards with Unified Dropzone**
- Replace separate audio dropzone, CSV dropzone, and local folder input with:
  1. A single high-contrast unified drop target:
     `#dropzone-unified` with message: `"Drop speech audio (.wav, .mp3) and transcript (.csv) here, or click to browse"`.
  2. A clean secondary disclosure link: `[Link local server folder]` which reveals `#box-link-folder` only on demand.
  3. Strip out the 18+ noisy gray subtitle sentences identified in the audit.

- [ ] **Step 3: Polish Test Items Review Table**
- Fix table column constraints: give Khmer Transcript flexible width with wrapping, provide compact audio preview button with mini play toggle, and clean model badges.

- [ ] **Step 4: Commit**
```bash
git add public/admin.html
git commit -m "refactor(admin): unify Step 2 dropzone and eliminate explanatory text clutter"
```

---

### Task 3: Wire Unified Dropzone & Auto-Detection Logic in JS

**Files:**
- Modify: `public/js/admin_app.js:685-980`

**Interfaces:**
- Consumes: Mixed `FileList` from `#dropzone-unified` containing audio files and/or CSV files.
- Produces: Automatically routes audio files to `processAudioFiles()` and CSV files to `processCsvFile()`, then triggers `reconcileAudioAndText()`.

- [ ] **Step 1: Implement unified drop listener**
In `setupAudioUploads()`:
- Wire `#dropzone-unified` dragover, dragleave, drop, and file input change events.
- Separate dropped files into `audioFiles` (matching `.wav|.mp3`) and `csvFiles` (matching `.csv|.txt`).
- If both are dropped simultaneously, await audio loading, then immediately parse the CSV and run automatic reconciliation.

- [ ] **Step 2: Wire clean local folder linking disclosure**
Ensure `#btn-toggle-local-folder` smoothly toggles `#box-link-folder`.

- [ ] **Step 3: Syntax check with node**
Run: `node -c public/js/admin_app.js`
Expected: Clean exit code 0.

- [ ] **Step 4: Commit**
```bash
git add public/js/admin_app.js
git commit -m "feat(admin): implement unified multi-file audio and CSV drop handler"
```

---

### Task 4: Expand Viewport Width & Polish Step 3 Canvas Layout

**Files:**
- Modify: `public/admin.html:200-220, 588-660`
- Modify: `public/css/style.css`

**Interfaces:**
- Consumes: `<main class="max-w-4xl">`.
- Produces: `<main class="max-w-6xl">` with optimized 3-zone grid proportions (`lg:grid-cols-12`: Toolbox 3 cols, Canvas 5 cols, Inspector 4 cols) that no longer cause horizontal cramping.

- [ ] **Step 1: Update container class in `public/admin.html`**
Change `<main class="flex-1 max-w-4xl w-full mx-auto p-6">` to `<main class="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 transition-all">`.

- [ ] **Step 2: Clean up nested borders in Step 3**
Remove redundant card borders (`border-zinc-200`) and nested background tints from Toolbox and Inspector, establishing clean visual hierarchy with consistent 1px borders and subtle shadow tokens.

- [ ] **Step 3: Run mechanical detector to verify card count reduction**
Run: `/Users/sorpheatepy/.gemini/antigravity-cli/skills/impeccable/scripts/impeccable detect --json public/admin.html`
Expected: Dramatic drop in `nested-cards` warnings.

- [ ] **Step 4: Commit**
```bash
git add public/admin.html public/css/style.css
git commit -m "refactor(admin): expand studio width to max-w-6xl and de-nest Step 3 canvas panels"
```

---

### Task 5: End-to-End Visual & Functional Verification

**Files:**
- Modify: `tests/test_server.py`

**Interfaces:**
- Consumes: Updated markup and client scripts.
- Produces: Clean passing test suite and visual verification.

- [ ] **Step 1: Run full automated test suite**
Run: `python3 tests/test_server.py`
Expected: All 14 tests pass (`OK`).

- [ ] **Step 2: Final commit**
```bash
git add tests/test_server.py
git commit -m "test(admin): verify de-cluttered studio creator end-to-end"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-23-creator-studio-redesign.md`. Please review the plan. Does it capture what you want?
