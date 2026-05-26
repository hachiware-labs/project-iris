const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

function wbsPathFor(outputDir = process.cwd()) {
  return path.join(path.resolve(outputDir), ".planwise", "wbs.yaml");
}

function loadWbs(outputDir = process.cwd()) {
  const wbsPath = wbsPathFor(outputDir);

  if (!fs.existsSync(wbsPath)) {
    throw new Error(`${wbsPath} does not exist. Run iris init first.`);
  }

  const parsed = YAML.parse(fs.readFileSync(wbsPath, "utf8")) || {};
  const tasks = parsed.tasks;

  if (!Array.isArray(tasks)) {
    throw new Error(`${wbsPath} must contain a tasks array.`);
  }

  const errors = validateWbs({ ...parsed, tasks });
  if (errors.length > 0) {
    throw new Error(`${wbsPath} is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  return {
    version: parsed.version,
    tasks
  };
}

function saveWbs(wbs, outputDir = process.cwd()) {
  const errors = validateWbs(wbs);
  if (errors.length > 0) {
    throw new Error(`Cannot save invalid WBS:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  fs.writeFileSync(
    wbsPathFor(outputDir),
    `${YAML.stringify({
      version: wbs.version,
      tasks: wbs.tasks
    }).trimEnd()}\n`,
    "utf8"
  );
}

function validateWbs(wbs) {
  const errors = [];

  if (wbs.version !== 1) {
    errors.push("version must be 1");
  }

  if (!Array.isArray(wbs.tasks)) {
    errors.push("tasks must be an array");
    return errors;
  }

  const taskIds = new Set();
  const duplicateIds = new Set();

  wbs.tasks.forEach((task, index) => {
    const pathLabel = `tasks[${index}]`;

    if (!task || typeof task !== "object" || Array.isArray(task)) {
      errors.push(`${pathLabel} must be an object`);
      return;
    }

    if (typeof task.id !== "string" || task.id.trim() === "") {
      errors.push(`${pathLabel}.id is required`);
    } else if (taskIds.has(task.id)) {
      duplicateIds.add(task.id);
    } else {
      taskIds.add(task.id);
    }

    if (typeof task.title !== "string" || task.title.trim() === "") {
      errors.push(`${pathLabel}.title is required`);
    }

    for (const field of ["status", "priority", "owner", "milestone", "description", "start_date", "due_date", "target_date"]) {
      if (task[field] !== undefined && typeof task[field] !== "string") {
        errors.push(`${pathLabel}.${field} must be a string`);
      }
    }

    for (const field of ["labels", "depends_on", "acceptance", "risks", "provider_refs", "date_refs"]) {
      if (task[field] !== undefined && !Array.isArray(task[field])) {
        errors.push(`${pathLabel}.${field} must be an array`);
      }
    }
  });

  for (const id of duplicateIds) {
    errors.push(`duplicate task id: ${id}`);
  }

  wbs.tasks.forEach((task, index) => {
    if (!task || typeof task !== "object" || !Array.isArray(task.depends_on)) {
      return;
    }

    for (const dependencyId of task.depends_on) {
      if (typeof dependencyId !== "string" || dependencyId.trim() === "") {
        errors.push(`tasks[${index}].depends_on must contain task ids`);
      } else if (!taskIds.has(dependencyId)) {
        errors.push(`tasks[${index}].depends_on references unknown task id: ${dependencyId}`);
      }
    }
  });

  errors.push(...findDependencyCycles(wbs.tasks));

  return errors;
}

function findDependencyCycles(tasks) {
  const taskById = new Map();
  for (const task of tasks) {
    if (
      task &&
      typeof task === "object" &&
      !Array.isArray(task) &&
      typeof task.id === "string" &&
      task.id.trim() !== "" &&
      !taskById.has(task.id)
    ) {
      taskById.set(task.id, task);
    }
  }

  const cycles = [];
  const visited = new Set();
  const visiting = new Set();
  const stack = [];

  function visit(taskId) {
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      if (cycleStart >= 0) {
        cycles.push(`dependency cycle detected: ${[...stack.slice(cycleStart), taskId].join(" -> ")}`);
      }
      return;
    }

    if (visited.has(taskId)) {
      return;
    }

    const task = taskById.get(taskId);
    if (!task) {
      return;
    }

    visiting.add(taskId);
    stack.push(taskId);

    for (const dependencyId of task.depends_on || []) {
      if (typeof dependencyId === "string" && taskById.has(dependencyId)) {
        visit(dependencyId);
      }
    }

    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const taskId of taskById.keys()) {
    visit(taskId);
  }

  return cycles;
}

function filterTasks(tasks, filters = {}) {
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) {
      return false;
    }

    if (filters.owner && task.owner !== filters.owner) {
      return false;
    }

    if (filters.milestone && task.milestone !== filters.milestone) {
      return false;
    }

    if (filters.label && !(task.labels || []).includes(filters.label)) {
      return false;
    }

    return true;
  });
}

function findTask(tasks, taskId) {
  return tasks.find((task) => task.id === taskId);
}

function formatTaskList(tasks) {
  if (tasks.length === 0) {
    return "No tasks found.";
  }

  return tasks
    .map((task) => {
      const status = task.status || "unknown";
      const priority = task.priority ? ` ${task.priority}` : "";
      const owner = task.owner ? ` @${task.owner}` : "";
      return `${task.id} [${status}${priority}]${owner} ${task.title}`;
    })
    .join("\n");
}

function formatTaskDetails(task) {
  const lines = [
    `${task.id}: ${task.title}`,
    `Status: ${task.status || "unknown"}`
  ];

  if (task.priority) lines.push(`Priority: ${task.priority}`);
  if (task.owner) lines.push(`Owner: ${task.owner}`);
  if (task.milestone) lines.push(`Milestone: ${task.milestone}`);
  if (task.start_date) lines.push(`Start date: ${task.start_date}`);
  if (task.due_date) lines.push(`Due date: ${task.due_date}`);
  if (task.target_date) lines.push(`Target date: ${task.target_date}`);
  if (task.labels && task.labels.length > 0) lines.push(`Labels: ${task.labels.join(", ")}`);
  if (task.depends_on && task.depends_on.length > 0) lines.push(`Depends on: ${task.depends_on.join(", ")}`);
  if (task.description) lines.push("", "Description:", task.description);
  if (task.acceptance && task.acceptance.length > 0) {
    lines.push("", "Acceptance:");
    lines.push(...task.acceptance.map((item) => `- ${item}`));
  }
  if (task.risks && task.risks.length > 0) {
    lines.push("", "Risks:");
    lines.push(...task.risks.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

module.exports = {
  filterTasks,
  findTask,
  formatTaskDetails,
  formatTaskList,
  loadWbs,
  saveWbs,
  validateWbs,
  wbsPathFor
};
