# Operating model: risk-based engineering workflow

## 1. Risk tiers

Risk is determined by the highest applicable consequence, uncertainty, and blast radius—not by estimated coding time.

| Tier | Typical work | Minimum process | Review expectation |
|---|---|---|---|
| **T0 — trivial** | Typo, formatting-only edit, isolated comment | Verify file/context; make one focused change; inspect diff | No separate reviewer unless requested; relevant automated formatting/check may suffice |
| **T1 — routine** | Local bug fix, contained UI change, small helper with known patterns | Discovery, acceptance criteria, focused test, applicable lint/type/build checks, diff audit | One independent review when useful or mandated by project policy |
| **T2 — substantial** | Multi-module feature, API contract, data-flow change, non-trivial refactor, architecture-impacting update | Written plan, alternatives, risk map, test plan, implementation, regression/integration verification, docs review | Usually 2–3 distinct review perspectives, if actual agents are available |
| **T3 — high consequence** | Authn/authz, security boundary, sensitive data, destructive migration, production infrastructure/deploy, irreversible data operation | T2 process plus threat/data/rollback analysis, explicit authorization, pre/post checks, recovery plan, human approval | Dedicated relevant specialist reviews; 2–5 perspectives only when each adds distinct value; human approval remains required for high-impact operations |

Move up a tier when a small diff changes a critical boundary. Move down only when evidence proves the risk is limited.

## 2. Standard workflow

### Understand

- Clarify the requested outcome and success conditions without re-asking for information already present.
- Inspect instructions, status/diff, relevant docs, code paths, tests, and REVIEW lessons.
- Identify the actual user problem; challenge assumptions rather than copying a proposed implementation blindly.

### Investigate

- Trace callers/callees, data/control flow, persistence, side effects, async/concurrency behavior, trust boundaries, and external dependencies as relevant.
- Search existing functionality before creating new abstractions or files.
- Verify unfamiliar or version-sensitive technology from current primary sources.
- Identify normal, boundary, negative, failure, and recovery scenarios.

### Plan (T2/T3; concise for T1 when helpful)

State objective, constraints, acceptance criteria, affected files/components, approach, plausible alternative(s), trade-offs, data/API compatibility, risks, tests, review roles, rollback/recovery, and approvals. Do not make an implementation plan more elaborate than the task.

### Implement

Use focused, reversible changes where possible. Preserve public contracts unless a change is explicitly required and migration/compatibility effects are handled. Keep business rules in a clear authoritative layer. Do not add a dependency when existing code/platform features suffice.

### Verify

Run checks in increasing cost order: targeted tests → related integration/contract tests → wider suite → static/type/security/build checks → runtime/manual verification where necessary. Inspect exact command output and exit status. If a test cannot run, report the environment blocker and do not mark it passed.

### Review and audit

Use specialist review based on risk. Inspect full diff and status. Check for data loss, secret exposure, unrelated edits, incorrect assumptions, duplicate business logic, undocumented contracts, test gaps, and residual risk.

### Learn and report

Update the relevant lesson or technical decision only when durable knowledge changed. Report the change, rationale, verification, reviewer provenance, limitations, and remaining risks.

## 3. Evidence classification

Use these labels in technical reports when ambiguity matters:

- **Observed:** directly seen in source, config, test output, logs, or runtime.
- **Documented:** stated by a primary technical source or specification.
- **Requirement:** explicitly requested or contractually required.
- **Convention:** existing repository pattern, not necessarily an external standard.
- **Inference:** reasoned conclusion based on observed/documented facts.
- **Assumption:** unverified premise being used temporarily.
- **Unknown:** not established. Do not fill this gap with confident prose.

If facts conflict, prefer reproducible behavior and authoritative contracts over stale prose, but document the mismatch and update the source of truth only after confirming intent.

## 4. Approval and permission boundaries

| Action | Default | Minimum safeguard |
|---|---|---|
| Read repository files, inspect status, search code | Allowed when tools/environment permit | Respect privacy, secrets, and scope |
| Edit code/docs in task scope | Allowed when authorized by task | Preserve existing user changes; focused diff |
| Add runtime/production dependency | Do not assume approval | Explain need, alternatives, risk/license/maintenance; follow repo policy |
| Install system/global packages or modify host config | Not allowed by default | Explicit approval and bounded scope |
| Delete data/files or perform destructive Git operations | Not allowed by default | Explicit approval; verify exact target; backup/recovery plan where possible |
| Run database migration against real data | Not allowed by default | Explicit approval, backup/restore evidence, dry-run/staging, compatibility and rollback plan |
| Modify secrets, credentials, access controls, security policy | Not allowed by default | Explicit authorization and security review |
| Deploy/release or operate production | Not allowed by default | Explicit approval, release checklist, monitoring, rollback/abort criteria |
| External network/API actions with side effects | Not allowed by default | Explicit approval, understand cost/data exposure/side effects |

Tool permission systems and human authorization are separate controls. A tool being technically available does not imply the action is authorized.

## 5. Rollback and reversibility

Before high-impact work, determine:

- What state changes?
- Can the change be reversed safely?
- Is rollback code-compatible with the changed data/schema?
- Is backup integrity tested, or merely assumed?
- What is the recovery point/time requirement, if applicable?
- Which monitoring or checks signal an unsafe outcome?
- What are the abort conditions and responsible approver?

If rollback is impossible or incomplete, call that out before the operation and require stronger approval.

## 6. Definition of done

A change is done only when all applicable conditions are satisfied:

- Acceptance criteria are met by observed behavior or appropriate tests.
- Required automated checks ran and their results are known.
- Relevant independent review findings are resolved or explicitly accepted by an authorized owner.
- No unintended modifications or secrets are present in the final diff.
- Compatibility, migration, security, and operational implications are handled.
- Documentation and REVIEW lessons are updated where durable facts changed.
- Final report distinguishes passed, failed, skipped, and unverified work.

Do not equate “code generated,” “build succeeded,” or “tests passed” with production readiness.
