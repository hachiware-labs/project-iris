const { mergeTasks } = require("./merge");
const { setTaskDate } = require("../dates");
const { loadWbs, saveWbs } = require("../wbs");

function parseGitHubImportArgs(args) {
  const options = {
    outputDir: process.cwd(),
    state: "open",
    limit: 100
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--repo") {
      if (!next || next.startsWith("--")) throw new Error("--repo requires owner/name");
      options.repo = next;
      index += 1;
      continue;
    }

    if (arg === "--state") {
      if (!["open", "closed", "all"].includes(next)) {
        throw new Error("--state must be one of: open, closed, all");
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

  if (!options.repo || !/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    throw new Error("--repo is required and must use owner/name");
  }

  return options;
}

function githubStatusForIssue(issue) {
  if (issue.state === "closed") {
    return "done";
  }

  const labels = (issue.labels || []).map((label) => label.name || label);
  if (labels.some((label) => String(label).toLowerCase() === "blocked")) {
    return "blocked";
  }

  return "todo";
}

function githubPriorityForIssue(issue) {
  const labels = (issue.labels || []).map((label) => String(label.name || label).toLowerCase());
  for (const priority of ["urgent", "high", "medium", "low"]) {
    if (labels.includes(priority) || labels.includes(`priority:${priority}`)) {
      return priority;
    }
  }
  return undefined;
}

function issueToTask(issue, repo) {
  const labels = (issue.labels || []).map((label) => label.name || label).filter(Boolean);
  const providerRef = {
    provider: "github",
    type: "issue",
    repo,
    id: issue.number,
    url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at
  };

  if (issue.closed_at) {
    providerRef.closed_at = issue.closed_at;
  }

  const task = {
    id: `GH-${issue.number}`,
    title: issue.title,
    status: githubStatusForIssue(issue),
    labels,
    depends_on: [],
    provider_refs: [providerRef]
  };

  const priority = githubPriorityForIssue(issue);
  if (priority) task.priority = priority;
  if (issue.body) task.description = issue.body;
  if (issue.assignees && issue.assignees.length > 0) task.owner = issue.assignees[0].login;
  if (issue.milestone) task.milestone = issue.milestone.title;
  if (issue.milestone && issue.milestone.due_on) {
    setTaskDate(task, "due_date", issue.milestone.due_on, {
      provider: "github",
      source: "milestone",
      field: "due_on"
    });
    setTaskDate(task, "target_date", issue.milestone.due_on, {
      provider: "github",
      source: "milestone",
      field: "due_on"
    });
  }

  return task;
}

async function fetchGitHubIssues({ repo, state, limit, token }) {
  const issues = [];
  let page = 1;

  while (issues.length < limit) {
    const perPage = Math.min(100, limit - issues.length);
    const url = `https://api.github.com/repos/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`;
    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "project-iris"
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status}): ${await response.text()}`);
    }

    const pageItems = await response.json();
    const issueItems = pageItems.filter((item) => !item.pull_request);
    issues.push(...issueItems);

    if (pageItems.length < perPage) {
      break;
    }
    page += 1;
  }

  return issues.slice(0, limit);
}

async function importGitHubIssues(options) {
  const wbs = loadWbs(options.outputDir);
  const issues = await fetchGitHubIssues({
    ...options,
    token: process.env.GITHUB_TOKEN
  });
  const incomingTasks = issues.map((issue) => issueToTask(issue, options.repo));
  const merged = mergeTasks(wbs.tasks, incomingTasks);
  saveWbs({ ...wbs, tasks: merged.tasks }, options.outputDir);

  return {
    imported: incomingTasks.length,
    created: merged.created,
    updated: merged.updated
  };
}

module.exports = {
  fetchGitHubIssues,
  githubPriorityForIssue,
  githubStatusForIssue,
  importGitHubIssues,
  issueToTask,
  parseGitHubImportArgs
};
