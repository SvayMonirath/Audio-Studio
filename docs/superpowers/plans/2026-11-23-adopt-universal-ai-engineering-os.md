# Universal AI Engineering OS Adoption Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely adopt the full Universal AI Engineering OS suite (canonical `AGENTS.md`, harness adapters `CLAUDE.md`/`GEMINI.md`/Copilot, `REVIEW.md`, reviewer personas, governance docs, templates, and package validator) into Audio Studio, customized to its verified zero-external-dependency architecture.

**Architecture:** Adopt a single canonical root contract (`AGENTS.md`) tailored to Audio Studio with thin harness adapters (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) importing it. Migrate reviewer personas (`reviewers/`), governance documents (`docs/`), templates (`templates/`), and verification scripts (`scripts/`) without altering existing Audio Studio code, audio assets, or database files.

**Tech Stack:** Python 3.9+ standard library, SQLite 3, Vanilla JS / Web Audio API, Markdown.

**Spec:** [Universal-AI-Engineering-OS/docs/INITIALIZATION.md](file:///Users/sorpheatepy/CADT/year-3/capstone/Audio-Studio/Universal-AI-Engineering-OS/docs/INITIALIZATION.md)

## Global Constraints

- Never overwrite or discard user changes in `public/js/admin_app.js`.
- Never overwrite the repository's primary [README.md](file:///Users/sorpheatepy/CADT/year-3/capstone/Audio-Studio/README.md).
- Preserve the zero-external-dependencies Python constraint (no pip, no virtualenv requirements).
- Preserve existing test command: `python3 -m unittest discover -s tests -v`.
- All adapters (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) must point to `@./AGENTS.md`.
- No broken markdown cross-links across the documentation suite.

## Review Focus

- Broken relative links between root markdown documents and `docs/` or `reviewers/`.
- Overwriting existing Audio Studio documentation or assets in `docs/images/` or `docs/superpowers/`.
- Hardcoding fake lessons or dummy incidents in `REVIEW.md`.
- Disruption to the 14 existing automated unit tests.
- Divergence between `AGENTS.md` rules and actual codebase constraints (e.g. claiming npm/pip scripts exist).

---

### Task 1: Stash or Commit Pre-existing User Edits in `admin_app.js`

**Files:**
- Modify: `public/js/admin_app.js`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: Working tree status from `git status --short --branch`.
- Produces: Clean git working tree or committed baseline commit `feat(admin): allow single-model study creation`.

- [ ] **Step 1: Check existing working tree status**

Run: `git status --short --branch`
Expected: `M public/js/admin_app.js`

- [ ] **Step 2: Run test suite to verify current changes pass**

Run: `python3 -m unittest discover -s tests -v`
Expected: 14 tests pass (`OK`).

- [ ] **Step 3: Commit user's pending changes in `admin_app.js`**

Run:
```bash
git add public/js/admin_app.js
git commit -m "feat(admin): support single-model study creation with default candidate fallback"
```

- [ ] **Step 4: Verify clean working tree**

Run: `git status --short --branch`
Expected: Only untracked directories (`.superpowers/`, `Universal-AI-Engineering-OS/`, `docs/superpowers/`) remain.

---

### Task 2: Adopt Canonical `AGENTS.md` Customized for Audio Studio

**Files:**
- Create: `AGENTS.md`

**Interfaces:**
- Consumes: Verified commands and constraints from [README.md](file:///Users/sorpheatepy/CADT/year-3/capstone/Audio-Studio/README.md) and [Universal-AI-Engineering-OS/AGENTS.md](file:///Users/sorpheatepy/CADT/year-3/capstone/Audio-Studio/Universal-AI-Engineering-OS/AGENTS.md).
- Produces: Root canonical instructions read by all AI harnesses.

- [ ] **Step 1: Draft tailored `AGENTS.md` at repository root**

Create `AGENTS.md` integrating the Universal OS contract with Audio Studio specifics:
- Zero third-party Python dependencies (`http.server`, `sqlite3` only).
- Verified test suite command: `python3 -m unittest discover -s tests -v`.
- Server execution command: `python3 run_server.py --port 8000`.
- Security boundary: Admin PIN protection on `/api/admin/*`, unauthenticated evaluator flow on `/eval.html`.
- Knowledge map linking to `docs/` and `reviewers/`.

- [ ] **Step 2: Validate syntax and content**

Run: `test -f AGENTS.md && grep -q "python3 -m unittest" AGENTS.md && echo "AGENTS.md valid"`
Expected: `AGENTS.md valid`

- [ ] **Step 3: Commit `AGENTS.md`**

```bash
git add AGENTS.md
git commit -m "docs(agents): install tailored canonical AGENTS.md operating contract"
```

---

### Task 3: Install Multi-Harness Adapters (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`)

**Files:**
- Create: `CLAUDE.md`
- Create: `GEMINI.md`
- Create: `.github/copilot-instructions.md`

**Interfaces:**
- Consumes: Root `AGENTS.md`.
- Produces: Agent adapters pointing `@./AGENTS.md`.

- [ ] **Step 1: Create `CLAUDE.md` and `GEMINI.md`**

Copy adapters from `Universal-AI-Engineering-OS/CLAUDE.md` and `Universal-AI-Engineering-OS/GEMINI.md` to root.

- [ ] **Step 2: Create `.github/copilot-instructions.md`**

Create directory `.github/` and copy `Universal-AI-Engineering-OS/.github/copilot-instructions.md`.

- [ ] **Step 3: Verify all adapters reference `AGENTS.md`**

Run:
```bash
grep -q "@./AGENTS.md" CLAUDE.md && grep -q "@./AGENTS.md" GEMINI.md && grep -q "AGENTS.md" .github/copilot-instructions.md && echo "Adapters valid"
```
Expected: `Adapters valid`

- [ ] **Step 4: Commit adapters**

```bash
git add CLAUDE.md GEMINI.md .github/copilot-instructions.md
git commit -m "docs(adapters): add Claude, Gemini, and GitHub Copilot harness entrypoints"
```

---

### Task 4: Install Review Ledger (`REVIEW.md`), Reviewer Personas, Templates & OS Docs

**Files:**
- Create: `REVIEW.md`
- Create: `reviewers/architect.md`
- Create: `reviewers/adversarial.md`
- Create: `reviewers/reliability.md`
- Create: `reviewers/security.md`
- Create: `reviewers/test-quality.md`
- Create: `templates/ADR.md`
- Create: `templates/REVIEW_FINDING.md`
- Create: `templates/FINAL_REPORT.md`
- Create: `docs/OPERATING_MODEL.md`
- Create: `docs/MULTI_AGENT_REVIEW.md`
- Create: `docs/QUALITY_MODEL.md`
- Create: `docs/COMPATIBILITY.md`
- Create: `docs/DECISION_GOVERNANCE.md`
- Create: `docs/INITIALIZATION.md`
- Create: `docs/RESEARCH_REPORT.md`
- Create: `docs/VALIDATION_SCENARIOS.md`
- Create: `docs/FINAL_AUDIT.md`

**Interfaces:**
- Consumes: Templates and documentation from `Universal-AI-Engineering-OS/`.
- Produces: Complete governance, reviewer personas, and decision templates at root and `docs/`.

- [ ] **Step 1: Install `REVIEW.md` with zero fabricated incidents**

Copy `Universal-AI-Engineering-OS/REVIEW.md` to root. Verify ledger index is empty of fake history.

- [ ] **Step 2: Copy reviewer personas into `reviewers/`**

Copy all 5 markdown files from `Universal-AI-Engineering-OS/reviewers/` to `reviewers/`.

- [ ] **Step 3: Copy templates into `templates/`**

Copy all 3 template files from `Universal-AI-Engineering-OS/templates/` to `templates/`.

- [ ] **Step 4: Copy OS documentation into `docs/`**

Copy the 9 OS documentation files from `Universal-AI-Engineering-OS/docs/` into `docs/` (preserving `docs/images/` and `docs/superpowers/`).

- [ ] **Step 5: Commit governance files, reviewers, and docs**

```bash
git add REVIEW.md reviewers/ templates/ docs/*.md
git commit -m "docs(governance): install AI Engineering OS reviewers, templates, and operating docs"
```

---

### Task 5: Install Package Validator & Run Complete Verification

**Files:**
- Create: `scripts/validate_package.py`

**Interfaces:**
- Consumes: Entire installed OS file suite.
- Produces: Automated standard-library verification script.

- [ ] **Step 1: Copy `validate_package.py` into `scripts/`**

Copy `Universal-AI-Engineering-OS/scripts/validate_package.py` to `scripts/validate_package.py` and ensure it is executable (`chmod +x scripts/validate_package.py`).

- [ ] **Step 2: Run `validate_package.py`**

Run: `python3 scripts/validate_package.py`
Expected: Clean execution with exit code 0 and zero missing file or broken link errors.

- [ ] **Step 3: Run the Audio Studio automated test suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: All 14 tests pass (`OK`).

- [ ] **Step 4: Commit validator and cleanup staging**

```bash
git add scripts/validate_package.py
git commit -m "chore(scripts): install validate_package.py standard library package validator"
```
