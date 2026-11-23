# Engineering quality model

Use these domains as an assessment menu. Select those that materially affect the product; mark irrelevant domains `Not applicable` with a reason rather than inventing controls.

## Quality dimensions and minimum evidence

| Domain | Questions | Example verification evidence |
|---|---|---|
| Requirements and product correctness | Are user outcomes, constraints, acceptance criteria, and failure behavior explicit? | Acceptance tests, validated workflows, domain-owner review |
| Architecture and maintainability | Are responsibilities clear? Are dependencies directed intentionally? Are abstractions simpler than the problem? | Dependency graph, module boundary tests, ADR, focused diff |
| Reliability | What failures can occur? Are timeouts, cancellation, retries, cleanup, fallback, and recovery handled? | Failure-injection tests, bounded retry tests, resource-leak checks, recovery drill |
| Scalability | What workload is expected: users, requests, data growth, concurrency, throughput? Where is the capacity limit? | Load profile, benchmark, capacity model, bottleneck measurement |
| Performance | What latency, startup, memory, rendering, CPU, or query budget matters to users? | Baseline and before/after measurements, profiling, regression test |
| Security and privacy | What assets, actors, trust boundaries, permissions, threats, and data exposures exist? | Threat model, authorization tests, scanners, secret scan, security review |
| Data integrity | What invariants must persist? What happens during partial failure or concurrent writes? | Transactions, constraints, migration tests, backup/restore test, idempotency test |
| Testing | Do tests have meaningful oracles and cover normal, negative, boundary, regression, and integration behavior? | Test suite, mutation/property/fuzz tests where justified, flaky-rate data |
| Observability and operations | Can failures be detected, diagnosed, and recovered? Do logs avoid sensitive data? | Structured logs, metrics/traces where relevant, runbook, alert tests |
| Dependencies and supply chain | Are versions reproducible, maintained, compatible, and license-safe? | Lockfile, vulnerability/license scan, provenance and update process |
| Release and deployment | Can a release be reproduced, validated, monitored, and rolled back? | CI artifact, staged release evidence, health checks, rollback rehearsal |
| Accessibility and inclusion | Can affected users access the feature across relevant assistive technologies and input modes? | Automated accessibility scan plus manual assistive-tech check |
| Internationalization | Are locale, Unicode, pluralization, dates, time zones, and text expansion relevant? | Locale tests, Unicode tests, translation fallback checks |
| Cost and sustainability | Does usage have material runtime/cloud/AI/storage cost or resource footprint? | Budget, cost per operation, usage limits, resource measurement |
| AI-specific behavior | Are outputs evaluated, tool permissions scoped, prompt-injection surfaces controlled, and fallback behavior honest? | Eval set, adversarial tests, tool audit, human escalation and traceability |

## Risk assessment

For each affected boundary, assess:

- **Impact:** user harm, data loss, security exposure, service interruption, financial/legal impact, or operational burden.
- **Likelihood:** evidence from complexity, exposure, failure history, tests, and known weak points.
- **Blast radius:** users, tenants, devices, modules, data, or downstream systems affected.
- **Detectability:** whether failure is visible before irreversible harm.
- **Reversibility:** whether the change can be rolled back without losing data or breaking compatibility.
- **Uncertainty:** gaps in requirements, source evidence, external API semantics, or environment.

Use a qualitative matrix unless the project has a validated quantitative risk model. Do not create fake numeric precision.

## Measurable quality claims

Any claim such as “scalable,” “high performance,” “high availability,” “secure,” “production ready,” or “fully tested” must name:

1. The requirement or target.
2. The workload/environment/assumptions.
3. The measurement or evidence.
4. The scope and time period.
5. Known exclusions and remaining risks.

Examples:

- Better: “The API sustained the specified 250 requests/second for 30 minutes in the staging profile with p95 latency below 200 ms; database size was 20 GB and the test used two application instances.”
- Not acceptable: “The API is scalable.”
- Better: “The payment callback handler is idempotent for repeated event IDs; integration tests replay the same event and assert a single ledger mutation.”
- Not acceptable: “Retries are safe.”

## Testing strategy

Select layers based on risk, not a universal numerical ratio:

- Unit tests for isolated decisions and domain invariants.
- Integration tests for databases, message brokers, filesystem, and service boundaries.
- Contract tests for external/public interfaces.
- End-to-end tests for critical user journeys where setup cost is justified.
- Regression tests for known defects.
- Negative and boundary tests for validation, permissions, concurrency, and failure handling.
- Property-based/fuzz tests for parsers, protocol boundaries, serialization, and complex input spaces where useful.
- Performance and recovery tests when explicit budgets/recovery objectives exist.

Coverage can reveal unexecuted code, but it does not establish assertion quality, correctness, or test independence. Do not game coverage thresholds.

## Reliability patterns: applicability, not rituals

- Timeouts: set at boundaries where work can hang; budget them across nested calls.
- Retries: only transient, retryable failures; bounded attempts/time; backoff/jitter where appropriate; idempotency or deduplication for side effects.
- Circuit breakers/load shedding: only where dependency behavior and overload conditions justify them.
- Queues: bound capacity and define overflow, retry, dead-letter, and ordering semantics.
- Graceful degradation: define what reduced behavior is safe for the product.
- Recovery: test restoration and data recovery; an untested backup is an assumption.
- SLOs/error budgets: use only for a service with meaningful user-facing reliability objectives and operational data.

## Security minimums

For any exposed or sensitive system, identify assets, actors, entry points, trust boundaries, and authorization decisions. Validate at the boundary; authorize every protected action server-side; minimize privileges; keep secrets out of source/logs; pin/lock dependencies where appropriate; scan and patch; protect build and release credentials. High-risk changes require threat-focused independent review. Applicable domain standards (OWASP, NIST, platform security docs, regulations) must be selected after identifying the actual product domain.
