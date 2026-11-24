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
| *(No project-specific lessons recorded yet.)* | | | | | |

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
### REV-001 — Short, behavior-focused title

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
