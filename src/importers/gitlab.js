const { setTaskDate } = require("../dates");
const { mergeTasks } = require("./merge");
const { loadWbs, saveWbs } = require("../wbs");
const { normalizeTask, normalizeStatus } = require("./normalize");

function parseGitLabImportArgs(args) {
  const options = {
    host: "https://gitlab.com",
    outputDir: process.cwd(),
    state: "opened",
    limit: 100,
    includeLinks: false,
    includeMergeRequests: false
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

    if (arg === "--include-links") {
      options.includeLinks = true;
      continue;
    }

    if (arg === "--include-merge-requests") {
      options.includeMergeRequests = true;
      continue;
    }

    if (arg === "--enrich") {
      options.includeLinks = true;
      options.includeMergeRequests = true;
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

function gitlabHeaders(token) {
  const headers = {
    "User-Agent": "project-iris"
  };
  if (token) {
    headers["PRIVATE-TOKEN"] = token;
  }
  return headers;
}

function compactObject(object) {
  const compacted = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null) {
      compacted[key] = value;
    }
  }
  return compacted;
}

function normalizeGitLabIssueLink(link) {
  return compactObject({
    type: link.link_type,
    issue_id: link.iid,
    global_id: link.id,
    project_id: link.project_id,
    title: link.title,
    state: link.state,
    url: link.web_url,
    created_at: link.created_at,
    updated_at: link.updated_at,
    link_id: link.issue_link_id,
    link_created_at: link.link_created_at,
    link_updated_at: link.link_updated_at
  });
}

function normalizeGitLabMergeRequest(mergeRequest) {
  return compactObject({
    id: mergeRequest.id,
    iid: mergeRequest.iid,
    project_id: mergeRequest.project_id,
    title: mergeRequest.title,
    state: mergeRequest.state,
    draft: mergeRequest.draft,
    reference: mergeRequest.reference,
    source_branch: mergeRequest.source_branch,
    target_branch: mergeRequest.target_branch,
    web_url: mergeRequest.web_url,
    created_at: mergeRequest.created_at,
    updated_at: mergeRequest.updated_at,
    closed_at: mergeRequest.closed_at,
    merged_at: mergeRequest.merged_at
  });
}

function dependencyIdsFromLinks(links, availableTaskIds) {
  const dependencies = [];
  for (const link of links || []) {
    if (link.link_type !== "is_blocked_by") {
      continue;
    }

    const dependencyId = `GL-${link.iid}`;
    if (!availableTaskIds || availableTaskIds.has(dependencyId)) {
      dependencies.push(dependencyId);
    }
  }
  return [...new Set(dependencies)];
}

function issueToTask(issue, { host = "https://gitlab.com", project, availableTaskIds } = {}) {
  const issueLinks = (issue._project_iris_links || []).map(normalizeGitLabIssueLink);
  const relatedMergeRequests = (issue._project_iris_related_merge_requests || []).map(normalizeGitLabMergeRequest);
  const closedByMergeRequests = (issue._project_iris_closed_by_merge_requests || []).map(normalizeGitLabMergeRequest);

  const providerRef = {
    provider: "gitlab",
    type: "issue",
    host,
    project,
    id: issue.iid,
    global_id: issue.id,
    url: issue.web_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    issue_type: issue.issue_type,
    blocking_issues_count: issue.blocking_issues_count,
    upvotes: issue.upvotes,
    downvotes: issue.downvotes,
    weight: issue.weight
  };

  if (issue.closed_at) {
    providerRef.closed_at = issue.closed_at;
  }
  if (issueLinks.length > 0) {
    providerRef.issue_links = issueLinks;
  }
  if (relatedMergeRequests.length > 0) {
    providerRef.related_merge_requests = relatedMergeRequests;
  }
  if (closedByMergeRequests.length > 0) {
    providerRef.closed_by_merge_requests = closedByMergeRequests;
  }
  if (issue.task_completion_status) {
    providerRef.task_completion_status = issue.task_completion_status;
  }

  const task = {
    id: `GL-${issue.iid}`,
    title: issue.title,
    status: gitlabStatusForIssue(issue),
    labels: issue.labels || [],
    depends_on: dependencyIdsFromLinks(issue._project_iris_links, availableTaskIds),
    provider_refs: [providerRef]
  };

  const priority = gitlabPriorityForIssue(issue);
  if (priority) task.priority = priority;
  if (issue.description) task.description = issue.description;
  if (issue.assignees && issue.assignees.length > 0) task.owner = issue.assignees[0];
  else if (issue.assignee) task.owner = issue.assignee;
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

async function fetchGitLabJson(url, token, { optional = false } = {}) {
  const response = await fetch(url, {
    headers: gitlabHeaders(token)
  });
  if (!response.ok) {
    if (optional && [401, 403, 404].includes(response.status)) {
      return [];
    }
    throw new Error(`GitLab request failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
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
    const pageItems = await fetchGitLabJson(url, token);
    issues.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }
    page += 1;
  }

  return issues.slice(0, limit);
}

async function fetchGitLabIssueLinks({ host = "https://gitlab.com", project, issueIid, token }) {
  const encodedProject = encodeURIComponent(project);
  const url = `${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues/${issueIid}/links`;
  return fetchGitLabJson(url, token, { optional: true });
}

async function fetchGitLabRelatedMergeRequests({ host = "https://gitlab.com", project, issueIid, token }) {
  const encodedProject = encodeURIComponent(project);
  const url = `${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues/${issueIid}/related_merge_requests`;
  return fetchGitLabJson(url, token, { optional: true });
}

async function fetchGitLabClosedByMergeRequests({ host = "https://gitlab.com", project, issueIid, token }) {
  const encodedProject = encodeURIComponent(project);
  const url = `${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues/${issueIid}/closed_by`;
  return fetchGitLabJson(url, token, { optional: true });
}

async function enrichGitLabIssues(issues, options) {
  if (!options.includeLinks && !options.includeMergeRequests) {
    return issues;
  }

  const enrichedIssues = [];
  for (const issue of issues) {
    const enriched = { ...issue };
    if (options.includeLinks) {
      enriched._project_iris_links = await fetchGitLabIssueLinks({
        ...options,
        issueIid: issue.iid
      });
    }
    if (options.includeMergeRequests) {
      enriched._project_iris_related_merge_requests = await fetchGitLabRelatedMergeRequests({
        ...options,
        issueIid: issue.iid
      });
      enriched._project_iris_closed_by_merge_requests = await fetchGitLabClosedByMergeRequests({
        ...options,
        issueIid: issue.iid
      });
    }
    enrichedIssues.push(enriched);
  }

  return enrichedIssues;
}

async function importGitLabIssues(options) {
  const wbs = loadWbs(options.outputDir);
  const token = process.env.GITLAB_TOKEN;
  const issues = await fetchGitLabIssues({
    ...options,
    token
  });
  const enrichedIssues = await enrichGitLabIssues(issues, {
    ...options,
    token
  });
  const availableTaskIds = new Set([
    ...wbs.tasks.map((task) => task.id),
    ...enrichedIssues.map((issue) => `GL-${issue.iid}`)
  ]);
  const incomingTasks = enrichedIssues.map((issue) => issueToTask(issue, {
    ...options,
    availableTaskIds
  }));
  const merged = mergeTasks(wbs.tasks, incomingTasks);
  saveWbs({ ...wbs, tasks: merged.tasks }, options.outputDir);

  return {
    imported: incomingTasks.length,
    created: merged.created,
    updated: merged.updated
  };
}

module.exports = {
  enrichGitLabIssues,
  fetchGitLabClosedByMergeRequests,
  fetchGitLabIssueLinks,
  fetchGitLabIssues,
  fetchGitLabRelatedMergeRequests,
  gitlabPriorityForIssue,
  gitlabStatusForIssue,
  importGitLabIssues,
  issueToTask,
  parseGitLabImportArgs
};
