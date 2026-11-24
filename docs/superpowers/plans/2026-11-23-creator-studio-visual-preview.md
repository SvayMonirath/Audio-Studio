# Creator Studio Visual Preview & Dropzone Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Audio Studio Creator wizard to provide immediate visual loading feedback on file drops, transform the Step 3 abstract node cards into a real WYSIWYG evaluation stage preview reusing client component aesthetics from `eval.html`, expand the canvas layout to eliminate center squishing, and purge confusing academic jargon and colorful circle dots in favor of clean, plain-English toolcards.

**Architecture:** 
1. In Step 2, update `admin.html` and `admin_app.js` with an animated spinner overlay and live processing counter (`Processing audio files (X / Y)...`) inside `#dropzone-unified` that disables pointer interactions during file reads and displays a clear completion confirmation.
2. In Step 3, rebalance the 12-column grid from `3-5-4` to `3-9` (or `3-6-3` flexible), expanding `#builder-canvas` into a prominent WYSIWYG Evaluation Stage Preview.
3. Replace the abstract 60px node cards with live rendered component mockups (Khmer text prompt with blur toggle, audio waveform player deck, interactive word pill tags, 2x2 rating criteria buttons, and transcription drawer) matching the visual language of `eval.html`.
4. Refactor the Toolbox items, Starter Kits, and inspector controls to eliminate rainbow circle dots (`bg-emerald-500`, etc.) and replace acoustic jargon with plain English.

**Tech Stack:** Vanilla ES6+ JavaScript, Tailwind CSS, HTML5 Canvas, Python standard library unittest.

**Spec:** `/Users/sorpheatepy/.gemini/antigravity-cli/brain/bdb50f76-f336-4ade-bc79-747f6d430c9a/assessment_a_design_review.md` and user feedback critique.

## Global Constraints
- Zero Third-Party Python Dependencies (standard library only).
- Pure vanilla JavaScript (no npm frameworks, no React/Vue/Svelte runtime).
- All 16 automated tests in `tests/test_server.py` must remain green.
- Plain English first: NO jargon or corporate fluff.
- NO EMOJIS in code, UI, or console logs.

## Review Focus
1. Dropping 50+ audio files must show the spinner and counter immediately without freezing or silent delays.
2. Dropping a mix of audio and CSV simultaneously must preserve reconciliation while maintaining loading feedback.
3. The preview canvas in Step 3 must render realistic components even before any study audio is loaded (using representative sample text and dummy waveform visualization).
4. Reordering components in the canvas with Move Up/Down must accurately update block sequences in `state.wizardData.ui_config.blocks`.
5. Toggling settings in the inspector (e.g. font size, blur gating, telephone filter, scoring scale) must instantly update the live preview component on the canvas without page reload.

---

### Task 1: Step 2 Dropzone Loading Spinner & Progress State

**Files:**
- Modify: `public/admin.html:380-405`
- Modify: `public/js/admin_app.js:758-790`, `public/js/admin_app.js:1152-1205`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `#dropzone-unified`, `#multi-file-input`
- Produces: Visual loading overlay `#dropzone-loading-overlay`, spinner `#dropzone-spinner`, text `#dropzone-loading-text`, helper functions `setDropzoneLoading(isLoading, current, total)`

- [ ] **Step 1: Write the failing test for dropzone loading overlay in `tests/test_server.py`**

Add `test_dropzone_loading_overlay_structure` in `tests/test_server.py`:
```python
def test_dropzone_loading_overlay_structure(self):
    """Verify public/admin.html contains the dropzone loading overlay and spinner elements."""
    admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
    with open(admin_html_path, "r", encoding="utf-8") as f:
        content = f.read()
    self.assertIn('id="dropzone-loading-overlay"', content)
    self.assertIn('id="dropzone-loading-text"', content)
    self.assertIn('id="dropzone-spinner"', content)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_dropzone_loading_overlay_structure -v`
Expected: FAIL with `AssertionError: 'id="dropzone-loading-overlay"' not found`

- [ ] **Step 3: Add loading overlay markup to `#dropzone-unified` in `public/admin.html`**

Inside `#dropzone-unified` in `public/admin.html`, add:
```html
<div
  id="dropzone-loading-overlay"
  class="hidden absolute inset-0 bg-white/90 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center gap-3 z-10 transition-opacity"
>
  <div id="dropzone-spinner" class="w-8 h-8 border-3 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div>
  <div id="dropzone-loading-text" class="text-xs font-semibold text-zinc-900">
    Processing files...
  </div>
</div>
```

- [ ] **Step 4: Implement progress state and async batching in `public/js/admin_app.js`**

1. Cache elements in `el`:
   ```javascript
   dropzoneLoadingOverlay: document.getElementById("dropzone-loading-overlay"),
   dropzoneLoadingText: document.getElementById("dropzone-loading-text"),
   ```
2. Implement `setDropzoneLoading(loading, message)`:
   - When `loading === true`: remove `hidden` from overlay, disable `#dropzone-unified` pointer events (`pointer-events-none`).
   - When `loading === false`: add `hidden` to overlay, re-enable pointer events.
3. In `handleUnifiedFiles(files)` and `processAudioFiles(files)`:
   - Show loading overlay before starting reads.
   - Update `el.dropzoneLoadingText.textContent = \`Reading audio samples (${i + 1} of ${total})...\`` periodically.
   - Wrap in `try ... finally` to ensure overlay is hidden and show a momentary success toast upon completion.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS (All 17 tests green)

- [ ] **Step 6: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): add visual loading spinner and progress counter to audio dropzone"
```

---

### Task 2: Purge Jargon & Rainbow Dots from Step 3 Toolbox & Starter Kits

**Files:**
- Modify: `public/admin.html:525-645`
- Modify: `public/js/admin_app.js:1555-1660`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `#builder-toolbox`, starter kit buttons (`#btn-kit-mos`, `#btn-kit-vocab`, `#btn-kit-arena`, `#btn-kit-blank`)
- Produces: Clean monochrome SVG icon toolcards with plain-English labeling and descriptive subtitles.

- [ ] **Step 1: Write the failing test for plain-English toolbox in `tests/test_server.py`**

Add `test_step3_plain_english_toolbox` in `tests/test_server.py`:
```python
def test_step3_plain_english_toolbox(self):
    """Verify Step 3 toolbox uses plain-English labels and clean icons without rainbow dots."""
    admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
    with open(admin_html_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Check plain English replacements
    self.assertIn("Audio Player & Audio Filters", content)
    self.assertIn("Prompt Text Card", content)
    self.assertIn("Word Glitch Highlighter", content)
    self.assertIn("Rating Questions", content)
    # Check starter kits plain English
    self.assertIn("Standard Voice Rating", content)
    self.assertIn("Hidden Prompt Test", content)
    self.assertIn("Model Comparison", content)
    # Confirm rainbow dot classes removed from toolbox items
    toolbox_section = content.split('id="builder-toolbox"', 1)[1].split('<!-- ZONE 2', 1)[0]
    self.assertNotIn("bg-emerald-500", toolbox_section)
    self.assertNotIn("bg-blue-500", toolbox_section)
    self.assertNotIn("bg-amber-500", toolbox_section)
    self.assertNotIn("bg-purple-500", toolbox_section)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step3_plain_english_toolbox -v`
Expected: FAIL with `AssertionError: 'Audio Player & Audio Filters' not found`

- [ ] **Step 3: Update `public/admin.html` with clean monochrome icons & plain English**

1. Replace Starter Kit buttons:
   - "Conversational MOS" &rarr; **"Standard Voice Rating (1–5)"**
   - "Blind Vocab Gating" &rarr; **"Hidden Prompt Test"**
   - "A/B Arena" &rarr; **"Model Comparison"**
2. Replace Toolbox item cards:
   - Remove `<span class="w-2 h-2 rounded-full bg-..."></span>`.
   - Add clean monochrome SVG icons (waveform icon, type 'T' icon, bookmark/tag icon, star rating icon, text diff icon).
   - Use plain-English headings:
     - `audio_player`: **"Audio Player & Audio Filters"** | *"Play bar, speed controls, phone simulation"*
     - `text_prompt`: **"Prompt Text Card"** | *"Khmer prompt text with optional hidden blur"*
     - `word_tagger`: **"Word Glitch Highlighter"** | *"Clickable words to flag pronunciation errors"*
     - `scoring_questions`: **"Rating Questions"** | *"1–5 Star scores or Pass/Fail questions"*
     - `transcription`: **"Heard Speech Comparison"** | *"What did the listener hear? with visual text diff"*

- [ ] **Step 4: Update starter kit labels and toast messages in `public/js/admin_app.js`**

Align `applyStarterKit()` in `admin_app.js` with the updated terminology and clean label values.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS (All 17 tests green)

- [ ] **Step 6: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): replace academic jargon and rainbow dots with plain English and clean icons"
```

---

### Task 3: Expand Step 3 Layout & Transform Center Preview into Smart WYSIWYG Canvas

**Files:**
- Modify: `public/admin.html:548-675`
- Modify: `public/js/admin_app.js:1718-1850`
- Modify: `public/css/style.css` (if needed for preview canvas styling)
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `state.wizardData.ui_config.blocks`, `state.selectedCardId`
- Produces: Live visual component renderers matching `eval.html` components (`renderWysiwygAudioPlayer`, `renderWysiwygPromptCard`, `renderWysiwygWordTagger`, `renderWysiwygScoringQuestions`, `renderWysiwygTranscription`).

- [ ] **Step 1: Write the failing test for layout grid and WYSIWYG preview markers in `tests/test_server.py`**

Add `test_step3_wysiwyg_canvas_structure` in `tests/test_server.py`:
```python
def test_step3_wysiwyg_canvas_structure(self):
    """Verify Step 3 canvas provides expansive layout and WYSIWYG preview container."""
    admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
    with open(admin_html_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Check expanded grid allocation (Canvas gets major width)
    self.assertIn('id="builder-canvas"', content)
    self.assertIn('lg:col-span-6', content) # Canvas expanded from 5 to at least 6 cols
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step3_wysiwyg_canvas_structure -v`
Expected: FAIL

- [ ] **Step 3: Rebalance grid layout in `public/admin.html`**

Update `admin.html`:
- Toolbox: `lg:col-span-3` (clean compact column)
- Canvas: `lg:col-span-6` (expansive WYSIWYG preview stage)
- Inspector: `lg:col-span-3` (focused properties sidebar)
Ensure viewport container accommodates the richer layout cleanly without squishing.

- [ ] **Step 4: Implement True Component Renderers in `renderCanvas()` in `public/js/admin_app.js`**

Replace the abstract 60px node cards with live component previews inspired by `eval.html`:
1. **Audio Player (`audio_player`)**:
   - Renders play/pause button, timecode (`0:00 / 0:04`), 50px SVG simulated waveform bar, speed pills (`0.8x`, `1.0x`), and telephone filter pill when active.
2. **Prompt Text Card (`text_prompt`)**:
   - Renders sample Khmer text (`អាឡូ សួស្តីបង! មានអីឲ្យខ្ញុំជួយបានខ្លះ?`) at the configured font size (`24px`, `32px`, `40px`).
   - If `mode === "blind_gated"`, applies blur overlay (`backdrop-blur-sm bg-white/70`) with "Click to reveal prompt" button.
3. **Word Glitch Highlighter (`word_tagger`)**:
   - Renders word tokens (`អាឡូ`, `សួស្តីបង!`, `មានអីឲ្យខ្ញុំជួយបានខ្លះ?`) styled as interactive pills.
   - Highlights a sample word in amber with a defect tag chip (`[Awkward Pause]`).
4. **Rating Questions (`scoring_questions`)**:
   - Renders 2-column grid of criteria cards with real clickable/visual radio rating circles (`1`, `2`, `3`, `4`, `5`).
5. **Heard Speech Comparison (`transcription`)**:
   - Renders the "What did you hear?" input box with colored visual diff tags (`អាឡូ [សួស្តី -> សួស្ដី] បង`).
6. **Container Action Strip**:
   - Each rendered component wrapper maintains a clean header strip with drag handle `☰`, component title, `Move Up ↑`, `Move Down ↓`, and `Delete ✕` controls, plus an active highlight border when selected.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS (All 17 tests green)

- [ ] **Step 6: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): render live WYSIWYG evaluation components in expanded Step 3 canvas"
```

---

### Task 4: Connect Live Inspector Controls to Instant Canvas Updates

**Files:**
- Modify: `public/js/admin_app.js:1850-2050`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: Inspector inputs (`#insp-prompt-size`, `#insp-prompt-mode`, `#insp-audio-phone`, `#insp-scoring-scale`, etc.)
- Produces: Instant reactive updates to the selected block in the WYSIWYG canvas without losing card selection or focus.

- [ ] **Step 1: Write unit test in `tests/test_server.py` to verify full campaign setup with modular ui_config**

Run the existing end-to-end integration tests to ensure campaign launching and serialization remain 100% compatible.

- [ ] **Step 2: Update `renderInspector()` event listeners in `public/js/admin_app.js`**

Ensure that changing any inspector control:
- Updates `selected` block properties in `state.wizardData.ui_config.blocks`.
- Calls `renderCanvas()` while preserving `state.selectedCardId` so the edited component remains highlighted.
- Keeps inspector input focus clean without flickering.

- [ ] **Step 3: Run the full test suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS (All 17 tests green in <2.5s)

- [ ] **Step 4: Commit**

```bash
git add public/js/admin_app.js
git commit -m "feat(admin): connect inspector controls to live reactive WYSIWYG canvas updates"
```

---

### Task 5: End-to-End Verification & Design Quality Pass

**Files:**
- Test: `scripts/validate_package.py`
- Test: `tests/test_server.py`

- [ ] **Step 1: Run package validation and full unit tests**

```bash
python3 scripts/validate_package.py
python3 -m unittest discover -s tests -v
```
Expected: All tests pass with zero warnings or errors.

- [ ] **Step 2: Check git diff and untracked files**

Inspect diffs to confirm no leftover debug code or unintended edits.

- [ ] **Step 3: Commit and log completion**

```bash
git commit --allow-empty -m "docs: complete creator studio visual preview and dropzone feedback implementation"
```
