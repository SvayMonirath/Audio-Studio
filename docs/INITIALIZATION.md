# Safe initialization of an existing repository

## Rule: inspect first, modify only after authorization

Initialization begins as a **read-only audit**. The goal is to understand what exists and propose the smallest useful adoption plan. A generated instruction system must describe the actual repository—not an imagined clean-slate architecture.

## Phase A — Establish a safe baseline (read-only)

1. Confirm repository root, current branch, worktree, and repository state.
2. Run `git status --short --branch` and inspect the existing diff. Identify staged, unstaged, and untracked user changes; do not overwrite or clean them.
3. Enumerate current root and nested agent instructions (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules`, `.claude/`, etc.). Identify which harnesses the team actually uses.
4. Read README, contribution guides, architecture docs, ADRs, security docs, tests, CI, build scripts, deployment manifests, and relevant operational procedures.
5. Identify languages, frameworks, package managers, runtime versions, build entry points, and supported platforms from manifests and code—not guesses.
6. Map the major directories, executable entry points, module boundaries, persistence, external integrations, and data flows.
7. Identify the real commands for formatting, linting, type checking, testing, building, migration validation, security scanning, and deployment. Verify from package scripts, Makefiles, CI, or documented scripts. Do not execute side-effecting commands during this phase.
8. Identify security and privacy boundaries: authn/authz, secrets, sensitive data, permissions, tenant separation, external APIs, and deployment credentials.
9. Identify reliability requirements and evidence: user-facing critical journeys, data durability, offline behavior, backups, monitoring, recovery, and actual workload assumptions.
10. Read `REVIEW.md` if it exists. Determine its schema, active lessons, duplicates, stale rules, and enforcement status.
11. Identify existing automation: CI jobs, hooks, linters, type systems, architecture tests, dependency scanning, code owners, and test fixtures.
12. Record documentation contradictions and unknowns. Do not silently decide that the newest-looking document is correct without verification.

## Phase B — Produce an audit report

The report should include:

- Repository identity and inspection boundary.
- Branch/worktree and existing changes preserved.
- Languages/frameworks/versions with evidence paths.
- Directory/module map and entry points.
- Existing instruction sources and actual harnesses.
- Build/test/format/lint/type-check commands with evidence and whether executed.
- Architecture and data-flow observations.
- External systems, sensitive data, trust boundaries, and security concerns.
- Runtime/release/operations observations.
- Existing automated safeguards and gaps.
- REVIEW.md status and relevant lessons.
- Documentation conflicts, missing facts, and unknowns.
- Proposed tiered adoption plan with exact target files and why each is needed.

Use `Observed`, `Documented`, `Inference`, `Assumption`, and `Unknown` labels where useful. Cite repository paths and relevant line/symbol references. Do not expose secrets in the report.

## Phase C — Reconcile before generating

1. Preserve established architecture and repository-specific conventions unless an evidence-backed defect or approved requirement warrants change.
2. Choose one canonical instruction source that the primary harness actually reads. Where possible, use root `AGENTS.md`; otherwise document the harness constraint and adapt carefully.
3. Keep existing instruction content that is still valid. Merge duplicates, do not replace files wholesale.
4. Resolve contradictory instructions with the project owner when they represent a product/security/architecture choice. For objectively stale technical facts, verify against code/tests/contracts and propose the correction.
5. Create only documents that have a real owner and distinct purpose. Avoid a pile of empty `SECURITY.md`, `RELIABILITY.md`, `TESTING.md`, etc.
6. Add project-specific commands, paths, and boundaries only when verified.
7. Seed REVIEW.md with universal checks and its schema, not fabricated incidents. Transfer existing proven lessons with their original provenance.
8. Prefer enforcing critical requirements in existing test/CI/tooling rather than adding a parallel system.

## Phase D — Adopt incrementally

Recommended order:

1. Add/repair the concise canonical entry point and document index.
2. Verify loading in the actual harness.
3. Add only the project docs required by identified risks and missing knowledge.
4. Add REVIEW.md structure and migrate validated existing lessons.
5. Add one high-value automated guard at a time, with a test proving it works.
6. Validate all internal links, commands, paths, and configuration syntax.
7. Ask reviewers to audit the resulting system if the change is substantial; use independent reviewers only where available.
8. Review the final diff and obtain the required human approval.

## Explicit stop conditions

Stop before modifying anything when:

- The working tree contains user changes that cannot be safely isolated.
- Required access or authorization is absent.
- A proposed operation can destroy data or alter production and lacks approval.
- A key product/architecture/security requirement is contradictory or unknown and cannot be safely assumed.
- The current agent harness's instruction discovery is uncertain and the change would depend on it.

A stop does not prevent a read-only report or a safe, bounded proposal.
