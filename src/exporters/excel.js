const { loadWbs } = require("../wbs");
const { writeXlsx } = require("../xlsx");

const EXPORT_HEADERS = [
  "id",
  "title",
  "status",
  "priority",
  "owner",
  "labels",
  "milestone",
  "start_date",
  "due_date",
  "target_date",
  "depends_on",
  "acceptance",
  "risks",
  "description",
  "provider_refs"
];

function parseExcelExportArgs(args) {
  const options = {
    outputDir: process.cwd()
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--path") {
      if (!next || next.startsWith("--")) throw new Error("--path requires an .xlsx file path");
      options.path = next;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      if (!next || next.startsWith("--")) throw new Error("--output-dir requires a directory path");
      options.outputDir = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.path) {
    throw new Error("--path is required");
  }

  return options;
}

function listValue(value, separator = ", ") {
  return Array.isArray(value) ? value.join(separator) : "";
}

function taskToRow(task) {
  return [
    task.id,
    task.title,
    task.status || "",
    task.priority || "",
    task.owner || "",
    listValue(task.labels),
    task.milestone || "",
    task.start_date || "",
    task.due_date || "",
    task.target_date || "",
    listValue(task.depends_on),
    listValue(task.acceptance, "\n"),
    listValue(task.risks, "\n"),
    task.description || "",
    task.provider_refs ? JSON.stringify(task.provider_refs) : ""
  ];
}

function tasksToRows(tasks) {
  return [
    EXPORT_HEADERS,
    ...tasks.map(taskToRow)
  ];
}

function exportExcelTasks(options) {
  const wbs = loadWbs(options.outputDir);
  const target = writeXlsx(options.path, tasksToRows(wbs.tasks));
  return {
    exported: wbs.tasks.length,
    path: target
  };
}

module.exports = {
  EXPORT_HEADERS,
  exportExcelTasks,
  parseExcelExportArgs,
  tasksToRows
};
