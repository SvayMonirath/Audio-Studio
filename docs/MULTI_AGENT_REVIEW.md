# Independent multi-agent engineering review

## 1. Purpose

Use independent perspectives to discover different defect classes—not to manufacture consensus. A primary author is responsible for integrating findings but does not automatically approve their own work.

The review design follows three constraints from public agent research: assign bounded tasks and explicit output formats; allocate parallel work only when subtasks are independent; account for coordination cost and duplicate exploration. See [Anthropic's multi-agent research account](https://www.anthropic.com/research/multi-agent-research-system).

## 2. When to delegate

| Task | Suggested review |
|---|---|
| T0 | No separate agent; automated checks and self-audit |
| T1 | Optional one reviewer if the change is ambiguous or has a meaningful regression risk |
| T2 | 2–3 independent roles selected by affected boundaries |
| T3 | At least the relevant domain specialist plus an adversarial or independent correctness pass; add more roles only for distinct risks; human approval for high-impact action |

Five roles are available in this package. They are not a mandatory five-agent committee. For a database migration, an architecture reviewer and data-integrity reviewer may be more relevant than a UI reviewer. For a text-only copy change, none may be needed.

## 3. Independence protocol

When actual subagents or separately isolated model sessions exist:

1. The primary agent prepares an evidence packet: requirements, acceptance criteria, relevant files/diff, constraints, and verification evidence. Do not include a desired verdict.
2. Assign reviewers distinct roles, explicit scope, and read-only tools where feasible. Give each enough repository context to inspect actual implementation, not just the author's summary.
3. For high-stakes or architecture decisions, ask reviewers to record initial findings before they see the primary agent's preferred solution or other reviews. This reduces anchoring; it does not guarantee independence.
4. Do not ask reviewers to modify the same files in parallel. Reviewers identify findings; the primary author (or one explicitly assigned fixer) makes changes.
5. Require concrete evidence: file/line, behavior, contract, reproduction, failing test, threat path, or measured result. Label suspicions.
6. Consolidate duplicate findings by root cause, not by suppressing the underlying evidence.
7. Resolve disagreement by investigation and evidence, never majority vote.
8. Request a focused second review after corrections only when the remaining risk warrants it.

If no genuine subagent feature is available, use separate review passes with fresh prompts/context when practical. Label these `independent review passes by the same agent`, not multiple agents. If no fresh context is possible, say so.

## 4. Reviewer roles

| Role | Primary focus | Typical findings |
|---|---|---|
| Principal architect | Boundaries, dependency direction, interfaces, coupling/cohesion, compatibility, drift, simplicity | Hidden coupling, duplicated domain rule, invalid abstraction, API break |
| Reliability and scalability | Failure modes, resource limits, concurrency, timeouts, retries, recovery, capacity and cost assumptions | Unbounded queue, unsafe retry, missing cancellation, resource leak, unverified capacity claim |
| Security and privacy | Trust boundaries, authn/authz, least privilege, injection, secrets, data exposure, dependency and supply-chain risk | Missing authorization, injection path, log exposure, privilege escalation |
| Test and quality | Requirement coverage, test oracles, negative/boundary cases, integration, flaky tests, regression risk | Test mirrors implementation, missing failure case, weak assertion, false-positive test |
| Adversarial critic | Disprove premises and design; find ignored functionality, simpler alternatives, failure paths, unsupported claims | Incorrect requirement interpretation, overengineering, untested premise, fatal edge case |

See `reviewers/*.md` for copy-ready prompts.

## 5. Finding format

Every substantive finding must include:

```text
ID: FIND-<task>-<n>
Reviewer role:
Severity: Critical | High | Medium | Low | Informational
Status: Confirmed | Suspected | Not reproduced | Rejected with evidence
Affected file/component and line/symbol:
Problem:
Evidence / reproduction:
Triggering conditions:
Consequence / blast radius:
Recommended correction:
Verification needed:
Confidence: High | Medium | Low
```

Severity guidance:

- **Critical:** likely catastrophic security/data loss/safety/availability consequence, active exploit path, or irreversible high-impact failure.
- **High:** serious exploitable weakness, major data corruption, broad outage, broken critical workflow, or severe compatibility failure.
- **Medium:** meaningful bug or maintainability/reliability risk with bounded impact or workaround.
- **Low:** localized defect, minor robustness gap, or low-probability issue.
- **Informational:** improvement suggestion, non-blocking uncertainty, or style preference. Do not inflate severity to force a preferred design.

Severity must reflect consequence and likelihood, not how difficult the code is to understand.

## 6. Adjudication

For every finding, the primary author records one disposition:

- **Accepted:** evidence confirms it; correction and verification tracked.
- **Partially accepted:** underlying concern is real; narrower correction selected.
- **Deferred:** valid but outside scope; owner, reason, and follow-up reference required.
- **Rejected:** specific evidence disproves it or trade-off is intentionally accepted by the authorized owner.
- **Unresolved:** insufficient evidence or conflicting authoritative sources; no unsupported claim of approval.

Resolve conflicts using this order where relevant: explicit product/domain requirement → reproducible observed behavior → protocol/spec/vendor contract → source code and tests → security/reliability standard → measured evidence → engineering judgment. This is not a blind hierarchy: a test may be wrong, docs may be stale, and behavior may violate a specification. Explain any conflict.

Do not use vote counting. Three reviewers repeating an assumption do not make it true. Record unresolved material disagreement in the final report or an ADR.

## 7. Approval criteria

A T2/T3 review is complete only when:

- All Critical/High findings are fixed or explicitly accepted by the authorized decision-maker with rationale and mitigation.
- Medium findings have a disposition and do not hide an unexamined high-impact path.
- Required checks are executed and results observed.
- Reviewers have examined the relevant final state, not only an obsolete patch.
- The primary author has inspected the complete diff and user changes are intact.
- Unresolved uncertainty and unavailable reviewer capabilities are disclosed.

The AI reviewer is advisory. It does not replace code owners, security officers, data owners, release managers, legal/compliance review, or human approvals required by the organization.
