# Study Lifecycle, Navigation State, and Visual Results Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a seamless post-launch workflow in Step 4, smart navigation tab state ("Resume Draft" vs "Create New Study"), "Close Study" lifecycle enforcement for raters, interactive SVG analytical charts (MOS with 95% Confidence Intervals & 19-error code distribution), and strict study name double-confirmation to prevent accidental data loss.

**Architecture:** Frontend vanilla JavaScript with state-driven DOM rendering in `admin_app.js` and `eval_app.js`, accompanied by zero-dependency SVG charts rendered directly into the Results & Scores view. Backend enforcement in `run_server.py` ensures rater submissions to inactive studies are rejected with `403 Forbidden`, while SQLite maintains historical analytics for concluded studies.

**Tech Stack:** Python 3 standard library (`http.server`, `sqlite3`, `unittest`), Vanilla ES6+ JavaScript, HTML5 SVG, Tailwind CSS.

**Spec:** Aligned via `/grill-me` on 2026-11-24 in conversation session `e98b1d17-0e6e-4843-86c9-30a419cdc9cb`.

---

## Global Constraints

- **Zero Third-Party Python Dependencies**: Standard library only (`http.server`, `sqlite3`, `json`, `unittest`).
- **Zero Third-Party JS Charting Libraries**: Render charts via lightweight, scalable, zero-dependency inline SVG/DOM elements.
- **SQLite Foreign Key & Parameterization**: Always enforce `PRAGMA foreign_keys = ON;` and use `?` placeholders.
- **Admin PIN Authentication**: All administrative mutations (`/api/campaigns/status`, delete, exports) must verify `X-Admin-PIN` or `Authorization: Bearer pin-<token>`.
- **Rater Experience Invariant**: Clean English clinical taxonomy (19 codes) without redundant Khmer descriptions.
- **No Emojis**: Keep all UI labels, terminal outputs, and status banners strictly text-based.

---

## Review Focus

1. **Rater attempts submission to concluded study**: Returns clear 403 response on `/api/evaluations` and displays a polite "Study Concluded" banner.
2. **Draft state after launching**: Launching in Step 4 clears the localStorage draft snapshot so subsequent page loads start fresh or stay on the published confirmation.
3. **Accidental delete attempt**: Deleting a study requires entering the exact study name in a confirmation input before the delete button activates.
4. **Single-model results edge case**: Results & Scores chart renders gracefully when only 1 candidate model is tested without crashing or dividing by zero.
5. **Zero-evaluation study selected**: Results & Scores renders a dedicated empty state with a 1-click "Copy Rater Link" action instead of broken charts or NaN values.

---

## Tasks

### Task 1: Step 4 Post-Launch Experience & Clean Reset Flow

**Files:**
- Modify: `public/admin.html:790-820`
- Modify: `public/js/admin_app.js:3420-3460`
- Test: `tests/test_server.py:test_decluttered_admin_html_structure`

**Interfaces:**
- Consumes: `state.createdCampaignId`, `clearWizardDraft()`
- Produces: `resetWizardToStep1()`, DOM elements `#btn-create-another-study`, `#published-celebration-card`

- [ ] **Step 1: Write failing DOM/API test in `tests/test_server.py`**

```python
def test_step4_celebration_and_reset_structure(self):
    """Verify Step 4 contains celebration card and + Create Another Study button."""
    with open("public/admin.html", "r", encoding="utf-8") as f:
        html = f.read()
    self.assertIn('id="published-celebration-card"', html)
    self.assertIn('id="btn-create-another-study"', html)
    self.assertIn('id="btn-view-study-results"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step4_celebration_and_reset_structure -v`
Expected: FAIL with `AssertionError: 'id="published-celebration-card"' not found in ...`

- [ ] **Step 3: Implement celebration card and reset button in `public/admin.html` and `public/js/admin_app.js`**

1. In `public/admin.html`: Under `#shareable-link-container`, add `#published-celebration-card` with an animated checkmark, "Study Published & Live" status pill, and two primary action buttons: `#btn-create-another-study` ("+ Create Another Study") and `#btn-view-study-results` ("View Live Results").
2. In `public/js/admin_app.js`: Implement `resetWizardToStep1()`:
   - Call `clearWizardDraft()`.
   - Reset `state.wizardStep = 1`, `state.maxUnlockedStep = 1`, and re-initialize `state.wizardData`.
   - Clear input fields (`#wiz-study-name`, `#wiz-study-desc`, `#wiz-study-instructions`).
   - Clear items table, comparison models, and canvas blocks.
   - Hide `#shareable-link-container`, show `#launch-action-box`, and call `goToStep(1)`.
   - Wire `#btn-create-another-study` click handler to `resetWizardToStep1()`.
   - Wire `#btn-view-study-results` to switch to `view-results` tab with `state.createdCampaignId` pre-selected.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_step4_celebration_and_reset_structure -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): add step 4 published celebration card and clean reset flow"
```

---

### Task 2: Smart Navigation Tab State ("Resume Draft" vs "Create New Study")

**Files:**
- Modify: `public/admin.html:145-168`
- Modify: `public/js/admin_app.js:180-215`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `DRAFT_STORAGE_KEY`, `state.wizardStep`, `state.maxUnlockedStep`
- Produces: `updateSmartTabLabel()`, DOM elements `#tab-btn-wizard-text`, `#tab-wizard-indicator-dot`

- [ ] **Step 1: Write failing test in `tests/test_server.py`**

```python
def test_smart_navigation_tab_structure(self):
    """Verify navigation header supports dynamic draft status indicator."""
    with open("public/admin.html", "r", encoding="utf-8") as f:
        html = f.read()
    self.assertIn('id="tab-btn-wizard-text"', html)
    self.assertIn('id="tab-wizard-indicator-dot"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_smart_navigation_tab_structure -v`
Expected: FAIL with `AssertionError: 'id="tab-btn-wizard-text"' not found in ...`

- [ ] **Step 3: Implement smart tab indicator in `public/admin.html` and `public/js/admin_app.js`**

1. In `public/admin.html`: Replace static text inside `#tab-btn-wizard` with `<span id="tab-wizard-indicator-dot" class="w-2 h-2 rounded-full bg-amber-500 hidden animate-pulse inline-block mr-1.5"></span><span id="tab-btn-wizard-text">Create New Study</span>`.
2. In `public/js/admin_app.js`: Implement `updateSmartTabLabel()`:
   - Check if an un-launched draft exists in `localStorage` with data (`name` or `items.length > 0`).
   - If draft exists: set text to `Resume Draft (Step ${state.wizardStep}/4)` and show `#tab-wizard-indicator-dot`.
   - If clean: set text to `Create New Study` and hide `#tab-wizard-indicator-dot`.
   - Call `updateSmartTabLabel()` on draft save, draft discard, wizard reset, and step navigation.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_smart_navigation_tab_structure -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(admin): dynamic smart tab label for in-progress study drafts"
```

---

### Task 3: Study Lifecycle Enforcement ("Close Study" & Rater Blocking)

**Files:**
- Modify: `run_server.py:730-770`
- Modify: `public/eval.html:90-130`
- Modify: `public/js/eval_app.js:200-240`
- Modify: `public/js/admin_app.js:3850-3885`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `/api/campaigns/status`, `campaign.is_active`
- Produces: HTTP 403 on `/api/evaluations` when `is_active == 0`, DOM `#study-concluded-banner` in `eval.html`

- [ ] **Step 1: Write failing test in `tests/test_server.py`**

```python
def test_inactive_study_rater_submission_blocked(self):
    """Verify raters cannot submit evaluations to a closed/inactive campaign."""
    # 1. Create campaign
    # 2. Toggle status to is_active = 0 via /api/campaigns/status
    # 3. Attempt POST to /api/evaluations
    # 4. Verify status code 403 Forbidden
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_inactive_study_rater_submission_blocked -v`
Expected: FAIL with `AssertionError: 201 != 403`

- [ ] **Step 3: Implement backend check and frontend concluded overlay**

1. In `run_server.py`: In `handle_api_evaluations_post()`, query `campaigns.is_active` for the given `campaign_id`. If `is_active == 0`, immediately return `{"error": "This study has been concluded and is no longer accepting submissions."}`, status=403.
2. In `public/eval.html`: Add `#study-concluded-banner` overlay inside `#rating-card` with an informative message: "This study has concluded. Thank you for your interest! No further ratings are being accepted."
3. In `public/js/eval_app.js`: In `init()`, inspect `state.campaign.is_active`. If `=== 0`, show `#study-concluded-banner`, disable `#btn-submit-next`, and prevent audio playback.
4. In `public/js/admin_app.js`: In `renderStudiesView()`, update the status toggle to explicitly read "Close Study" when active, and "Reopen Study" when concluded, updating the badge from "Active" (green) to "Concluded" (zinc).

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_inactive_study_rater_submission_blocked -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add run_server.py public/eval.html public/js/eval_app.js public/js/admin_app.js tests/test_server.py
git commit -m "feat(lifecycle): enforce closed study status and block rater submissions"
```

---

### Task 4: Interactive Visual Charts for Results & Scores

**Files:**
- Modify: `public/admin.html:820-880`
- Modify: `public/js/admin_app.js:3500-3650`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `/api/admin/summary?campaign_id=...` (`model_stats`, `defects_summary`)
- Produces: `renderMosComparisonChart(models)`, `renderDefectDistributionChart(defects)`

- [ ] **Step 1: Write failing test in `tests/test_server.py`**

```python
def test_results_and_scores_chart_containers(self):
    """Verify Results & Scores view contains containers for MOS comparison and defect charts."""
    with open("public/admin.html", "r", encoding="utf-8") as f:
        html = f.read()
    self.assertIn('id="chart-mos-comparison"', html)
    self.assertIn('id="chart-defect-distribution"', html)
    self.assertIn('id="analytics-empty-state"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_results_and_scores_chart_containers -v`
Expected: FAIL with `AssertionError: 'id="chart-mos-comparison"' not found in ...`

- [ ] **Step 3: Implement SVG charts and zero-evaluation empty state**

1. In `public/admin.html`: Add `#chart-mos-comparison` and `#chart-defect-distribution` containers inside `#view-results`. Add `#analytics-empty-state` with clean illustration and a "Copy Rater Link" button.
2. In `public/js/admin_app.js`:
   - If `total_evals === 0`: Hide chart containers and data tables; display `#analytics-empty-state` with link copy action.
   - If `total_evals > 0`:
     - Implement `renderMosComparisonChart(model_stats)`: Generate an SVG bar chart comparing each candidate model's Mean MOS (1-5 scale) with calculated 95% Confidence Interval error tick marks (`[ci95_low, ci95_high]`).
     - Implement `renderDefectDistributionChart(defects_summary)`: Generate a horizontal bar chart displaying frequency distribution across the 19 clinical speech error codes, colored by category dots.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_results_and_scores_chart_containers -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(analytics): render svg mos comparison chart and defect distribution"
```

---

### Task 5: Accidental Deletion Protection Modal with Name Double-Confirmation

**Files:**
- Modify: `public/admin.html:980-1020`
- Modify: `public/js/admin_app.js:3720-3755`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `studyToDelete.name`, `studyToDelete.id`
- Produces: DOM `#delete-study-confirm-input`, strict string match validation

- [ ] **Step 1: Write failing test in `tests/test_server.py`**

```python
def test_delete_modal_double_confirmation_input(self):
    """Verify study delete modal contains confirmation input and safe close prompt."""
    with open("public/admin.html", "r", encoding="utf-8") as f:
        html = f.read()
    self.assertIn('id="delete-study-confirm-input"', html)
    self.assertIn('id="delete-study-prompt-name"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_delete_modal_double_confirmation_input -v`
Expected: FAIL with `AssertionError: 'id="delete-study-confirm-input"' not found in ...`

- [ ] **Step 3: Implement name matching validation in `admin.html` and `admin_app.js`**

1. In `public/admin.html`: Update `#modal-delete-study` to display:
   - A caution notice recommending "Close Study" instead of deletion.
   - Instructions: "To permanently delete this study and all its recorded ratings, type `<span id="delete-study-prompt-name"></span>` below:".
   - Input `#delete-study-confirm-input`.
   - Disable `#btn-confirm-delete` by default.
2. In `public/js/admin_app.js`:
   - When the delete modal opens: populate `#delete-study-prompt-name` with `studyToDelete.name`, reset `#delete-study-confirm-input.value = ""`, and disable `#btn-confirm-delete`.
   - On `#delete-study-confirm-input` input event: enable `#btn-confirm-delete` only when input value exactly matches `studyToDelete.name`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_server.StudioServerTestCase.test_delete_modal_double_confirmation_input -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin_app.js tests/test_server.py
git commit -m "feat(safety): add study name confirmation to prevent accidental deletions"
```

---

### Task 6: Full Integration Verification & Package Validation

**Files:**
- Test: All tests in `tests/`
- Manifest: `scripts/validate_package.py`

- [ ] **Step 1: Execute complete automated test suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: 28/28 tests PASS with exit code 0.

- [ ] **Step 2: Execute package integrity validator**

Run: `python3 scripts/validate_package.py`
Expected: PACKAGE VALIDATION: PASS

- [ ] **Step 3: Execute AgentShield security audit**

Run: `npx --yes ecc-agentshield scan --path . --format text`
Expected: Grade A (100/100), 0 findings.

- [ ] **Step 4: Final commit**

```bash
git status
git commit -m "chore: verify complete study lifecycle and visual analytics suite"
```
