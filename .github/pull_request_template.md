## Summary of Changes
<!-- A clear, plain-English summary of what this PR introduces or fixes -->

### Capstone Milestone Alignment
- [ ] Sprint 1: Acoustic Baselines & Model Setup
- [ ] Sprint 2: Web Studio & Speech Evaluation Core
- [ ] Sprint 3: Evaluation Protocols (200 Words & 50 Scenarios)
- [ ] Infrastructure / Polish / Maintenance

---

## Operating Risk Classification
<!-- Classify change per docs/OPERATING_MODEL.md -->
- [ ] **T0 — Trivial**: Isolated typo, formatting, or documentation change.
- [ ] **T1 — Routine**: Localized feature or bugfix with verified boundaries.
- [ ] **T2 — Substantial**: Multi-module change, schema migration, or rubric addition.
- [ ] **T3 — High Consequence**: Security boundary, destructive data operation, or irreversible action.

---

## Architectural Invariants Verification
- [ ] **Zero External Python Dependencies**: Runs strictly on Python built-in standard library (`http.server`, `sqlite3`, `json`, `unittest`).
- [ ] **Relational Persistence**: Foreign key integrity enforced (`PRAGMA foreign_keys = ON;`), parameterized queries only.
- [ ] **Security Boundary**: Admin endpoints protected by PIN (`X-Admin-PIN` header / token).
- [ ] **Audio Asset Sanity**: No uncompressed multi-gigabyte audio blobs added to Git history without approval.

---

## Empirical Verification Proof
<!-- Paste the output from your local verification commands -->

### 1. Test Suite Output
```bash
python3 -m unittest discover -s tests -v
# Paste passing output here
```

### 2. Package Validation
```bash
python3 scripts/validate_package.py
# Paste PASS output here
```

### 3. Visual Verification (If UI was modified)
<!-- Attach screenshot of rater portal or admin console -->
| Surface | Screenshot / Visual Proof |
|---|---|
| Evaluator Portal (`eval.html`) | |
| Admin Console (`admin.html`) | |
