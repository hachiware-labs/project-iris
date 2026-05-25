const fs = require("node:fs");
const path = require("node:path");

function projectIdFromOutputDir(outputDir) {
  const resolved = path.resolve(outputDir);
  return path.basename(resolved) || "project-iris";
}

function templates(outputDir) {
  const projectId = projectIdFromOutputDir(outputDir);
  const projectName = projectId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Project Iris";

  return {
    "project.yaml": `version: 1

project:
  id: ${projectId}
  name: ${projectName}
  description: Portable project plans that AI can read, analyze, and guide.
  owner: ""
  status: active

goals: []
milestones: []
`,
    "wbs.yaml": `version: 1

tasks: []
`,
    "providers.yaml": `version: 1

providers:
  github:
    enabled: false
    default_repo: ""
    auth:
      token_env: GITHUB_TOKEN
    mapping:
      status:
        todo: open
        in_progress: open
        blocked: open
        review: open
        done: closed
        cancelled: closed
      priority:
        urgent: priority:urgent
        high: priority:high
        medium: priority:medium
        low: priority:low
  excel:
    enabled: false
    default_path: ./wbs.xlsx
`,
    "rubrics/default.yaml": `version: 1

rubric:
  id: default-project-review
  name: Default Project Review

criteria:
  - id: task_granularity
    name: タスク粒度
    description: タスクが実行可能な粒度に分割されているか
    severity: medium
  - id: acceptance_clarity
    name: 受け入れ条件
    description: 完了判定が具体的で検証可能か
    severity: high
  - id: dependency_consistency
    name: 依存関係
    description: 循環依存や未定義タスクへの依存がないか
    severity: high
  - id: priority_alignment
    name: 優先度の妥当性
    description: 優先度が現在の目標やマイルストーンに合っているか
    severity: medium
  - id: blocker_visibility
    name: ブロッカーの可視性
    description: ブロッカーが明示され、放置されていないか
    severity: high
  - id: evidence_quality
    name: 完了根拠
    description: doneになっているタスクに十分な根拠があるか
    severity: medium
  - id: provider_mapping
    name: 外部対応関係
    description: provider_refsが壊れていないか
    severity: medium
`
  };
}

function initPlanwise({ outputDir = process.cwd(), force = false } = {}) {
  const rootDir = path.resolve(outputDir);
  const planwiseDir = path.join(rootDir, ".planwise");

  if (fs.existsSync(planwiseDir) && !force) {
    throw new Error(`${planwiseDir} already exists. Use --force to overwrite.`);
  }

  fs.mkdirSync(planwiseDir, { recursive: true });
  fs.mkdirSync(path.join(planwiseDir, "rubrics"), { recursive: true });

  const files = [];
  for (const [relativePath, content] of Object.entries(templates(rootDir))) {
    const target = path.join(planwiseDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    files.push(target);
  }

  return {
    planwiseDir,
    files
  };
}

module.exports = {
  initPlanwise,
  templates
};
