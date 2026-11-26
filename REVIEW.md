# REVIEW.md — Engineering review and learning ledger

**Purpose:** make verified, reusable mistakes progressively harder to repeat. This file is both (1) a compact universal final-review checklist and (2) the index/ledger for project-specific lessons.

> Initial state: no project-specific mistakes have been supplied for this package. Therefore the historical lesson ledger is intentionally empty. Do not invent incidents to make it look populated.

## How to use this file

1. Before a task, select lessons by topic and read the full relevant entries. Always apply the global checks below.
2. During review, check whether any active lesson applies to the change.
3. When a meaningful defect or near miss occurs, search for an existing entry before creating one. Investigate root cause and validate prevention.
4. Prefer deterministic controls (tests, type constraints, schema constraints, lint rules, architecture tests, CI, permission hooks) over repeated prose reminders when practical.
5. Update occurrence counts and verification evidence when a lesson recurs. Deduplicate related entries.
6. Review stale entries periodically; retire only with reason and preserve useful history.

## Global review checklist

### Correctness and scope

- [ ] Acceptance criteria and user-visible behavior are clear.
- [ ] The change addresses the actual problem and only the necessary scope.
- [ ] Existing implementations and shared business rules were searched before adding new ones.
- [ ] Callers, consumers, public interfaces, and backwards compatibility were checked.
- [ ] Normal, boundary, negative, and failure cases were considered.
- [ ] Existing behavior that must remain unchanged has regression coverage where appropriate.

### Architecture and maintainability

- [ ] Module responsibility and dependency direction remain clear.
- [ ] No accidental duplicate function, service, component, validation, or domain rule was introduced.
- [ ] No unnecessary abstraction, dependency, framework, or distributed component was added.
- [ ] Error handling, resource ownership, cancellation, and cleanup are at the correct boundary.
- [ ] The final diff contains no unrelated refactor or style rewrite.

### Security, privacy, and data

- [ ] Authentication and authorization are distinguished; each protected action is authorized at the correct boundary.
- [ ] Input is validated and output is encoded/filtered where appropriate.
- [ ] No credentials, secrets, tokens, or sensitive user data are exposed in code, logs, fixtures, or reports.
- [ ] Sensitive data access, storage, retention, and deletion follow requirements.
- [ ] Database constraints, transactions, concurrency, migration compatibility, and rollback/recovery were assessed where applicable.
- [ ] Retries are bounded and safe; side effects are idempotent or deduplicated where needed.

### Tests and verification

- [ ] Tests assert intended behavior, not only the current implementation.
- [ ] Relevant unit, integration, contract, end-to-end, negative, boundary, and regression tests were considered.
- [ ] Flaky tests were investigated rather than silently skipped or weakened.
- [ ] Required lint, formatting, type, static analysis, build, security, and performance checks were run as applicable.
- [ ] Exact checks, results, omissions, and environment blockers are reported truthfully.

### Operations and release

- [ ] Resource, concurrency, timeout, overload, recovery, and observability concerns were considered where relevant.
- [ ] Capacity/scalability claims name workload assumptions and evidence.
- [ ] Deployment, feature flag, migration order, rollback, and monitoring were considered where relevant.
- [ ] Destructive/high-impact actions had the required approval.

### Final integrity

- [ ] Existing user changes remain intact.
- [ ] Final Git diff/status were inspected.
- [ ] Generated files, lockfiles, and artifacts were handled according to repository conventions.
- [ ] Documentation reflects actual behavior and points to one source of truth.
- [ ] Review findings have explicit dispositions; unresolved risk is disclosed.
- [ ] New durable lessons were added or existing ones updated without duplication.

## Lesson index

Use tags to select relevant entries. Keep this index current. Do not copy the entire ledger into the root agent instructions.

| ID | Status | Severity | Tags / affected area | Short prevention rule | Enforcement |
|---|---|---|---|---|---|
| REV-001 | Automated | High | `database`, `api`, `concurrency` | Defect tag IDs must incorporate random UUIDs and array index offsets to prevent primary key collision on batch inserts. | Automated test in `tests/test_server.py` |
| REV-002 | Automated | High | `security`, `frontend`, `api` | Dynamic metric keys and values rendered into tables and modal dialogs must be strictly escaped via HTML entity escaping. | `escapeHtml()` utility + syntax checks |
| REV-003 | Validated | Medium | `frontend`, `rater-ux`, `privacy` | Never silently evaluate under a cached rater ID without explicit user confirmation when loading a study URL. | Re-entry modal `#onboard-continue-box` + badge |

Suggested tags: `architecture`, `api`, `database`, `migration`, `security`, `privacy`, `frontend`, `accessibility`, `mobile`, `backend`, `concurrency`, `performance`, `reliability`, `testing`, `dependency`, `build`, `deployment`, `documentation`, `agent-workflow`.

## Lesson lifecycle

- **Candidate:** concern is recorded but root cause is not yet established.
- **Validated:** evidence confirms the event and root cause, or the confirmed part is clearly separated from suspected causes.
- **Active:** preventive rule is accepted and should be followed.
- **Automated:** a reliable automated control enforces the prevention and has been tested. Keep the entry discoverable; do not remove it merely because automation exists.
- **Retired:** the rule no longer applies; record why, when, and what superseded it.

Track lifecycle status separately from remediation status if both are needed. A code fix alone does not mean the lesson is prevented.

## When a new lesson is justified

Capture a lesson when it has durable preventive value, for example: a regression, incorrect architecture assumption, repeated review finding, data integrity failure, security oversight, missed edge case, failed test strategy, misleading docs, dependency failure, production issue, or recurring agent mistake.

Do not add a permanent entry for a typo, one-off noise, speculative concern, or preference without a concrete failure/prevention rationale.

## Root-cause procedure

For each candidate, answer:

1. What happened? What evidence proves it?
2. What was the user/system impact and blast radius?
3. What condition triggered it?
4. What is the confirmed root cause? What remains suspected?
5. Why did existing tests, types, review, docs, or runtime controls not catch it?
6. Could the same class of issue exist elsewhere?
7. What is the earliest effective prevention point?
8. Can prevention be automated safely? What is the smallest effective control?
9. How will the control be tested and measured?
10. What instruction or index entry makes the lesson discoverable?

## Entry template

Copy into the ledger only after deciding that the lesson is worth retaining. Use a unique ID such as `REV-001`.

```markdown
### REV-XXX — Short, behavior-focused title

- Status: Candidate | Validated | Active | Automated | Retired
- Severity: Critical | High | Medium | Low | Informational
- Tags:
- First occurrence:
- Most recent occurrence:
- Recurrence count: 1
- Affected files/components:
- Related issue/ADR/test/control:

**What happened**

**Evidence / reproduction**

**Impact**

**Root cause** (Confirmed | Suspected)

**Why existing safeguards failed**

**Required invariant / prevention rule**

**Preventive action** (code / test / type / schema / lint / CI / hook / docs)

**Verification** (exact command or procedure and observed result)

**Automation status and owner**

**Retirement/supersession note** (if applicable)
```

## Recorded lessons

### REV-001 — Multi-region waveform defect timestamp primary key collisions

- Status: Automated
- Severity: High
- Tags: database, api, concurrency
- First occurrence: 2026-11-25
- Most recent occurrence: 2026-11-25
- Recurrence count: 1
- Affected files/components: `run_server.py`, `database.py`, `public/js/eval_app.js`
- Related issue/ADR/test/control: `tests/test_server.py:test_submit_evaluation_multiple_defects`

**What happened**
When an evaluator flagged multiple speech defect regions within a single audio evaluation submission, the backend attempted to insert records into `evaluation_defects` using generated IDs based on timestamp seconds or milliseconds alone (`dt-{ts}`). Because all defects in the payload were processed in the same microsecond during request handling, identical IDs were generated, triggering a SQLite `UNIQUE constraint failed: evaluation_defects.id` and rejecting legitimate ratings.

**Evidence / reproduction**
Sending a `POST /api/evaluations` payload containing `defect_tags: [{defect_type: "V_DEL_INS", start_time: 1.0, end_time: 2.0}, {defect_type: "P_REP", start_time: 2.5, end_time: 3.0}]` failed with HTTP 500 when IDs lacked high-entropy uniqueness.

**Impact**
Evaluations containing multiple acoustic defect regions failed to save, resulting in lost rater effort and unrecorded defect metrics.

**Root cause** (Confirmed)
ID generation in `run_server.py` and client-side payload construction relied on millisecond-level timestamps without indexing or cryptographic entropy, guaranteeing collision across multiple items inserted within the same iteration loop.

**Why existing safeguards failed**
Previous unit tests only evaluated submissions with zero or one defect tag, missing batch-insert concurrency scenarios.

**Required invariant / prevention rule**
All synthetic primary keys for sub-entity collections must combine unix timestamp, array iteration index offset, and high-entropy UUID suffix: `f"dt-{now_ts}-{idx}-{uuid.uuid4().hex[:8]}"`.

**Preventive action** (code / test)
1. Updated `run_server.py` to format unique IDs as `dt-{ts}-{idx}-{uuid4}`.
2. Added unit test `test_submit_evaluation_multiple_defects` asserting that multiple defect regions save cleanly without constraint violations.

**Verification**
`python3 -m unittest tests.test_server.TestServer.test_submit_evaluation_multiple_defects -v` exited 0.

**Automation status and owner**
Automated in unit test suite.

---

### REV-002 — Stored cross-site scripting via dynamic crowdsourced rubric metric keys

- Status: Automated
- Severity: High
- Tags: security, frontend, api
- First occurrence: 2026-11-25
- Most recent occurrence: 2026-11-25
- Recurrence count: 1
- Affected files/components: `public/js/admin_app.js`
- Related issue/ADR/test/control: `scripts/validate_package.py`, code review finding

**What happened**
In the Admin Results & Scores view, dynamic metric breakdowns and custom evaluation rubrics were rendered into HTML table cells and modal cards via template string interpolation without escaping the metric key or rater note strings (`<td>${key}</td>`). A malicious study creator or compromised evaluator payload could inject arbitrary HTML/JavaScript into the admin console session.

**Evidence / reproduction**
Supplying a metric key containing `<script>` or `<img onerror=...>` in a study configuration caused the tag to render unescaped in the Evaluation Inspector and score cards.

**Impact**
Stored XSS vulnerability in the admin interface, potentially allowing session hijacking or unauthorized admin actions.

**Root cause** (Confirmed)
Dynamic JSON keys from SQLite `evaluations.scores_json` were directly concatenated into innerHTML strings without passing through entity sanitization.

**Why existing safeguards failed**
Previous frontend reviews only tested standard predefined metrics (`naturalness`, `pronunciation`) and lacked adversarial string injection checks.

**Required invariant / prevention rule**
All user-supplied or dynamic keys, notes, and rater names must be sanitized via `escapeHtml()` before insertion into DOM templates or innerHTML strings.

**Preventive action** (code)
Implemented reusable `escapeHtml(str)` in `public/js/admin_app.js` and wrapped all dynamic metric keys, rater comments, and model labels.

**Verification**
Verified syntax and manual DOM checks; verified clean escaping in `public/js/admin_app.js`.

**Automation status and owner**
Automated frontend security practice.

---

### REV-003 — Silent rater identity caching in localStorage causing anonymous attribution drift

- Status: Validated
- Severity: Medium
- Tags: frontend, rater-ux, privacy
- First occurrence: 2026-11-25
- Most recent occurrence: 2026-11-25
- Recurrence count: 1
- Affected files/components: `public/js/eval_app.js`, `public/eval.html`
- Related issue/ADR/test/control: Rater onboarding workflow

**What happened**
When an evaluator previously rated samples on a browser and later returned to a study link (or when another rater used the same machine/browser), `eval_app.js` silently reused the cached `rater_id` and `rater_name` from `localStorage` without presenting a confirmation screen. As a result, subsequent ratings were mistakenly attributed to the prior user.

**Evidence / reproduction**
Rater "Monirath" visited an evaluation URL previously used by "Sorphea Tepy" and ratings were silently recorded under "Sorphea Tepy" because onboarding was bypassed when `localStorage.getItem("audio_studio_rater_name")` was truthy.

**Impact**
Data contamination in crowdsourced studies; raters unknowingly submitted feedback under previous users' names with no way to identify or switch identity.

**Root cause** (Confirmed)
The application assumed one physical user per browser profile and automatically skipped the identity step whenever local storage was non-empty.

**Why existing safeguards failed**
Testing was conducted in single-session private windows rather than persistent multi-user shared browser scenarios.

**Required invariant / prevention rule**
Returning raters with cached credentials must be shown an explicit identity confirmation modal (`Rating as: [Name]`) with options to continue or switch to a new rater profile before rating begins. A persistent top-bar badge must display the active identity with a "Switch" button.

**Preventive action** (code / UI)
Added `#onboard-continue-box` in `public/eval.html` prompting "Welcome back, [Name]! Continue as [Name] or Switch rater", and placed an active identity pill in the top header.

**Verification**
Manual verification of the rater reentry flow and automated syntax checking.

**Automation status and owner**
Interactive UI gate.

## Maintenance and deduplication

- Search by tags, symptoms, and root cause before adding a new entry.
- If the same root cause recurs, update the existing entry's evidence, recurrence count, and control; do not create a clone.
- If a single entry has distinct failure modes with different prevention, split it and cross-reference both entries.
- Merge entries only when root cause and preventive control are genuinely the same; preserve all useful occurrence references.
- Review stale entries at a natural maintenance point or periodically for active projects. Do not create a scheduled ritual for inactive/small repositories.
- Remove obsolete checklist text only after confirming it is covered elsewhere; preserve historical cause and retirement reason.
- If the ledger becomes too large, split by topic into `docs/review-lessons/<topic>.md` and keep this root file as the short checklist/index. Do not split pre-emptively.

## Learning effectiveness signals

Track only metrics that help improve controls: recurrence by root cause, repeated review findings, regressions caught by new tests, false-positive rate of checks, stale/unused rules, and proportion of lessons with executable enforcement where practical. Do not game counts, create meaningless warnings, or treat more rules as proof of better engineering.
