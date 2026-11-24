# Research report: a repository-first AI Engineering Operating System

**Research cut-off:** 16 November 2026  
**Purpose:** derive a transferable operating model for AI-assisted engineering from public evidence. This is not a claim to know private company practices.

## Executive findings

1. **Make the repository legible before making the agent autonomous.** OpenAI's February 2026 Codex account describes a short `AGENTS.md` as a map into a structured repository knowledge base, not as an encyclopedia. It documents failure modes of giant always-loaded instruction files: context crowding, diluted priority, staleness, and poor mechanical verifiability. ([OpenAI, 11 Feb 2026](https://openai.com/index/harness-engineering/))
2. **Improve the environment, not only the prompt.** OpenAI's account emphasizes architecture legibility, executable checks, observability access, and feedback loops. Meta's October 2026 account of its Forum experiment defines success as verified outcomes that build, pass tests, and survive review—not code volume. ([OpenAI](https://openai.com/index/harness-engineering/); [Meta, 15 Oct 2026](https://engineering.fb.com/2026/10/15/ml-applications/how-meta-built-forum-ai-native-engineering/))
3. **Use several agents only where independent work exists.** Anthropic's 2025 public account explains that multi-agent research benefits breadth-first independent exploration, but coordination complexity rises quickly; early failure modes included duplicated exploration and excessive subagent spawning. Its reported 90.2% improvement is an internal evaluation for a particular research system, not a universal claim about code review or every model. ([Anthropic, 13 Jun 2025](https://www.anthropic.com/research/multi-agent-research-system))
4. **Treat security, reliability, and operational quality as lifecycle concerns.** Microsoft's SDL puts security practices across design, code, build/deploy, and runtime. Google SRE's postmortem practice ties failure investigation to preventive action; AWS and Google Cloud Well-Architected frameworks make quality trade-offs explicit. ([Microsoft SDL](https://www.microsoft.com/en-us/securityengineering/sdl/practices/); [Google SRE Workbook](https://sre.google/workbook/postmortem-culture/); [AWS pillars](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html); [Google Cloud reliability](https://docs.cloud.google.com/architecture/framework/reliability))
5. **Convert recurring failure classes into tested controls.** A prose rule is useful but weak if a deterministic test, type, database constraint, static check, policy, or CI gate can prevent the same class of mistake more reliably. Google's SRE material says postmortems should create preventive actions; Meta's 2026 JiTTesting write-up describes combining generated executable tests, rule-based false-positive filtering, and human oversight in a large-scale internal system. ([Google SRE](https://sre.google/sre-book/postmortem-culture/); [Meta, 29 Oct 2026](https://engineering.fb.com/2026/10/29/security/catching-bugs-before-they-land-jittestings-human-on-the-loop-approach-at-full-scale/))
6. **Instruction compatibility is harness-specific.** Codex, Claude Code, Gemini CLI, GitHub Copilot, and Cursor have distinct file discovery and composition behavior. A shared Markdown source is useful only when adapters and actual client loading are verified. ([Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [Claude Code](https://code.claude.com/docs/en/memory); [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/); [Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions); [Cursor](https://docs.cursor.com/context/rules-for-ai))

## Research method and evidence policy

The research prioritized primary/public material: official engineering articles, product documentation, public handbooks/frameworks, and concrete postmortems. Sources were selected for relevance to (a) agent harness and repository context, (b) architecture and developer workflow, (c) independent review and testing, (d) reliability and security, and (e) learning after failures.

For each source, this report separates:

- **Documented statement:** what the source directly says about its own product, framework, or experience.
- **Transferable inference:** a recommendation this package derives for ordinary repositories.
- **Limit:** what the source does not prove.

Public engineering blogs are selective accounts, not complete internal operating manuals. A vendor's framework is guidance for its target environment, not a universally mandatory checklist. Internal performance measurements are not independently verified here.

## Company and organization comparison

| Organization / source | Publicly documented practice | Transferable lesson | Limits / what not to infer |
|---|---|---|---|
| **OpenAI — Codex harness engineering** (11 Feb 2026) | A short root `AGENTS.md` routes agents into structured docs; codebase legibility, executable validation, observability, and feedback loops support agent work. The article explicitly reports that a monolithic instruction file was ineffective for its use case. | Keep always-loaded instructions concise; make architecture and commands discoverable; expose reliable test/telemetry interfaces; make important invariants mechanically verifiable. | One agent-first project experience, not a universal OpenAI engineering handbook or proof that every project needs the same docs or telemetry stack. [Source](https://openai.com/index/harness-engineering/) |
| **Anthropic — multi-agent research** (13 Jun 2025) | A lead agent decomposes complex research into parallel tasks; distinct prompts/tools create different exploration trajectories. The article describes coordination, evaluation, runaway spawning, duplicate work, and context-management challenges. | Delegate bounded independent questions with precise outputs; scale effort to complexity; collect durable artifacts; inspect and evaluate results; use stopping conditions. | The 90.2% result is an internal research-eval comparison for their system, not a general code-review accuracy gain. [Source](https://www.anthropic.com/research/multi-agent-research-system) |
| **Anthropic — effective agents** (19 Dec 2024) | Recommends starting with the simplest effective pattern; distinguishes fixed workflows from dynamically directed agents; notes cost, latency, and compounding-error trade-offs. | Prefer deterministic workflow for known tasks; reserve autonomy for uncertain multi-step work; keep tool interfaces clear and evaluate failure behavior. | The post notes that parts of its tooling landscape have changed since publication; treat the architectural distinctions as guidance, not current product configuration. [Source](https://www.anthropic.com/research/building-effective-agents) |
| **Meta — Forum AI-native engineering** (15 Oct 2026) | A small team experimented with AI agents throughout planning, implementation, build, tests, and verification; defined progress as verified production-ready outcomes. It describes rules, skills, agents, commands, and hooks as parts of its operating model. | Agent use becomes more valuable when integrated into verification and feedback, not just code generation. Keep humans accountable for outcomes and decisions. | This is an experiment with Meta's internal tooling and codebase. Its reported results and exact operating model should not be assumed reproducible without equivalent infrastructure. [Source](https://engineering.fb.com/2026/10/15/ml-applications/how-meta-built-forum-ai-native-engineering/) |
| **Meta — Catching JiTTests** (29 Oct 2026) | Describes change-focused generated tests, intent-aware and diff-oriented workflows, LLM judgement combined with rule-based filtering, plus human-on-the-loop review. | For risky changes, add tests targeting plausible regressions; use deterministic filters and human escalation to manage false positives. | Internal scale and data are not available for independent replication; this is not a reason to install a costly generative test system in every repository. [Source](https://engineering.fb.com/2026/10/29/security/catching-bugs-before-they-land-jittestings-human-on-the-loop-approach-at-full-scale/) |
| **Google SRE** — SRE Book / Workbook | SLOs, monitoring, toil reduction, incident response, and blameless postmortems form a public reliability body of practice. Postmortems record impact, causes, response, and actions to reduce recurrence. | Set reliability goals only for services where they matter; define observable signals; turn incidents into preventive work; measure recurring manual toil. | SRE's scale and staffing model may not fit a small app. Adapt principles, not org charts or arbitrary SLO targets. [SLOs](https://sre.google/sre-book/service-level-objectives/); [postmortems](https://sre.google/workbook/postmortem-culture/); [toil](https://sre.google/workbook/eliminating-toil/) |
| **Google Cloud** — Well-Architected (reviewed 27–28 Oct 2026 on cited pages) | Reliability is framed through scoping, observation, response, and learning; operational excellence includes SLOs, monitoring, incident response, change automation, and continuous improvement. | Tie quality goals to user experience and failure recovery; make reliability shared across relevant roles; evaluate design under actual workload assumptions. | These are cloud-workload recommendations; adapt to mobile, desktop, embedded, or offline products rather than blindly enabling cloud controls. [Reliability](https://docs.cloud.google.com/architecture/framework/reliability); [operations](https://docs.cloud.google.com/architecture/framework/operational-excellence) |
| **AWS** — Well-Architected / Prescriptive Guidance | Six pillars include operational excellence, security, reliability, performance efficiency, cost optimization, and sustainability. Retry guidance highlights transient errors, exponential backoff, and idempotency concerns. | Evaluate trade-offs explicitly; only retry safe/idempotent operations; avoid designing reliability features without failure semantics. | Cloud-specific implementation examples should not be copied into non-AWS stacks without understanding semantics. [Pillars](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html); [retry with backoff](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html) |
| **Microsoft** — Security Development Lifecycle | Ten published practices span governance, secure features, threat modeling, cryptography, supply chain, engineering environment, security testing, platform security, monitoring/response, and training. | Add security checkpoints at design, coding, build/deploy, and runtime; threat-model changes that affect trust boundaries. | The full SDL may be too heavy for small low-risk projects. Select controls based on data sensitivity, exposure, and impact. [SDL practices](https://www.microsoft.com/en-us/securityengineering/sdl/practices/) |
| **GitHub** — Copilot documentation | Documents repository-wide and path-specific instructions, custom agents, and client-dependent instruction precedence/support. | Match instruction delivery to the agent harness; use scoped instructions and purpose-specific custom agents only when supported. | Copilot behavior differs across IDE, CLI, GitHub.com, cloud agent, and review features; documentation for one surface does not guarantee another. [Custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions); [custom agents](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/use-copilot-agents/use-custom-agents) |
| **Meta** — code review workflow (16 Nov 2022) | Discusses review throughput, reviewer selection, code ownership information, and review bottlenecks. | Review should reach the right domain expertise and provide enough context; track latency and review quality, not just number of approvals. | The article focuses on Meta's code review system and throughput; do not treat its metrics as targets for small teams. [Source](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/) |
| **Cloudflare** — public postmortems | Public outage reports explain triggers, impact, mitigation, and prevention work; some recent examples include configuration/deployment and routing failures. | Preserve a clear incident timeline; identify systemic contributors; document corrective actions and verify their completion. | A postmortem is a case study, not proof of all Cloudflare operational controls. [Aug 2025 incident](https://blog.cloudflare.com/cloudflare-incident-on-august-21-2025/); [Jan 2026 route leak](https://blog.cloudflare.com/route-leak-incident-january-22-2026/) |
| **Stripe** — idempotency in APIs (22 Feb 2017) | Explains how unreliable networks and retried requests can create ambiguous/duplicate operations; idempotency helps clients and services converge on a consistent state. | Define retry semantics, idempotency keys, and duplicate-request behavior for operations with side effects. | The article is focused on API integration semantics; it is not a full Stripe engineering process guide. [Source](https://stripe.com/blog/idempotency) |
| **Shopify** — monolith evolution | Publicly describes a large monolith decomposition effort with emphasis on developer behavior, holistic architecture, tooling, and trade-offs. | Do not assume a monolith must be replaced by microservices; improve boundaries incrementally and account for organizational and migration costs. | A very large Rails codebase is not comparable to every repo; the transferable point is incremental, context-aware evolution. [Source](https://shopify.engineering/shopify-monolith) |
| **Netflix** — Chaos Engineering (2015) | Publicly described Chaos Monkey and deliberate failure injection to build systems that tolerate instance failures. | Failure injection can validate resilience once observability, blast-radius controls, and recovery procedures exist. | Old case study and production-scale infrastructure; never run chaos experiments against a project without explicit scope, safety controls, and authorization. [Source](https://netflixtechblog.com/chaos-engineering-upgraded-878d341f15fa) |

### Research coverage note

The requested list also included Amazon/AWS, Netflix, Stripe, GitHub, Shopify, Cloudflare, Meta, Microsoft, Google, Google DeepMind, OpenAI, and Anthropic. The table uses public primary sources where this pass surfaced concrete, relevant evidence. AWS is represented through its public Well-Architected and Prescriptive Guidance material, not a claim about all Amazon engineering teams. Google DeepMind was in scope, but this pass did not establish a specific public software-engineering practice source relevant enough to support a company-specific claim; no DeepMind-specific workflow is therefore attributed. The report does **not** claim comprehensive coverage of any company's entire engineering organization. No private internal process is inferred. For companies or sub-organizations where a relevant source was not found, this report makes no process claim.

## Cross-cutting synthesis

### 1. Repository knowledge and context

The strongest pattern across OpenAI's harness account and vendor instruction docs is that agents need the right information at the right time, not the maximum number of tokens. Use a short always-loaded map, verified project docs, and scoped rules. Context-loading behavior is a product capability and can change; the compatibility matrix is a snapshot, not a permanent guarantee.

### 2. Architecture should be made legible and enforceable

A human-readable diagram is helpful, but boundaries become more reliable when the repository can test them. Depending on stack, use module import rules, dependency tests, API contract tests, database constraints, generated schema checks, or CI checks. Do not adopt microservices or formal architecture layers by default.

### 3. Review is a risk control, not a popularity contest

A second perspective is useful when it can find a different class of defect. Review roles must be scoped to security, data, architecture, operations, or test quality. Reviewer consensus is not proof. Resolve claims against code, contracts, specifications, deterministic tests, or measured behavior.

### 4. Tests should prove behavior, not just exercise lines

Use a test pyramid appropriate to the product, with tests at the boundaries where defects can escape. Add regression tests for real defects, negative/boundary tests for risky input, contract tests for interfaces, and recovery tests where failure matters. Coverage is a signal, not a quality guarantee.

### 5. Reliability is conditional on architecture and criticality

A local-first note-taking app, a one-off utility, a financial transaction service, and a multi-region SaaS should not have the same reliability apparatus. Define load, availability, durability, latency, RPO/RTO, and recovery objectives only when the relevant product requirements justify them. For retry logic, require transient-error classification, bounded attempts, timeout budgets, backoff/jitter where appropriate, and idempotency or deduplication.

### 6. Learn from failure through controls

The learning loop is: evidence → root-cause analysis → corrective action → preventive control → verification → recurrence monitoring. A checklist-only response is insufficient when a deterministic automated control is feasible. Do not blame individuals or codify an unverified theory as a permanent rule.

## Practices rejected or constrained

| Temptation | Why it is rejected / constrained | Better default |
|---|---|---|
| One enormous universal `AGENTS.md` | Consumes context, blurs priorities, becomes stale, and is hard to validate. | Short entry point + topic-scoped docs + executable checks. |
| Five reviewers for every task | Creates latency, redundant opinions, and false confidence. | Review count based on risk and genuinely independent work. |
| Majority vote to resolve disagreement | Consensus can preserve a shared false premise. | Evidence, reproduction, contract/spec, and explicit residual uncertainty. |
| Force microservices / CQRS / hexagonal architecture everywhere | Architecture has operational and cognitive costs; scale is not a default requirement. | Preserve working architecture and improve boundaries only when requirements justify it. |
| Always write an ADR | Adds paperwork to reversible, local decisions. | ADR for consequential decisions with meaningful future cost or uncertainty. |
| Treat 100% test coverage as correctness | Coverage measures execution, not assertion quality or behavior completeness. | Test critical behavior, failure paths, boundaries, contracts, and regressions. |
| Auto-fix every lint/test failure | Can mask root cause or create unreviewed collateral changes. | Diagnose, fix the cause, rerun relevant checks, inspect diff. |
| Agent autonomy without guardrails | Agents can repeat existing flaws, make destructive changes, or report plausible but unverified results. | Read-only discovery, bounded permissions, executable checks, approvals for high-impact actions. |
| Copy company-scale process into small projects | Org structures, tooling, and SLOs may not transfer. | Adopt principles and minimum viable controls only. |

## Resulting system architecture

```text
User / issue / approved objective
          |
          v
  AGENTS.md (short operating contract)
          |
          +----> docs index / verified project facts
          |          |-- architecture & contracts
          |          |-- build/test/deploy instructions
          |          |-- security/reliability requirements
          |          |-- ADRs and operational runbooks
          |
          +----> REVIEW.md (relevant lesson selection)
          |
          v
  Risk classification (T0-T3)
          |
          v
  Discover -> Investigate -> Plan if needed -> Implement
          |
          v
  Automated verification + targeted independent review
          |
          v
  Final diff / authorization / risk audit
          |
          v
  Evidence-backed report + lesson/control updates
```

## Primary-source register

| ID | Organization / author | Source and date | Directly relevant evidence |
|---|---|---|---|
| R01 | OpenAI, Ryan Lopopolo | [Harness engineering](https://openai.com/index/harness-engineering/), 11 Feb 2026 | Short AGENTS map, repository docs as system of record, agent legibility, executable checks |
| R02 | Anthropic Engineering | [Multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system), 13 Jun 2025 | Independent subtasks, orchestration, evaluation, context and coordination failure modes |
| R03 | Anthropic Engineering | [Building effective agents](https://www.anthropic.com/research/building-effective-agents), 19 Dec 2024 | Workflow/agent distinction, complexity and autonomy trade-offs |
| R04 | Anthropic Claude Code | [Memory](https://code.claude.com/docs/en/memory), live docs | `CLAUDE.md`, scoped rules, context management |
| R05 | OpenAI Codex docs | [AGENTS.md instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), live docs | Instruction discovery, hierarchy, verification |
| R06 | Google Gemini CLI | [GEMINI.md context](https://geminicli.com/docs/cli/gemini-md/), live docs | Hierarchical context, imports, configurable filenames |
| R07 | Google Gemini CLI | [Hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md), live docs | Lifecycle hooks and action validation |
| R08 | GitHub Docs | [Copilot custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions), live docs | Instruction types, client-dependent precedence |
| R09 | GitHub Docs | [Copilot custom agents](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/use-copilot-agents/use-custom-agents), live docs | Specialist agent setup |
| R10 | VS Code Docs | [Custom instructions reference](https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference), live docs | Cross-harness discovery matrix |
| R11 | Cursor Docs | [Rules for AI](https://docs.cursor.com/context/rules-for-ai), live docs | Project rules, AGENTS.md support, legacy status |
| R12 | Google SRE | [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), SRE Book | User-centered measurable reliability objectives |
| R13 | Google SRE | [Postmortem culture](https://sre.google/workbook/postmortem-culture/), SRE Workbook | Learning from failure and preventive action |
| R14 | Google SRE | [Eliminating toil](https://sre.google/workbook/eliminating-toil/), SRE Workbook | Measure and remove repetitive operational work |
| R15 | Google Cloud | [Reliability pillar](https://docs.cloud.google.com/architecture/framework/reliability), reviewed 27 Oct 2026 | Scope, observe, respond, learn |
| R16 | AWS | [Well-Architected pillars](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html), live docs | Six quality dimensions |
| R17 | AWS | [Retry with backoff](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html), live docs | Idempotency and bounded retry implications |
| R18 | Microsoft | [SDL practices](https://www.microsoft.com/en-us/securityengineering/sdl/practices/), live docs | Security across lifecycle stages |
| R19 | Meta Engineering | [Forum AI-native engineering](https://engineering.fb.com/2026/10/15/ml-applications/how-meta-built-forum-ai-native-engineering/), 15 Oct 2026 | Verified outcome metric, integrated agent workflow |
| R20 | Meta Engineering | [Catching JiTTests](https://engineering.fb.com/2026/10/29/security/catching-bugs-before-they-land-jittestings-human-on-the-loop-approach-at-full-scale/), 29 Oct 2026 | Change-aware test generation and human oversight |
| R21 | Meta Engineering | [Code review time](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/), 16 Nov 2022 | Reviewer expertise and review workflow efficiency |
| R22 | Cloudflare | [Incident on 21 Aug 2025](https://blog.cloudflare.com/cloudflare-incident-on-august-21-2025/), 22 Aug 2025 | Publicly documented incident timeline and recovery |
| R23 | Cloudflare | [Route leak on 22 Jan 2026](https://blog.cloudflare.com/route-leak-incident-january-22-2026/), 23 Jan 2026 | Configuration failure and blast radius |
| R24 | Stripe | [Idempotency](https://stripe.com/blog/idempotency), 22 Feb 2017 | Predictable behavior with retries and network ambiguity |
| R25 | Shopify Engineering | [State of Shopify's monolith](https://shopify.engineering/shopify-monolith), 2020 | Incremental modularization and trade-offs |
| R26 | Netflix TechBlog | [Chaos Engineering Upgraded](https://netflixtechblog.com/chaos-engineering-upgraded-878d341f15fa), 25 Sep 2015 | Controlled fault injection for resilience |

## Research limitations and next research pass

- This report uses selected public sources, not an exhaustive literature review of all organizations named in the original research prompt.
- Some vendor docs are live and can change without a stable publication date; check the installed client version before relying on exact settings or semantics.
- No private company process has been inferred from public marketing material.
- No real source code repository was supplied, so project-specific architecture, commands, and security controls remain intentionally unfilled.
- A future project-specific audit should inspect the chosen language/framework's official docs, the repository's dependency versions, and relevant standards for its product domain (for example, OWASP ASVS/MASVS, WCAG, NIST, or applicable regulations) rather than treating this universal baseline as sufficient compliance advice.
