const { setTaskDate } = require("../dates");
const { mergeTasks } = require("./merge");
const { loadWbs, saveWbs } = require("../wbs");
const { normalizeTask, normalizeStatus } = require("./normalize");

function parseGitLabImportArgs(args) {
  const options = {
    host: "https://gitlab.com",
    outputDir: process.cwd(),
    state: "opened",
    limit: 100
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--project") {
      if (!next || next.startsWith("--")) throw new Error("--project requires a project id or path");
      options.project = next;
      index += 1;
      continue;
    }

    if (arg === "--host") {
      if (!next || next.startsWith("--")) throw new Error("--host requires a GitLab base URL");
      options.host = next.replace(/\/+$/, "");
      index += 1;
      continue;
    }

    if (arg === "--state") {
      if (!["opened", "closed", "all"].includes(next)) {
        throw new Error("--state must be one of: opened, closed, all");
      }
      options.state = next;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number.parseInt(next, 10);
      if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit requires a positive integer");
      options.limit = limit;
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

  if (!options.project) {
    throw new Error("--project is required");
  }

  return options;
}

function gitlabStatusForIssue(issue) {
  if (issue.state === "closed") {
    return "done";
  }

  const labels = issue.labels || [];
  if (labels.some((label) => String(label).toLowerCase() === "blocked")) {
    return "blocked";
  }

  return "todo";
}

function gitlabPriorityForIssue(issue) {
  const labels = (issue.labels || []).map((label) => String(label).toLowerCase());
  for (const priority of ["urgent", "high", "medium", "low"]) {
    if (labels.includes(priority) || labels.includes(`priority:${priority}`)) {
      return priority;
    }
  }
  return undefined;
}

function issueToTask(issue, { host = "https://gitlab.com", project }) {
  const providerRef = {
    provider: "gitlab",
    type: "issue",
    host,
    project,
    id: issue.iid,
    global_id: issue.id,
    url: issue.web_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at
  };

  if (issue.closed_at) {
    providerRef.closed_at = issue.closed_at;
  }

  const task = {
    id: `GL-${issue.iid}`,
    title: issue.title,
    status: gitlabStatusForIssue(issue),
    labels: issue.labels || [],
    depends_on: [],
    provider_refs: [providerRef]
  };

  const priority = gitlabPriorityForIssue(issue);
  if (priority) task.priority = priority;
  if (issue.description) task.description = issue.description;
  if (issue.assignees && issue.assignees.length > 0) task.owner = issue.assignees[0].username;
  if (issue.milestone) task.milestone = issue.milestone.title;

  setTaskDate(task, "start_date", issue.start_date, {
    provider: "gitlab",
    source: "issue",
    field: "start_date"
  });
  setTaskDate(task, "due_date", issue.due_date, {
    provider: "gitlab",
    source: "issue",
    field: "due_date"
  });

  if (!task.start_date && issue.milestone && issue.milestone.start_date) {
    setTaskDate(task, "start_date", issue.milestone.start_date, {
      provider: "gitlab",
      source: "milestone",
      field: "start_date"
    });
  }

  if (!task.due_date && issue.milestone && issue.milestone.due_date) {
    setTaskDate(task, "due_date", issue.milestone.due_date, {
      provider: "gitlab",
      source: "milestone",
      field: "due_date"
    });
  }

  if (!task.start_date && issue.iteration && issue.iteration.start_date) {
    setTaskDate(task, "start_date", issue.iteration.start_date, {
      provider: "gitlab",
      source: "iteration",
      field: "start_date"
    });
  }

  if (!task.due_date && issue.iteration && issue.iteration.due_date) {
    setTaskDate(task, "due_date", issue.iteration.due_date, {
      provider: "gitlab",
      source: "iteration",
      field: "due_date"
    });
  }

  task.status = normalizeStatus(task.status);
  return normalizeTask(task);
}

async function fetchGitLabIssues({ host, project, state, limit, token }) {
  const issues = [];
  let page = 1;
  const encodedProject = encodeURIComponent(project);

  while (issues.length < limit) {
    const perPage = Math.min(100, limit - issues.length);
    const params = new URLSearchParams({
      scope: "all",
      per_page: String(perPage),
      page: String(page)
    });
    if (state !== "all") {
      params.set("state", state);
    }

    const url = `${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues?${params.toString()}`;
    const headers = {
      "User-Agent": "project-iris"
    };
    if (token) {
      headers["PRIVATE-TOKEN"] = token;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitLab request failed (${response.status}): ${await response.text()}`);
    }

    const pageItems = await response.json();
    issues.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }
    page += 1;
  }

  return issues.slice(0, limit);
}

async function importGitLabIssues(options) {
  const wbs = loadWbs(options.outputDir);
  const issues = await fetchGitLabIssues({
    ...options,
    token: process.env.GITLAB_TOKEN
  });
  const incomingTasks = issues.map((issue) => issueToTask(issue, options));
  const merged = mergeTasks(wbs.tasks, incomingTasks);
  saveWbs({ ...wbs, tasks: merged.tasks }, options.outputDir);

  return {
    imported: incomingTasks.length,
    created: merged.created,
    updated: merged.updated
  };
}

module.exports = {
  fetchGitLabIssues,
  gitlabPriorityForIssue,
  gitlabStatusForIssue,
  importGitLabIssues,
  issueToTask,
  parseGitLabImportArgs
};
