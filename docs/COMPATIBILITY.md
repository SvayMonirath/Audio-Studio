# Agent instruction compatibility matrix

**Verified against public documentation available on 16 November 2026.** Agent products change quickly. Verify the current installed version and active instruction chain before depending on any adapter.

## Matrix

| Harness | Documented project instruction mechanism | Scoped / additional mechanism | Package behavior | Verification required |
|---|---|---|---|---|
| **OpenAI Codex** | `AGENTS.md`; searches global and repository path chain; closer files can add/override guidance | `AGENTS.override.md`; nested `AGENTS.md`; configured fallback filenames | Root `AGENTS.md` is canonical. Add nested files only for real subtrees with distinct conventions. | Run the documented instruction-inspection prompt from root and a nested directory; confirm correct files and precedence. |
| **Claude Code** | `CLAUDE.md` in project hierarchy; imports using `@path` | `.claude/rules/`, path-scoped rules, skills, subagents, hooks, `.claude/settings.json` | `CLAUDE.md` imports `AGENTS.md`. Keep Claude-only configuration native and minimal. | Use `/memory` or equivalent current command to inspect loaded instructions; check imported content and any nested rules. Check hook/permission scopes before enabling. |
| **Gemini CLI** | `GEMINI.md` hierarchy; global/workspace and just-in-time discovery | `@./file.md` imports; configurable `context.fileName`; hooks/settings | `GEMINI.md` imports `AGENTS.md`. Do not alter `context.fileName` unless tested and needed. | Use `/memory show`; verify canonical instructions appear exactly once and JIT folder rules activate only where expected. |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `AGENTS.md`, or supported CLAUDE/GEMINI files depending on surface | `.github/instructions/**/*.instructions.md`, custom agents in `.github/agents/` | Thin `.github/copilot-instructions.md` points to root `AGENTS.md`; keep policy canonical. | Confirm behavior separately in the actual IDE, CLI, code review, or cloud-agent surface. GitHub documents client-specific support and precedence. |
| **Cursor** | Project rules in `.cursor/rules`; `AGENTS.md` is documented as a supported alternative | User rules; scoped project rules; `.cursorrules` is legacy/deprecated | Use root `AGENTS.md` where supported. Do not generate a second rule system by default. | Inspect active rules in the installed version; verify rule scope on root and nested files. |
| **Windsurf** | Not asserted by this package: a current authoritative discovery/precedence page was not verified in this research pass | Product-specific workspace rules/memories may exist; confirm vendor documentation | No Windsurf adapter is generated. Avoid claiming `AGENTS.md` compatibility without checking current docs. | Check official docs for installed version and test a unique sentinel instruction in a disposable workspace. |
| **Other harnesses** | Unknown until verified | Tool-specific | Do not assume compatibility from filename convention alone. | Consult official docs and inspect the loaded prompt/context. |

## Important implementation details

### Codex

Codex documents global and project instruction layering, with path-scoped `AGENTS.md` files and optional override/fallback behavior. Its default project instruction budget is documented as limited; this is another reason to keep the root file concise. See [Codex custom instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

### Claude Code

Claude Code uses `CLAUDE.md` as persistent project context and supports imported files, scoped rules, skills, hooks, and subagents. The package's adapter uses `@./AGENTS.md`; verify the import with the current `/memory`/context view in the installed client. Do not assume a Claude `CLAUDE.md` import behaves identically in other harnesses. See [Claude Code memory](https://code.claude.com/docs/en/memory), [settings](https://code.claude.com/docs/en/settings), and [subagents](https://code.claude.com/docs/en/sub-agents).

### Gemini CLI

Gemini CLI documents hierarchical `GEMINI.md` loading, just-in-time discovery, `/memory show`, and `@` imports. The adapter imports the canonical file. It is also possible to configure alternate context filenames, but this is unnecessary for the default setup. See [GEMINI.md context](https://geminicli.com/docs/cli/gemini-md/) and [hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md).

### GitHub Copilot and VS Code

GitHub states that instruction precedence varies by client and feature; some surfaces combine applicable files without a universal precedence order. Copilot's path-specific instructions and agent profiles are distinct from repository-wide instructions. VS Code publishes a harness comparison. Treat those docs as an evolving snapshot, not a guarantee for all products labeled Copilot. See [GitHub custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions), [custom agents](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/use-copilot-agents/use-custom-agents), and [VS Code reference](https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference).

### Cursor

Cursor documents `.cursor/rules`, user rules, and `AGENTS.md`, while `.cursorrules` is legacy. Prefer the shared canonical file unless a Cursor-only capability has a clear benefit. See [Cursor rules](https://docs.cursor.com/context/rules-for-ai).

## Adapter governance

- Never copy the full canonical rules into every adapter. That creates drift.
- If a harness does not support imports, use its native adapter as a short pointer only if the harness reliably reads root `AGENTS.md`; otherwise generate a small synchronized adapter and validate it.
- Keep agent-specific tool permissions, hooks, subagent profiles, and command definitions in native configuration—not in a universal Markdown policy.
- Any adapter change must include a client-specific verification step and update to this matrix.
- Re-check docs on version upgrades, not on every routine code change.

## Minimal load test

1. In a disposable branch/worktree, add a harmless sentinel instruction such as `For this test only, report the marker AGENT-CONTEXT-OK.` to the canonical file.
2. Start each target harness at repository root. Ask it to report loaded instructions and the marker.
3. Repeat from a nested directory with a scoped instruction file.
4. Confirm expected precedence and ensure the sentinel is not present after reverting the test change.
5. Record harness name, version, test date, loaded files, result, and any limitation.
