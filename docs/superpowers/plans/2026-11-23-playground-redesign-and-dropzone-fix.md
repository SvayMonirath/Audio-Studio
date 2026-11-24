# Creator Studio Playground Redesign & Dropzone Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix CSV-only upload freezing by providing full loading feedback, expand the Step 3 playground width to eliminate awkward blank side spacing, replace fake mockups with real data binding and the authentic 76px client waveform from `eval.html`, remove noisy starter kits, simplify toolbox labels, replace the bulky inspector with a collapsible "Customize" drawer that hides on deselect, and enable precise drag-and-drop insertion between canvas components.

**Architecture:**
1. In Step 2, update `public/js/admin_app.js` to ensure direct CSV uploads (via `dropzoneCsv` drop/change as well as `multiFileInput`) invoke `setDropzoneLoading()` with an animated spinner, preventing the perceived UI freeze.
2. In `public/admin.html` and `public/css/style.css`, expand the container width from `max-w-6xl` to `max-w-[1560px]` matching `eval.html`. Remove the noisy starter kits header.
3. Replace the 3-column fixed inspector with an expansive 2-column layout (Left: compact Toolbox, Center: dominant Evaluation Playground) plus a slide-over/collapsible "Customize" drawer (`#drawer-customize`) that appears only when a block is selected and automatically closes/minimizes when clicking on the active card again or clicking outside.
4. Replace hardcoded mockup text with real data dynamically bound from `state.wizardData.items[0]` (or clean placeholder if none uploaded). Replicate the exact 76px waveform deck from `eval.html` with play/pause circular button and real HTML5 canvas.
5. In `scoring_questions`, remove fake fallback criteria so it accurately renders 0 questions if empty; in `transcription`, dynamically show/hide the visual diff box based on `block.show_diff`.
6. Implement drag-and-drop insertion indicators (drop lines and preview placeholder) so users can drop toolbox items anywhere in the sequence, not just at the bottom.

**Tech Stack:** Vanilla ES6+ JavaScript, Tailwind CSS, HTML5 Canvas, Python standard library `unittest`.

**Spec:** User feedback critique and `public/eval.html` design system.

## Global Constraints
- Zero Third-Party Python Dependencies (built-in standard library only).
- Pure vanilla JavaScript (no npm frameworks, no React/Vue/Svelte).
- All automated tests in `tests/test_server.py` must remain 100% green.
- Plain English first: NO academic jargon or corporate fluff.
- NO EMOJIS in code, UI, or console logs.

## Review Focus
1. Dropping a standalone `.csv` file into `#dropzone-unified` or the hidden CSV dropzone must show the loading overlay immediately and hide upon completion.
2. Selecting a card in the playground must open the "Customize" drawer; clicking the same card again (or a close button) must deselect it and hide the drawer.
3. The waveform in the audio player block must render on a real `<canvas>` identical to `eval.html` with the 76px height and play/pause button.
4. If the user loaded real audio and transcripts in Step 2, Step 3 preview must display that real audio item's transcript and filename instead of hardcoded strings.
5. Removing all criteria from a rating questions block must show 0 criteria in the preview with an empty prompt, never phantom "Naturalness" questions.

---

### Task 1: Fix CSV Upload Loading State & Progress Feedback

**Files:**
- Modify: `public/js/admin_app.js:1159-1265`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `#dropzone-unified`, `#multi-file-input`, `#csv-file-input`, `processCsvFile(file)`, `setDropzoneLoading(loading, message)`
- Produces: Guaranteed spinner feedback on every CSV drop/selection route.

- [ ] **Step 1: Write the failing test for CSV loading state in `tests/test_server.py`**

Add `test_csv_upload_loading_state_wiring` in `tests/test_server.py`:
```python
def test_csv_upload_loading_state_wiring(self):
    """Verify admin_app.js wraps processCsvFile calls with setDropzoneLoading."""
    admin_js_path = os.path.join(TOOL_DIR, "public", "js", "admin_app.js")
    with open(admin_js_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Ensure processCsvFile itself or its callers trigger setDropzoneLoading
    self.assertIn('setDropzoneLoading(true, "Reading transcript', content)
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_csv_upload_loading_state_wiring -v`

- [ ] **Step 3: Update `processCsvFile` in `public/js/admin_app.js` to ensure loading overlay wraps execution**

Wrap `processCsvFile` internal reading with `setDropzoneLoading(true, "Reading and parsing CSV transcript...")` and `setDropzoneLoading(false)` in its `finally` block, ensuring that whether triggered via unified drop, file input, or fallback file picker, the loading spinner always displays.

- [ ] **Step 4: Run tests to verify**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/admin_app.js tests/test_server.py
git commit -m "fix(admin): ensure loading spinner displays during CSV transcript parsing"
```

---

### Task 2: Expand Viewport Width & Strip Starter Kit Noise

**Files:**
- Modify: `public/admin.html:205-215`, `public/admin.html:530-560`
- Modify: `public/js/admin_app.js:1605-1660`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `<main class="flex-1 ...">`, Step 3 header
- Produces: Expansive `max-w-[1560px]` layout matching `eval.html`, uncluttered Step 3 header without noisy starter kit buttons.

- [ ] **Step 1: Write the failing test in `tests/test_server.py`**

Add `test_step3_expanded_viewport_and_clean_header`:
```python
def test_step3_expanded_viewport_and_clean_header(self):
    """Verify admin.html uses max-w-[1560px] layout and starter kits noise is removed."""
    admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
    with open(admin_html_path, "r", encoding="utf-8") as f:
        content = f.read()
    self.assertIn("max-w-[1560px]", content)
    self.assertNotIn("Starter Kits:", content)
    self.assertNotIn("btn-kit-mos", content)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step3_expanded_viewport_and_clean_header -v`
Expected: FAIL

- [ ] **Step 3: Update `public/admin.html` and `public/js/admin_app.js`**

1. In `public/admin.html`:
   - Change `main` from `max-w-6xl` to `max-w-[1560px] w-full mx-auto p-4 sm:p-6 transition-all`.
   - In `#wizard-step-3`, remove the entire starter kits button row (`#btn-kit-mos`, `#btn-kit-vocab`, `#btn-kit-arena`, `#btn-kit-blank`).
   - Clean up header copy to be minimal:
     ```html
     <div class="flex items-center justify-between pb-3 border-b border-zinc-100">
       <div>
         <h2 class="text-base font-bold text-zinc-900 mb-0.5">Evaluation Stage Playground</h2>
         <p class="text-xs text-zinc-500">Design what listeners see and hear during testing.</p>
       </div>
     </div>
     ```
2. In `public/js/admin_app.js`: Remove starter kit event listeners gracefully or make them conditional.

- [ ] **Step 4: Run tests to verify**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): expand studio width to 1560px and remove starter kits clutter"
```

---

### Task 3: Collapsible "Customize" Drawer & Simplified Minimal Toolbox

**Files:**
- Modify: `public/admin.html:560-720`
- Modify: `public/js/admin_app.js:1680-1760`, `public/js/admin_app.js:1850-2050`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `#builder-toolbox`, `#builder-canvas`, `#drawer-customize`
- Produces: Collapsible customize drawer that hides when nothing is selected, simplified toolbox cards with 0 jargon.

- [ ] **Step 1: Write the failing test for Customize Drawer in `tests/test_server.py`**

Add `test_step3_customize_drawer_structure`:
```python
def test_step3_customize_drawer_structure(self):
    """Verify Step 3 contains the collapsible Customize Drawer."""
    admin_html_path = os.path.join(TOOL_DIR, "public", "admin.html")
    with open(admin_html_path, "r", encoding="utf-8") as f:
        content = f.read()
    self.assertIn('id="drawer-customize"', content)
    self.assertIn("Customize Component", content)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step3_customize_drawer_structure -v`
Expected: FAIL

- [ ] **Step 3: Update `public/admin.html` with expansive 2-column layout + slide-over Customize drawer**

1. Rebalance grid in `admin.html`:
   - Left Toolbox: `w-64 shrink-0` (minimal vertical strip).
   - Center Playground Canvas: `flex-1 min-w-0` (takes full remaining width).
   - Right Customize Drawer: `#drawer-customize` as a slide-over panel or right column that starts `hidden` (no waste of space when unselected).
2. Simplify toolbox cards:
   - "Audio Player" (*Play bar, speeds, phone filter*)
   - "Prompt Text" (*Transcript text with optional hidden blur*)
   - "Word Highlighter" (*Flag pronunciation glitches on words*)
   - "Rating Scale" (*1–5 Stars or Pass/Fail questions*)
   - "Listener Hearing" (*What did the listener hear?*)
3. Customize drawer header:
   - "Customize Component" with a close button (`✕`) and subtitle showing which component is being edited.

- [ ] **Step 4: Update selection and drawer behavior in `public/js/admin_app.js`**

1. If clicking a card that is already selected (`block.id === state.selectedCardId`):
   - Set `state.selectedCardId = null`.
   - Hide `#drawer-customize`.
   - Re-render canvas to clear active ring.
2. If clicking a card that is unselected:
   - Set `state.selectedCardId = block.id`.
   - Remove `hidden` from `#drawer-customize`.
   - Populate customize controls.
3. Clicking drawer close button hides drawer and sets `state.selectedCardId = null`.

- [ ] **Step 5: Run tests to verify**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): implement collapsible customize drawer and simplified toolbox"
```

---

### Task 4: Client Waveform Parity & Real Data Binding

**Files:**
- Modify: `public/js/admin_app.js:1760-1970`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `state.wizardData.items`, `public/eval.html` waveform deck
- Produces: True 76px client waveform canvas preview, real study transcript data binding, clean empty states without fake defaults.

- [ ] **Step 1: Write test for real client waveform canvas and zero-fake rating questions in `tests/test_server.py`**

Add `test_wysiwyg_real_waveform_and_no_fake_defaults`:
```python
def test_wysiwyg_real_waveform_and_no_fake_defaults(self):
    """Verify renderCanvas generates 76px waveform canvas structure matching eval.html."""
    admin_js_path = os.path.join(TOOL_DIR, "public", "js", "admin_app.js")
    with open(admin_js_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Verify waveform uses canvas with 76px height like eval.html
    self.assertIn('preview-waveform-canvas', content)
    self.assertIn('76px', content)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_wysiwyg_real_waveform_and_no_fake_defaults -v`
Expected: FAIL

- [ ] **Step 3: Refactor component renderers in `public/js/admin_app.js`**

1. **Audio Player**:
   - Replace SVG bar rectangles with the exact 76px waveform deck from `eval.html`:
     ```html
     <div class="audio-player-deck p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center gap-4">
       <button type="button" class="w-12 h-12 flex-shrink-0 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-sm">
         <svg class="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
       </button>
       <div class="flex-1 min-w-0 flex flex-col gap-1.5">
         <div class="flex items-center justify-between text-[11px] text-zinc-500">
           <span class="font-medium text-xs font-mono">0.00s / 3.42s</span>
           <span class="text-zinc-400">Click & drag on waveform to tag defect</span>
         </div>
         <div class="rounded-lg overflow-hidden h-[76px] bg-zinc-900 relative">
           <canvas class="preview-waveform-canvas w-full h-[76px] block"></canvas>
         </div>
       </div>
     </div>
     ```
   - Draw realistic audio waveform bars onto the `<canvas>` dynamically using `canvas.getContext('2d')`.
2. **Prompt Text & Real Data Binding**:
   - Instead of hardcoding `"អាឡូ សួស្តីបង!..."`, check `state.wizardData.items[0]`.
   - If real items exist in the study, use `state.wizardData.items[0].text` and `state.wizardData.items[0].filename`.
   - Only fall back to `"អត្ថបទគំរូសម្រាប់វាយតម្លៃ (Sample Transcript)"` if no items have been uploaded yet.
3. **Scoring Questions**:
   - If `block.criteria` is empty, render an empty prompt:
     `"No rating questions added yet. Click to add your first question."`
   - NEVER inject fake "Naturalness" or "Pronunciation" questions when the user deleted them.
4. **Heard Speech Comparison**:
   - If `block.show_diff === false`, do NOT render the diff comparison box; render only the listener transcription input.

- [ ] **Step 4: Run tests to verify**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): render authentic 76px client waveform, real data binding, and true criteria states"
```

---

### Task 5: Smooth Drag-and-Drop Insertion with Target Placement Indicator

**Files:**
- Modify: `public/js/admin_app.js:1725-1770`
- Modify: `public/css/style.css`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `#builder-canvas`, `.toolbox-item`, `.card-drag-handle`
- Produces: Visual drop insertion preview line/indicator and arbitrary index insertion (top, middle, bottom).

- [ ] **Step 1: Implement insertion index calculation and visual drop marker in `public/js/admin_app.js`**

1. When dragging a toolbox item or dragging a canvas card:
   - Compute cursor `clientY` relative to existing cards in `#builder-canvas`.
   - Highlight the insertion point with a clean 2px animated drop line (`drop-target-indicator`).
2. On `drop`:
   - If dropped above card `idx`, insert the new or moved block at index `idx` (`blocks.splice(idx, 0, newBlock)`).
   - If dropped at the bottom, append.
3. Allow reordering canvas cards by dragging the handle `☰` to any position in the canvas with immediate visual feedback.

- [ ] **Step 2: Clean up Smart Guide Bar copy in `public/js/admin_app.js`**

Replace harsh "Blocker: Missing..." copy:
- If audio player is missing: `"Tip: Add an Audio Player so listeners can play the sound."`
- If questions are missing: `"Tip: Add at least one Rating Question to collect scores."`
- Clean, calm tone without alarmist red text.

- [ ] **Step 3: Run full verification suite**

Run: `node -c public/js/admin_app.js && python3 -m unittest discover -s tests -v`
Expected: PASS (All 20+ tests green)

- [ ] **Step 4: Commit**

```bash
git add public/js/admin_app.js public/css/style.css tests/test_server.py
git commit -m "feat(admin): add visual drag-and-drop insertion indicator and clean helper feedback"
```

---

### Task 6: End-to-End Verification & Validation

**Files:**
- Test: `scripts/validate_package.py`
- Test: `tests/test_server.py`

- [ ] **Step 1: Run package validation and unit tests**

```bash
python3 scripts/validate_package.py
python3 -m unittest discover -s tests -v
```
Expected: All tests pass with zero warnings or errors.

- [ ] **Step 2: Check git diff and untracked files**

Inspect diffs to confirm no leftover debug code or unintended edits.

- [ ] **Step 3: Commit and record completion**

```bash
git commit --allow-empty -m "docs: complete playground redesign and dropzone feedback implementation"
```
