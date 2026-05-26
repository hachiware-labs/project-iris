const { fetchGitHubIssues, issueToTask: githubIssueToTask, parseGitHubImportArgs } = require("../importers/github");
const { fetchGitLabIssues, issueToTask: gitlabIssueToTask, parseGitLabImportArgs } = require("../importers/gitlab");
const { parseExcelImportArgs, rowsToTasks } = require("../importers/excel");
const { taskProviderRefKey } = require("../importers/merge");
const { loadWbs } = require("../wbs");
const { savePreview } = require("./state");
const readXlsxFile = require("read-excel-file/node");
const path = require("node:path");

const COMPARE_FIELDS = [
  "title",
  "status",
  "priority",
  "owner",
  "milestone",
  "start_date",
  "due_date",
  "target_date",
  "description",
  "labels",
  "depends_on",
  "acceptance",
  "risks"
];
const LIST_FIELDS = new Set(["labels", "depends_on", "acceptance", "risks"]);

function taskKeys(task) {
  const keys = (task.provider_refs || [])
    .map(taskProviderRefKey)
    .filter(Boolean);
  if (task.id) {
    keys.push(`id:${task.id}`);
  }
  return keys;
}

function buildTaskIndex(tasks) {
  const index = new Map();
  tasks.forEach((task) => {
    for (const key of taskKeys(task)) {
      if (!index.has(key)) {
        index.set(key, task);
      }
    }
  });
  return index;
}

function normalizedValue(value, field) {
  if (LIST_FIELDS.has(field) && (value === undefined || value === null || value === "")) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String).sort();
  }
  return value === undefined || value === null ? "" : value;
}

function valuesEqual(field, left, right) {
  return JSON.stringify(normalizedValue(left, field)) === JSON.stringify(normalizedValue(right, field));
}

function findMatchingTask(task, index) {
  for (const key of taskKeys(task)) {
    if (index.has(key)) {
      return index.get(key);
    }
  }
  return undefined;
}

function previewTaskDiffs(localTasks, sourceTasks, source) {
  const diffs = [];
  const localIndex = buildTaskIndex(localTasks);
  const matchedLocalIds = new Set();

  for (const sourceTask of sourceTasks) {
    const localTask = findMatchingTask(sourceTask, localIndex);
    if (!localTask) {
      diffs.push({
        type: "only_in_source",
        source,
        task_id: sourceTask.id,
        title: sourceTask.title,
        risk: "review",
        source_task: sourceTask
      });
      continue;
    }

    matchedLocalIds.add(localTask.id);
    for (const field of COMPARE_FIELDS) {
      if (!valuesEqual(field, localTask[field], sourceTask[field])) {
        diffs.push({
          type: "field_changed",
          source,
          task_id: localTask.id,
          title: localTask.title,
          field,
          local_value: localTask[field],
          source_value: sourceTask[field],
          risk: field === "status" || field.endsWith("_date") ? "attention" : "review",
          local_task: localTask,
          source_task: sourceTask
        });
      }
    }
  }

  for (const localTask of localTasks) {
    if (!matchedLocalIds.has(localTask.id)) {
      diffs.push({
        type: "only_in_wbs",
        source,
        task_id: localTask.id,
        title: localTask.title,
        risk: "review",
        local_task: localTask
      });
    }
  }

  return diffs;
}

function stripLocalViewOptions(args) {
  const providerArgs = [];
  const localView = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--path") {
      if (!next || next.startsWith("--")) throw new Error("--path requires an .xlsx file path");
      localView.path = next;
      index += 1;
      continue;
    }

    if (arg === "--sheet") {
      if (!next || next.startsWith("--")) throw new Error("--sheet requires a sheet name or number");
      localView.sheet = next;
      index += 1;
      continue;
    }

    providerArgs.push(arg);
  }

  return { providerArgs, localView };
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value === undefined || value === null || value === "") {
    return "(empty)";
  }
  return String(value).replace(/\n/g, "\\n");
}

function formatSyncPreview(diffs) {
  if (diffs.length === 0) {
    return "No sync differences found.";
  }

  return [
    `Sync differences: ${diffs.length}`,
    ...diffs.map((diff) => {
      if (diff.type === "field_changed") {
        return `- ${diff.task_id} ${diff.field}: local=${formatValue(diff.local_value)} source=${formatValue(diff.source_value)} [${diff.risk}]`;
      }
      return `- ${diff.task_id} ${diff.type}: ${diff.title} [${diff.risk}]`;
    })
  ].join("\n");
}

async function loadExcelSourceTasks(options) {
  const sourcePath = path.resolve(options.path);
  const result = await readXlsxFile(sourcePath, options.sheet ? { sheet: options.sheet } : undefined);
  const rows = Array.isArray(result[0]) ? result : result[0].data;
  return rowsToTasks(rows, sourcePath);
}

async function loadDesiredTasks(outputDir, localView) {
  if (localView && localView.path) {
    const sheetNumber = Number.parseInt(localView.sheet, 10);
    return loadExcelSourceTasks({
      path: localView.path,
      sheet: Number.isInteger(sheetNumber) && String(sheetNumber) === localView.sheet ? sheetNumber : localView.sheet,
      outputDir
    });
  }

  return loadWbs(outputDir).tasks;
}

function buildPreview({ provider, outputDir, localView, providerOptions, diffs }) {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    provider,
    output_dir: path.resolve(outputDir),
    local_view: localView && localView.path ? {
      ...localView,
      path: path.resolve(localView.path)
    } : null,
    provider_options: {
      ...providerOptions,
      token: undefined
    },
    diffs
  };
}

async function previewSync(provider, args) {
  if (provider === "excel") {
    const options = parseExcelImportArgs(args);
    const wbs = loadWbs(options.outputDir);
    const sourceTasks = await loadExcelSourceTasks(options);
    const diffs = previewTaskDiffs(wbs.tasks, sourceTasks, "excel");
    savePreview(options.outputDir, buildPreview({
      provider,
      outputDir: options.outputDir,
      localView: { path: options.path, sheet: options.sheet },
      providerOptions: options,
      diffs
    }));
    return diffs;
  }

  if (provider === "github") {
    const { providerArgs, localView } = stripLocalViewOptions(args);
    const options = parseGitHubImportArgs(providerArgs);
    const desiredTasks = await loadDesiredTasks(options.outputDir, localView);
    const issues = await fetchGitHubIssues({
      ...options,
      token: process.env.GITHUB_TOKEN
    });
    const sourceTasks = issues.map((issue) => githubIssueToTask(issue, options.repo));
    const diffs = previewTaskDiffs(desiredTasks, sourceTasks, "github");
    savePreview(options.outputDir, buildPreview({
      provider,
      outputDir: options.outputDir,
      localView,
      providerOptions: options,
      diffs
    }));
    return diffs;
  }

  if (provider === "gitlab") {
    const { providerArgs, localView } = stripLocalViewOptions(args);
    const options = parseGitLabImportArgs(providerArgs);
    const desiredTasks = await loadDesiredTasks(options.outputDir, localView);
    const issues = await fetchGitLabIssues({
      ...options,
      token: process.env.GITLAB_TOKEN
    });
    const sourceTasks = issues.map((issue) => gitlabIssueToTask(issue, options));
    const diffs = previewTaskDiffs(desiredTasks, sourceTasks, "gitlab");
    savePreview(options.outputDir, buildPreview({
      provider,
      outputDir: options.outputDir,
      localView,
      providerOptions: options,
      diffs
    }));
    return diffs;
  }

  throw new Error("sync preview requires a provider: github, gitlab, or excel");
}

module.exports = {
  formatSyncPreview,
  previewSync,
  previewTaskDiffs
};
