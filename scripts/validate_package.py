#!/usr/bin/env python3
"""Validate this AI Engineering OS package using only the Python standard library."""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md",
    ".github/copilot-instructions.md", "REVIEW.md",
    "docs/RESEARCH_REPORT.md", "docs/COMPATIBILITY.md",
    "docs/OPERATING_MODEL.md", "docs/MULTI_AGENT_REVIEW.md",
    "docs/QUALITY_MODEL.md", "docs/INITIALIZATION.md",
    "docs/DECISION_GOVERNANCE.md", "docs/VALIDATION_SCENARIOS.md",
    "docs/FINAL_AUDIT.md",
    "reviewers/architect.md", "reviewers/reliability.md",
    "reviewers/security.md", "reviewers/test-quality.md",
    "reviewers/adversarial.md", "templates/ADR.md",
    "templates/REVIEW_FINDING.md", "templates/FINAL_REPORT.md",
]

errors: list[str] = []
for rel in REQUIRED:
    path = ROOT / rel
    if not path.is_file():
        errors.append(f"Missing required file: {rel}")
        continue
    try:
        path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"Not valid UTF-8: {rel}")

for adapter, marker in (("CLAUDE.md", "@./AGENTS.md"), ("GEMINI.md", "@./AGENTS.md")):
    path = ROOT / adapter
    if path.exists() and marker not in path.read_text(encoding="utf-8"):
        errors.append(f"{adapter} does not import canonical AGENTS.md")

# Check local Markdown links. External URLs and pure anchors are skipped.
link_re = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
IGNORED_DIRS = {".git", ".superpowers", "Universal-AI-Engineering-OS", "audio"}
for path in ROOT.rglob("*.md"):
    if any(part in IGNORED_DIRS for part in path.parts):
        continue
    content = path.read_text(encoding="utf-8")
    for raw in link_re.findall(content):
        target = raw.strip().split()[0].strip("<>")
        if not target or target.startswith(("https://", "http://", "mailto:", "file:", "#")):
            continue
        target = target.split("#", 1)[0]
        if not target:
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            errors.append(f"Broken local link in {path.relative_to(ROOT)}: {raw}")

# Only actual ledger headings count as unique lesson IDs; template placeholders do not.
review = (ROOT / "REVIEW.md").read_text(encoding="utf-8") if (ROOT / "REVIEW.md").exists() else ""
ids = re.findall(r"^###\s+(REV-\d{3,})\b", review, re.MULTILINE)
if len(ids) != len(set(ids)):
    errors.append("Duplicate REV IDs in REVIEW.md")

scenario_doc = ROOT / "docs/VALIDATION_SCENARIOS.md"
if scenario_doc.exists():
    scenario_ids = re.findall(r"^\|\s*(\d+)\s*\|", scenario_doc.read_text(encoding="utf-8"), re.MULTILINE)
    expected = [str(i) for i in range(1, 21)]
    if scenario_ids != expected:
        errors.append(f"Expected validation scenarios 1-20 in order; found {scenario_ids}")

if errors:
    print("PACKAGE VALIDATION: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("PACKAGE VALIDATION: PASS")
print(f"Required files: {len(REQUIRED)} present and UTF-8 readable")
print("Adapters: canonical AGENTS.md import references present")
print("Markdown: local links resolve")
print("REVIEW.md: lesson IDs unique")
print("Validation scenarios: 20 present in order")
