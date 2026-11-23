# Technical decision governance

## When to create an ADR

Use an Architecture Decision Record when the choice has meaningful consequences beyond a local implementation detail, such as:

- System/module boundary, persistence model, data ownership, or integration pattern.
- Public API/protocol or compatibility policy.
- Security, identity, authorization, or privacy architecture.
- Migration strategy with data compatibility or rollback impact.
- Dependency/platform choice with material lifecycle or operational cost.
- Performance/reliability strategy tied to explicit workload or SLO commitments.

Do not create an ADR for every variable name, local refactor, or readily reversible implementation choice.

## Required record

Use [`../templates/ADR.md`](../templates/ADR.md). Capture context, requirements, constraints, alternatives, evidence, decision, consequences, risks, owner/date/status, and conditions that would trigger reconsideration.

## Decision process

1. State the problem and success criteria without embedding a preferred implementation as a requirement.
2. List verified facts, repository constraints, assumptions, and unknowns.
3. Compare at least two viable approaches when a genuine alternative exists. Include the “do nothing / keep current” option when relevant.
4. Evaluate correctness, risk, complexity, compatibility, security, performance, operations, cost, reversibility, and team capability.
5. Obtain appropriate specialist review for T2/T3 decisions.
6. Record the selected option and rejected alternatives with evidence and trade-offs.
7. Record dissent or unresolved uncertainty; do not manufacture consensus.
8. Revisit when stated reversal conditions occur or material new evidence changes the trade-off.

## Conflict resolution

A documented decision is not immutable. New evidence can invalidate it. Conversely, a reviewer preference is not enough to reverse a decision. Estimate migration cost, blast radius, compatibility, and transition risk before changing it. Use a superseding ADR rather than silently rewriting historical rationale.

## Decision authority

Agents may investigate and recommend. The product owner/technical owner or another explicitly authorized human decides product trade-offs and high-impact operations. Security, privacy, legal, compliance, and data-owner sign-offs remain with the designated accountable people where required.
