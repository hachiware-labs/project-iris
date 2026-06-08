#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { loadWbs } = require("../src/wbs");
const { summarizeTasks } = require("../src/status");

function parseArgs(args) {
  const options = {
    outputDir: process.cwd(),
    date: new Date().toISOString().slice(0, 10),
    labels: [],
    repo: undefined,
    insightsFile: undefined,
    insights: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--output-dir") {
      if (!next || next.startsWith("--")) throw new Error("--output-dir requires a directory path");
      options.outputDir = next;
      index += 1;
      continue;
    }

    if (arg === "--date") {
      if (!next || next.startsWith("--")) throw new Error("--date requires YYYY-MM-DD");
      options.date = next;
      index += 1;
      continue;
    }

    if (arg === "--repo") {
      if (!next || next.startsWith("--")) throw new Error("--repo requires owner/name");
      options.repo = next;
      index += 1;
      continue;
    }

    if (arg === "--label") {
      if (!next || next.startsWith("--")) throw new Error("--label requires a label name");
      options.labels.push(next);
      index += 1;
      continue;
    }

    if (arg === "--insights-file") {
      if (!next || next.startsWith("--")) throw new Error("--insights-file requires a JSON file path");
      options.insightsFile = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveInsightsFile(options) {
  if (options.insightsFile) return path.resolve(options.insightsFile);
  return path.join(path.resolve(options.outputDir), ".planwise", "reports", "daily", `${options.date}.insights.json`);
}

function loadInsights(options) {
  if (options.insights) return options.insights;

  const insightsPath = resolveInsightsFile(options);
  if (!fs.existsSync(insightsPath)) {
    return {
      analysis_mode: "rule_fallback",
      issue_insights: {}
    };
  }

  return {
    analysis_mode: "llm_assisted",
    source_path: insightsPath,
    ...loadJsonFile(insightsPath)
  };
}

function issueInsightsMap(insights) {
  return new Map(Object.entries((insights && insights.issue_insights) || {}));
}

function providerRef(task) {
  return (task.provider_refs || [])[0] || {};
}

function parseDate(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? undefined : new Date(time);
}

function ageDays(date, now) {
  if (!date) return undefined;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function compareRefDate(field) {
  return (a, b) => {
    const aTime = Date.parse(providerRef(a)[field] || "");
    const bTime = Date.parse(providerRef(b)[field] || "");
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  };
}

function classifyTask(task) {
  const text = `${task.title} ${(task.labels || []).join(" ")} ${task.description || ""}`.toLowerCase();

  if (text.includes("download") || text.includes("install") || text.includes("aix") || text.includes("wsl")) {
    return "ダウンロード体験";
  }

  if (text.includes("sidebar") || text.includes("navigation") || text.includes("navbar")) {
    return "ナビゲーションUX";
  }

  if (text.includes("rss") || text.includes("blog") || text.includes("feed")) {
    return "コンテンツ配信";
  }

  if (text.includes("accessib") || text.includes("screen reader") || text.includes("keyboard")) {
    return "アクセシビリティ";
  }

  return "プロジェクト課題";
}

function recommendationFor(task) {
  const title = task.title.toLowerCase();

  if (title.includes("language-agnostic")) {
    return "localization/routing policy owner を決め、/download の期待挙動を Issue 上で合意する。";
  }

  if (title.includes("sidebar")) {
    return "Sidebar の active item visibility を小さな修正単位に切り出し、実装可否を確認する。";
  }

  if (title.includes("dropdown") || title.includes("installing")) {
    return "初心者向け download UX の判断として、非該当 option を非表示にするかを決める。";
  }

  return "次に必要な判断、実装 owner、受け入れ条件を Issue に追記する。";
}

function supportCommentFor(task, insight = {}) {
  if (insight.support_comment) return insight.support_comment;

  const category = String(insight.category || classifyTask(task));
  if (category.includes("CI") || category.includes("リリース")) {
    return "build や release の前提知識が要るため、一人で抱えず、運用に詳しい人へ早めに確認をもらうと進めやすいです。";
  }

  if (category.includes("UX") || category.includes("ナビゲーション") || category.includes("導線")) {
    return "仕様判断と体験確認が混ざるため、実装前に design / docs 側の見方を短くもらえると手戻りを減らせます。";
  }

  if (task.owner) {
    return `${task.owner} が進めやすいように、判断待ちの点やレビューしてほしい点を Issue 上で一つに絞るとよさそうです。`;
  }

  return "やりにくい点がないかを確認し、判断が必要な点だけ先に Issue 上で合意すると進めやすいです。";
}

function isLowSignalClosedTask(task) {
  const title = String(task.title || "").trim().toLowerCase();
  if (["new", "policy"].includes(title)) return true;
  if (title.length < 8) return true;
  return false;
}

function taskLifetimeDays(task) {
  const ref = providerRef(task);
  const createdAt = parseDate(ref.created_at);
  const closedAt = parseDate(ref.closed_at);
  if (!createdAt || !closedAt) return undefined;
  return ageDays(createdAt, closedAt);
}

function complexityScore(task) {
  const text = `${task.title} ${(task.labels || []).join(" ")} ${task.description || ""}`.toLowerCase();
  const keywords = [
    "migration",
    "migrate",
    "release",
    "security",
    "performance",
    "accessibility",
    "breaking",
    "architecture",
    "refactor",
    "download",
    "installer",
    "build"
  ];
  const keywordScore = keywords.filter((keyword) => text.includes(keyword)).length;
  const descriptionScore = String(task.description || "").length > 900 ? 1 : 0;
  const lifetime = taskLifetimeDays(task);
  const lifetimeScore = lifetime !== undefined && lifetime >= 30 ? 1 : 0;
  const labelScore = (task.labels || []).length >= 2 ? 1 : 0;
  return keywordScore + descriptionScore + lifetimeScore + labelScore;
}

function positiveSignalFor(task) {
  const score = complexityScore(task);
  const lifetime = taskLifetimeDays(task);

  if (score >= 2 && lifetime !== undefined && lifetime >= 30) {
    return `${lifetime}日残っていた難しめの Issue が完了し、プロジェクトの詰まりが一つ減った。`;
  }

  if (score >= 2) {
    return "範囲や判断が重くなりやすい Issue が完了し、チームの前進として扱える。";
  }

  return "Issue が close され、未完了項目が減った。";
}

function positiveSummaryFor(credibleClosedTasks, yesterdayClosedCount) {
  if (credibleClosedTasks.length === 0) {
    return "このスコープでは、主な進捗として扱える close 済み Issue はまだ見つかっていない。";
  }

  const significantCount = credibleClosedTasks.filter((task) => complexityScore(task) >= 2).length;
  const dailyPrefix = yesterdayClosedCount > 0
    ? `昨日から ${yesterdayClosedCount}件の Issue が close された。`
    : `${credibleClosedTasks.length}件の close 済み Issue が確認できる。`;

  if (significantCount > 0) {
    return `${dailyPrefix} そのうち ${significantCount}件は長く残っていた、または複雑さがありそうな完了として優先して見る。`;
  }

  return `${dailyPrefix} 大きさよりも、未完了項目を着実に減らした変化として見る。`;
}

function progressMessageFor(contributionSignals, insights) {
  if (insights.progress_message) return insights.progress_message;
  if (contributionSignals.length > 0) {
    return "派手さは控えめですが、利用者の導線や日々の作業体験に効く改善が着実に閉じられています。";
  }
  return "大きな完了はまだ少ないものの、見るべき論点は少しずつ整理されています。";
}

function focusMessageFor(focusItems, insights) {
  if (insights.focus_message) return insights.focus_message;
  if (focusItems.length === 0) {
    return "今日時点では、追加で支援コメントを出すべき焦点は見つかっていません。";
  }
  return "今日の焦点は、実装量よりも判断や分担を先に整えると進めやすい Issue です。やりにくい点がないかを早めに確認し、近い領域の人に相談できる状態を作るとよさそうです。";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeBody(task, maxLength = 180) {
  const clean = stripMarkdown(task.description);
  if (!clean) return "本文要約に使える説明が不足している。";
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
}

function matchesLabels(task, labels) {
  if (!labels || labels.length === 0) return true;
  const taskLabels = new Set((task.labels || []).map((label) => String(label).toLowerCase()));
  return labels.every((label) => taskLabels.has(String(label).toLowerCase()));
}

function scopeLabel(labels) {
  return labels && labels.length > 0 ? `ラベル: ${labels.join(", ")}` : "取り込み済み全イシュー";
}

function makeBurndown(openTasks, options) {
  return {
    scope: scopeLabel(options.labels),
    metric: "open_issues",
    points: [
      {
        date: options.date,
        open_count: openTasks.length
      }
    ],
    note: "現在は1点のみ。snapshot 履歴が増えると Open Issue 数の推移として表示する。"
  };
}

function isBlockedTask(task) {
  const labels = (task.labels || []).map((label) => String(label).toLowerCase());
  return task.status === "blocked" || labels.some((label) => ["blocked", "blocker", "blocking"].includes(label));
}

function dependencyCounts(tasks) {
  const counts = new Map();
  for (const task of tasks) {
    for (const dependencyId of task.depends_on || []) {
      counts.set(dependencyId, (counts.get(dependencyId) || 0) + 1);
    }
  }
  return counts;
}

function providerBlockingCount(task) {
  return (task.provider_refs || []).reduce((total, ref) => {
    const directCount = Number.parseInt(ref.blocking_issues_count, 10);
    const linkCount = Array.isArray(ref.issue_links)
      ? ref.issue_links.filter((link) => link.type === "blocks").length
      : 0;
    return total + (Number.isFinite(directCount) ? directCount : 0) + linkCount;
  }, 0);
}

function importanceFor(task, dependencyCount) {
  const reasons = [];
  let score = 0;
  if (isBlockedTask(task)) {
    reasons.push("blocked として扱われている");
    score += 1;
  }
  if (dependencyCount > 0) {
    reasons.push(`${dependencyCount}件の Issue の依存先になっている`);
    score += dependencyCount;
  }
  const blockingCount = providerBlockingCount(task);
  if (blockingCount > 0) {
    reasons.push(`${blockingCount}件の Issue を止めている可能性がある`);
    score += blockingCount;
  }

  return {
    score,
    reasons
  };
}

function insightFor(insightsById, task) {
  return insightsById.get(task.id) || {};
}

function insightPriority(insight) {
  const value = String(insight.priority || insight.importance || "").toLowerCase();
  if (["critical", "high", "重要"].includes(value)) return 3;
  if (["medium", "normal", "中"].includes(value)) return 2;
  if (["low", "低"].includes(value)) return 1;
  return 0;
}

function isAttentionTask(task, days, importance, insight = {}) {
  if (insight.attention === true || insight.attention_reason) return true;
  return importance.score > 0 || (days !== undefined && days >= 14);
}

function categoryFor(task, importance, insight = {}) {
  if (insight.category) return insight.category;
  return importance.score > 0 ? "重要イシュー" : classifyTask(task);
}

function compareIssuePriority(now, dependencyCountById, insightsById) {
  return (a, b) => {
    const aInsightPriority = insightPriority(insightFor(insightsById, a));
    const bInsightPriority = insightPriority(insightFor(insightsById, b));
    if (aInsightPriority !== bInsightPriority) return bInsightPriority - aInsightPriority;

    const aImportance = importanceFor(a, dependencyCountById.get(a.id) || 0).score;
    const bImportance = importanceFor(b, dependencyCountById.get(b.id) || 0).score;
    if (aImportance !== bImportance) return bImportance - aImportance;

    const aAge = ageDays(parseDate(providerRef(a).updated_at), now) ?? -1;
    const bAge = ageDays(parseDate(providerRef(b).updated_at), now) ?? -1;
    if (aAge !== bAge) return bAge - aAge;

    return compareRefDate("updated_at")(a, b);
  };
}

function makeReportData(wbs, options) {
  const now = new Date(`${options.date}T00:00:00Z`);
  const insights = loadInsights(options);
  const insightsById = issueInsightsMap(insights);
  const scopedTasks = wbs.tasks.filter((task) => matchesLabels(task, options.labels));
  const dependencyCountById = dependencyCounts(scopedTasks);
  const summary = summarizeTasks(scopedTasks);
  const openTasks = scopedTasks
    .filter((task) => !["done", "cancelled"].includes(task.status))
    .sort(compareIssuePriority(now, dependencyCountById, insightsById));
  const closedTasks = scopedTasks
    .filter((task) => task.status === "done")
    .sort(compareRefDate("closed_at"));
  const credibleClosedTasks = closedTasks.filter((task) => !isLowSignalClosedTask(task));
  const yesterdayStart = new Date(now.getTime() - 86400000);
  const yesterdayClosedCount = credibleClosedTasks.filter((task) => {
    const closedAt = parseDate(providerRef(task).closed_at);
    return closedAt && closedAt >= yesterdayStart && closedAt < now;
  }).length;

  const focusItems = openTasks.slice(0, 3).map((task) => {
    const ref = providerRef(task);
    const updatedAt = parseDate(ref.updated_at);
    const days = ageDays(updatedAt, now);
    const importance = importanceFor(task, dependencyCountById.get(task.id) || 0);
    const insight = insightFor(insightsById, task);
    return {
      id: task.id,
      title: task.title,
      url: ref.url,
      category: categoryFor(task, importance, insight),
      updated_at: ref.updated_at,
      age_days: days,
      importance_reasons: importance.reasons,
      reason: insight.reason || (importance.reasons.length > 0
        ? importance.reasons.join("。") + "。"
        : days !== undefined && days >= 14
        ? `${days}日更新がなく、PM の確認対象に向く。`
        : "未完了で直近のプロジェクト焦点に入る。"),
      suggested_action: insight.suggested_action || recommendationFor(task),
      evidence: insight.evidence_summary || summarizeBody(task),
      support_comment: supportCommentFor(task, insight),
      judgement_source: insight.reason ? "llm" : "rule"
    };
  });

  const contributionSignals = credibleClosedTasks
    .slice()
    .sort((a, b) => {
      const scoreDiff = complexityScore(b) - complexityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return compareRefDate("closed_at")(a, b);
    })
    .slice(0, 6)
    .map((task) => {
    const ref = providerRef(task);
    const insight = insightFor(insightsById, task);
    return {
      id: task.id,
      title: task.title,
      url: ref.url,
      closed_at: ref.closed_at,
      contributor: task.owner || "Node.js Website contributors",
      signal: insight.progress_signal || positiveSignalFor(task),
      evidence: insight.evidence_summary || summarizeBody(task, 140),
      judgement_source: insight.progress_signal ? "llm" : "rule"
    };
  });

  const projectIssueAttention = openTasks.map((task) => {
    const ref = providerRef(task);
    const updatedAt = parseDate(ref.updated_at);
    const days = ageDays(updatedAt, now);
    const importance = importanceFor(task, dependencyCountById.get(task.id) || 0);
    const insight = insightFor(insightsById, task);
    return {
      id: task.id,
      title: task.title,
      url: ref.url,
      category: categoryFor(task, importance, insight),
      updated_at: ref.updated_at,
      age_days: days,
      importance_reasons: importance.reasons,
      should_show_attention: isAttentionTask(task, days, importance, insight),
      attention: insight.attention_reason || (importance.reasons.length > 0
        ? importance.reasons.join("。") + "。"
        : days !== undefined && days >= 14
        ? "更新間隔が空いているため、判断待ちや優先度確認の対象。"
        : "未完了のため、次の判断または実装整理の対象。"),
      suggested_action: insight.suggested_action || recommendationFor(task),
      evidence: insight.evidence_summary || summarizeBody(task, 120),
      judgement_source: insight.attention_reason ? "llm" : "rule"
    };
  }).filter((item) => item.should_show_attention);

  return {
    generated_at: new Date().toISOString(),
    report_date: options.date,
    repository: options.repo || providerRef(scopedTasks[0] || wbs.tasks[0] || {}).repo || "unknown",
    scope: {
      label: scopeLabel(options.labels),
      labels: options.labels,
      source_task_count: wbs.tasks.length
    },
    source: {
      task_count: scopedTasks.length,
      open_count: openTasks.length,
      done_count: closedTasks.length,
      credible_done_count: credibleClosedTasks.length,
      yesterday_done_count: yesterdayClosedCount
    },
    summary,
    analysis: {
      mode: insights.analysis_mode || "rule_fallback",
      source_path: insights.source_path
    },
    open_issue_burndown: makeBurndown(openTasks, options),
    focus_items: focusItems,
    focus_message: focusMessageFor(focusItems, insights),
    positive_summary: insights.positive_summary || positiveSummaryFor(credibleClosedTasks, yesterdayClosedCount),
    progress_message: progressMessageFor(contributionSignals, insights),
    contribution_signals: contributionSignals,
    project_issue_attention: projectIssueAttention,
    limitations: [
      "snapshot 履歴がないため、「主な進捗」は厳密な日次差分ではなく、取り込み範囲で確認できた close 済み Issue も根拠つきで表示している。",
      "GitHub Issue の close 実行者やレビュー履歴は現行 WBS に保存されていないため、貢献者名は owner がない場合に team contributor として表現している。",
      "PR/MR の merge 情報は現行 import の対象外であるため、完了シグナルは GitHub Issue の close を中心に表示している。",
      "snapshot 履歴がないため、burndown は1点のみで、delivery outlook は定量予測ではなく現在状態の説明に留めている。"
    ]
  };
}

function renderTaskLink(item) {
  if (!item.url) return escapeHtml(item.id);
  return `<a href="${escapeHtml(item.url)}">${escapeHtml(item.id)}</a>`;
}

function renderHtml(report) {
  const burndownPoint = report.open_issue_burndown.points[report.open_issue_burndown.points.length - 1];
  const scopeText = report.scope && report.scope.label ? report.scope.label : "取り込み済み全イシュー";
  const focusRows = report.focus_items.map((item) => `
        <article class="item focus">
          <div class="item-top"><span class="tag ${item.category === "重要イシュー" ? "important" : ""}">${escapeHtml(item.category)}</span><span>${renderTaskLink(item)}</span></div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.reason)}</p>
          <p class="evidence">${escapeHtml(item.evidence)}</p>
          <p class="support">${escapeHtml(item.support_comment)}</p>
          <p class="action">${escapeHtml(item.suggested_action)}</p>
        </article>`).join("");

  const contributionRows = report.contribution_signals.map((item) => `
        <article class="item">
          <div class="item-top"><span class="tag good">前進シグナル</span><span>${renderTaskLink(item)}</span></div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.contributor)}: ${escapeHtml(item.signal)}</p>
          <p class="evidence">${escapeHtml(item.evidence)}</p>
        </article>`).join("");

  const issueRows = report.project_issue_attention.map((item) => `
        <tr>
          <td>${renderTaskLink(item)}</td>
          <td>${escapeHtml(item.title)}</td>
          <td><span class="tag ${item.category === "重要イシュー" ? "important" : ""}">${escapeHtml(item.category)}</span></td>
          <td>${item.age_days === undefined ? "不明" : `${item.age_days}日`}</td>
          <td>${escapeHtml(item.attention)} <span class="cell-evidence">${escapeHtml(item.evidence)}</span> ${escapeHtml(item.suggested_action)}</td>
        </tr>`).join("");
  const emptyIssueRow = report.project_issue_attention.length === 0
    ? `<tr><td colspan="5">このスコープでは、動きが止まっている、または他 Issue を止めている未完了 Issue は見つからない。</td></tr>`
    : "";

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project Iris 日次レポート - ${escapeHtml(report.repository)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7fb;
      --surface: #ffffff;
      --surface-soft: #f3f4f8;
      --text: #09090b;
      --muted: #52525b;
      --line: #e4e4e7;
      --accent: #4f46e5;
      --accent-strong: #4338ca;
      --accent-soft: #eef2ff;
      --good: #0f766e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Geist, "Geist Fallback", "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    header {
      background: var(--surface);
      color: var(--text);
      border-bottom: 1px solid var(--line);
    }
    .brandbar {
      max-width: 1200px;
      margin: 0 auto;
      padding: 18px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent-strong);
      border: 1px solid #d8dcff;
      font-weight: 800;
      letter-spacing: 0;
    }
    .brand-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.18em;
      line-height: 1.2;
    }
    .brand-tagline {
      color: var(--accent-strong);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.24em;
      margin-top: 2px;
    }
    .report-hero {
      max-width: 1200px;
      margin: 0 auto;
      padding: 56px 32px 48px;
      background:
        radial-gradient(circle at 86% 24%, rgba(79, 70, 229, 0.12), transparent 34%),
        linear-gradient(90deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.76));
    }
    main { max-width: 1200px; margin: 0 auto; padding: 28px 32px 40px; }
    h1 { margin: 0 0 14px; font-size: 48px; line-height: 1.08; letter-spacing: 0; max-width: 760px; }
    h2 { margin: 30px 0 12px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 8px 0; font-size: 16px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    a { color: var(--accent-strong); }
    .eyebrow {
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .subtitle { color: var(--muted); margin: 0; font-size: 18px; max-width: 760px; }
    .grid { display: grid; gap: 16px; }
    .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .metric, .item, .note, .burndown {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-width: 0;
    }
    .metric strong { display: block; font-size: 30px; color: var(--accent-strong); }
    .metric span, .muted { color: var(--muted); }
    .burndown {
      margin-top: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 20px;
      align-items: center;
    }
    .burndown-title {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .burndown-title h2 { margin: 0; }
    .chart {
      width: 100%;
      height: 116px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .chart-label { fill: var(--muted); font-size: 12px; }
    .chart-number { fill: var(--accent-strong); font-size: 22px; font-weight: 700; }
    .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .item-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .item h3, .item p, .item a { overflow-wrap: anywhere; }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 2px 10px;
      background: #e7f1ef;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tag.good { background: #ecfdf5; color: var(--good); }
    .tag.important { background: #fef2f2; color: #b91c1c; }
    .evidence { color: var(--muted); font-size: 14px; }
    .section-message {
      max-width: 900px;
      color: var(--muted);
      margin: -4px 0 14px;
    }
    .section-message.positive {
      color: #0f766e;
    }
    .support {
      color: #334155;
      background: #f8fafc;
      border-left: 3px solid #94a3b8;
      padding: 8px 10px;
      font-size: 14px;
    }
    .cell-evidence {
      display: block;
      color: var(--muted);
      font-size: 13px;
      margin: 4px 0;
    }
    .action {
      border-left: 3px solid var(--accent);
      padding-left: 10px;
      color: #312e81;
      background: #f5f3ff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .table-wrap {
      max-width: 100%;
      overflow-x: auto;
      border-radius: 8px;
    }
    .table-wrap table {
      min-width: 760px;
    }
    th, td {
      padding: 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th { background: var(--surface-soft); color: #27272a; }
    tr:last-child td { border-bottom: 0; }
    .note ul { margin: 8px 0 0; padding-left: 20px; }
    @media (max-width: 900px) {
      .brandbar { padding: 14px 20px; }
      .report-hero { padding: 34px 20px 32px; }
      h1 { font-size: 38px; }
      main { padding: 16px; }
      .metrics, .cards { grid-template-columns: 1fr; }
      .burndown { grid-template-columns: 1fr; }
      .table-wrap table { min-width: 720px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brandbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">HL</div>
        <div>
          <div class="brand-name">HACHIWARE LABS</div>
          <div class="brand-tagline">INNOVATION IN INSIGHT</div>
        </div>
      </div>
    </div>
    <div class="report-hero">
      <p class="eyebrow">PROJECT IRIS</p>
      <h1>Project Iris 日次レポート</h1>
      <p class="subtitle">${escapeHtml(report.repository)} / ${escapeHtml(report.report_date)} / チーム vs プロジェクト課題</p>
    </div>
  </header>
  <main>
    <section aria-label="イシュー概況">
      <h2>イシュー概況</h2>
      <div class="grid metrics" aria-label="概要指標">
        <div class="metric"><strong>${report.source.task_count}</strong><span>取り込みイシュー</span></div>
        <div class="metric"><strong>${report.source.open_count}</strong><span>未完了イシュー</span></div>
        <div class="metric"><strong>${report.source.done_count}</strong><span>完了イシュー</span></div>
      </div>

      <section class="burndown" aria-label="未完了イシュー バーンダウン">
        <div>
          <div class="burndown-title">
            <h3>未完了イシュー バーンダウン</h3>
            <span class="tag">${escapeHtml(scopeText)}</span>
          </div>
          <p class="muted">${escapeHtml(report.open_issue_burndown.note)}</p>
        </div>
        <svg class="chart" viewBox="0 0 240 116" role="img" aria-label="未完了イシューのバーンダウンチャート">
          <line x1="24" y1="82" x2="216" y2="82" stroke="#d9dee5" stroke-width="2" />
          <line x1="24" y1="24" x2="24" y2="82" stroke="#d9dee5" stroke-width="2" />
          <circle cx="196" cy="42" r="7" fill="#176c5f" />
          <text class="chart-number" x="172" y="34">${escapeHtml(burndownPoint.open_count)}</text>
          <text class="chart-label" x="142" y="104">${escapeHtml(burndownPoint.date)}</text>
        </svg>
      </section>
    </section>

    <section>
      <h2>今日の焦点</h2>
      <p class="section-message">${escapeHtml(report.focus_message)}</p>
      <div class="grid cards">${focusRows}</div>
    </section>

    <section>
      <h2>主な進捗（根拠つき）</h2>
      <p class="section-message positive">${escapeHtml(report.progress_message)}</p>
      <p class="muted">${escapeHtml(report.positive_summary)}</p>
      <div class="grid cards">${contributionRows}</div>
    </section>

    <section>
      <h2>注目すべきイシュー</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>イシュー</th><th>タイトル</th><th>分類</th><th>最終更新</th><th>見る理由と次アクション</th></tr>
          </thead>
          <tbody>${issueRows || emptyIssueRow}</tbody>
        </table>
      </div>
    </section>

    <section class="note">
      <h2>制約と次の改善</h2>
      <ul>${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  </main>
</body>
</html>
`;
}

function writeReport(report, outputDir) {
  const reportsDir = path.join(path.resolve(outputDir), ".planwise", "reports", "daily");
  fs.mkdirSync(reportsDir, { recursive: true });
  const base = path.join(reportsDir, report.report_date);
  const jsonPath = `${base}.json`;
  const htmlPath = `${base}.html`;
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(htmlPath, renderHtml(report), "utf8");
  return { jsonPath, htmlPath };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const wbs = loadWbs(options.outputDir);
  const report = makeReportData(wbs, options);
  const result = writeReport(report, options.outputDir);
  console.log(`Generated ${result.htmlPath}`);
  console.log(`Generated ${result.jsonPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  makeReportData,
  parseArgs,
  renderHtml
};
