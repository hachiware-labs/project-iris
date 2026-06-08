---
name: project-iris
description: Use when a PM, project lead, or engineering lead asks for a daily project status report, project issue attention, main progress, open issue burndown, GitHub/GitLab/Excel WBS interpretation, or a "team vs project issues" explanation grounded in project evidence. Use this skill to generate PM-facing HTML reports from Project Iris data, create or consume LLM insight JSON, and explain progress without personal evaluation.
---

# Project Iris

Project Iris turns distributed project work signals into a PM-facing daily report. Treat the user experience as a Skill-first workflow: users ask in natural language, while the local CLI and scripts act as deterministic evidence collectors and report renderers.

## Core Stance

- Final surface: Project Iris Skill, installable from Skill catalogs such as Vercel Skills or Clawhub.
- Internal engine: local Project Iris CLI/scripts for `.planwise` data, provider import/export/sync, snapshots, and report files.
- Audience: PMs, project leads, and engineering leads.
- Narrative: "our team vs project issues." Contributions are about people helping the project move forward; problems are Issue/project conditions, not personal failures.
- LLM role: read Issue title/body/labels/provider refs and judge what the Issue means, why it matters, and what support or decision is needed.
- Evidence rule: do not invent project facts. Use WBS tasks, provider refs, snapshots, sync diffs, Issue URLs, and saved insight JSON as grounding.

## Standard Workflow

1. Locate or initialize the project workspace.
   - Prefer an existing `.planwise/` directory.
   - If missing, explain that Project Iris needs local project evidence before a report can be generated.

2. Refresh deterministic evidence when appropriate.
   - Import provider data if the user asks for current GitHub/GitLab/Excel status.
   - Preserve provider refs and local files.
   - For GitLab projects, use optional enrichment when issue links or merge requests matter: `--include-links`, `--include-merge-requests`, or `--enrich`.
   - Use label scope when the user mentions release, milestone, project area, or label-based management.

3. Generate or update LLM insight JSON.
   - Read relevant Issue title/body/labels/status/provider refs.
   - Save judgements as `.planwise/reports/daily/YYYY-MM-DD.insights.json` when producing a daily report.
   - For each important Issue, include:
     - `priority`
     - `category`
     - `reason`
     - `attention_reason`
     - `suggested_action`
     - `support_comment`
     - `evidence_summary`
   - For progress items, include:
     - `progress_signal`
     - `evidence_summary`
   - Keep positive messages modest and specific, not exaggerated.

4. Generate the daily report.
   - Use the repository's report generator or future `iris report daily --format html` command.
   - The report should include:
     - イシュー概況
     - 未完了イシュー バーンダウン
     - 今日の焦点
     - 主な進捗（根拠つき）
     - 注目すべきイシュー
     - 制約と次の改善

5. Verify the report.
   - Open the generated HTML when a browser is available.
   - Check that Japanese/i18n labels are consistent.
   - Check that LLM judgements are grounded in Issue content.
   - Check that the report does not blame individuals.
   - Check layout at desktop/mobile widths when UI changes were made.

## Report Tone

- Main progress: include a light positive message such as "着実に進んでいます" or "良い流れです" only when backed by closed Issues or other progress evidence.
- Today's focus: include support comments that help progress, such as who or which area should be consulted, what decision is blocking progress, or what would reduce rework.
- Attention items: focus on blocked Issues, dependency targets, stale Issues, and LLM-identified support needs.
- Avoid ranking people, assigning blame, or implying personal underperformance.

## Current Repository Commands

When working inside the Project Iris repository, the current report prototype can be generated with:

```powershell
node scripts\generate-daily-report.js --output-dir tmp\nodejs-org --repo nodejs/nodejs.org --date 2026-06-08
```

Run tests after changing implementation:

```powershell
npm test
```

## Catalog Packaging Notes

For Vercel Skills / Clawhub style distribution, keep this folder installable as a standalone Skill package:

- `SKILL.md` is the required agent-facing entrypoint.
- `agents/openai.yaml` provides catalog/display metadata.
- Do not rely on hidden local context; describe required project files and commands in the Skill.
- Keep bundled instructions concise. Put large examples or templates in separate files only when needed.
