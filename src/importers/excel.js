const path = require("node:path");
const readXlsxFile = require("read-excel-file/node");
const { mergeTasks } = require("./merge");
const { loadWbs, saveWbs } = require("../wbs");

const COLUMN_ALIASES = {
  id: ["id", "task id", "task_id", "wbs id"],
  title: ["title", "task", "name", "summary"],
  description: ["description", "desc", "body"],
  status: ["status", "state"],
  priority: ["priority"],
  owner: ["owner", "assignee", "担当"],
  labels: ["labels", "label", "tags"],
  milestone: ["milestone", "phase"],
  depends_on: ["depends_on", "depends on", "dependencies", "depends"],
  acceptance: ["acceptance", "acceptance criteria", "done when"],
  risks: ["risks", "risk"]
};

function parseExcelImportArgs(args) {
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

    if (arg === "--sheet") {
      if (!next || next.startsWith("--")) throw new Error("--sheet requires a sheet name or number");
      const sheetNumber = Number.parseInt(next, 10);
      options.sheet = Number.isInteger(sheetNumber) && String(sheetNumber) === next ? sheetNumber : next;
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

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

function splitList(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  return String(value)
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyCell(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  return text === "" ? undefined : text;
}

function columnIndexesFor(headers) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const indexes = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normalizedAliases = aliases.map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
    if (index >= 0) {
      indexes[field] = index;
    }
  }

  return indexes;
}

function rowsToTasks(rows, sourcePath) {
  if (rows.length === 0) {
    return [];
  }

  const indexes = columnIndexesFor(rows[0]);
  if (indexes.title === undefined) {
    throw new Error("Excel sheet must include a title/task/name/summary column");
  }

  return rows.slice(1)
    .map((row, rowIndex) => {
      const title = stringifyCell(row[indexes.title]);
      if (!title) {
        return null;
      }

      const spreadsheetRow = rowIndex + 2;
      const id = indexes.id === undefined ? `XL-${spreadsheetRow}` : stringifyCell(row[indexes.id]) || `XL-${spreadsheetRow}`;
      const task = {
        id,
        title,
        status: stringifyCell(row[indexes.status]) || "todo",
        depends_on: splitList(row[indexes.depends_on]),
        provider_refs: [{
          provider: "excel",
          type: "row",
          path: sourcePath,
          row: spreadsheetRow
        }]
      };

      for (const field of ["description", "priority", "owner", "milestone"]) {
        if (indexes[field] !== undefined) {
          const value = stringifyCell(row[indexes[field]]);
          if (value) task[field] = value;
        }
      }

      for (const field of ["labels", "acceptance", "risks"]) {
        if (indexes[field] !== undefined) {
          const values = splitList(row[indexes[field]]);
          if (values.length > 0) task[field] = values;
        }
      }

      return task;
    })
    .filter(Boolean);
}

async function importExcelTasks(options) {
  const sourcePath = path.resolve(options.path);
  const result = await readXlsxFile(sourcePath, options.sheet ? { sheet: options.sheet } : undefined);
  const rows = Array.isArray(result[0]) ? result : result[0].data;
  const incomingTasks = rowsToTasks(rows, sourcePath);
  const wbs = loadWbs(options.outputDir);
  const merged = mergeTasks(wbs.tasks, incomingTasks);
  saveWbs({ ...wbs, tasks: merged.tasks }, options.outputDir);

  return {
    imported: incomingTasks.length,
    created: merged.created,
    updated: merged.updated
  };
}

module.exports = {
  columnIndexesFor,
  importExcelTasks,
  parseExcelImportArgs,
  rowsToTasks,
  splitList
};
