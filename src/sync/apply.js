const { issueToTask: githubIssueToTask } = require("../importers/github");
const { issueToTask: gitlabIssueToTask } = require("../importers/gitlab");
const { mergeTasks } = require("../importers/merge");
const { loadWbs, saveWbs } = require("../wbs");
const { loadPreview } = require("./state");

const APPLY_FIELDS = {
  github: new Set(["title", "description", "status", "labels"]),
  gitlab: new Set(["title", "description", "status", "labels", "due_date"])
};

function parseSyncApplyArgs(args) {
  const options = {
    outputDir: process.cwd()
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

    if (arg === "--yes") {
      options.yes = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function providerRefFor(task, provider) {
  return (task.provider_refs || []).find((ref) => ref.provider === provider);
}

function latestProviderTimestamp(task, provider) {
  const ref = providerRefFor(task, provider);
  return ref && ref.updated_at;
}

function statusToGitHubState(status) {
  return ["done", "cancelled", "closed"].includes(status) ? "closed" : "open";
}

function statusToGitLabStateEvent(status) {
  return ["done", "cancelled", "closed"].includes(status) ? "close" : "reopen";
}

function supportedFieldDiffs(diffs, provider) {
  const fields = APPLY_FIELDS[provider] || new Set();
  return diffs.filter((diff) => diff.type === "field_changed" && fields.has(diff.field));
}

function groupDiffsByTask(diffs) {
  const grouped = new Map();
  for (const diff of diffs) {
    const key = diff.task_id;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(diff);
  }
  return grouped;
}

function replaceProviderRef(task, providerRef) {
  const providerRefs = (task.provider_refs || []).filter((ref) => ref.provider !== providerRef.provider);
  providerRefs.push(providerRef);
  return {
    ...task,
    provider_refs: providerRefs
  };
}

function ensurePreviewFresh(provider, previewTask, currentTask) {
  const previewUpdatedAt = latestProviderTimestamp(previewTask, provider);
  const currentUpdatedAt = latestProviderTimestamp(currentTask, provider);
  if (previewUpdatedAt && currentUpdatedAt && previewUpdatedAt !== currentUpdatedAt) {
    throw new Error("Sync apply stopped: remote data changed after preview.");
  }
}

async function requestJson(url, { method = "GET", headers, body }) {
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Provider write failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function githubHeaders() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("Sync apply failed: provider write permission is missing.");
  }

  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "project-iris"
  };
}

function gitlabHeaders() {
  if (!process.env.GITLAB_TOKEN) {
    throw new Error("Sync apply failed: provider write permission is missing.");
  }

  return {
    "Content-Type": "application/json",
    "PRIVATE-TOKEN": process.env.GITLAB_TOKEN,
    "User-Agent": "project-iris"
  };
}

function githubBodyFromTask(task, diffs) {
  const body = {};
  for (const diff of diffs) {
    if (diff.field === "title") body.title = task.title;
    if (diff.field === "description") body.body = task.description || "";
    if (diff.field === "status") body.state = statusToGitHubState(task.status);
    if (diff.field === "labels") body.labels = task.labels || [];
  }
  return body;
}

function gitlabBodyFromTask(task, diffs) {
  const body = {};
  for (const diff of diffs) {
    if (diff.field === "title") body.title = task.title;
    if (diff.field === "description") body.description = task.description || "";
    if (diff.field === "status") body.state_event = statusToGitLabStateEvent(task.status);
    if (diff.field === "labels") body.labels = (task.labels || []).join(",");
    if (diff.field === "due_date") body.due_date = task.due_date || null;
  }
  return body;
}

async function fetchGitHubIssue(repo, issueNumber) {
  const issue = await requestJson(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    headers: githubHeaders()
  });
  return githubIssueToTask(issue, repo);
}

async function updateGitHubIssue(repo, issueNumber, task, diffs) {
  const issue = await requestJson(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: githubHeaders(),
    body: githubBodyFromTask(task, diffs)
  });
  return replaceProviderRef(task, githubIssueToTask(issue, repo).provider_refs[0]);
}

async function createGitHubIssue(repo, task) {
  const issue = await requestJson(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: githubHeaders(),
    body: {
      title: task.title,
      body: task.description || "",
      labels: task.labels || []
    }
  });
  return replaceProviderRef(task, githubIssueToTask(issue, repo).provider_refs[0]);
}

async function fetchGitLabIssue({ host, project }, issueIid) {
  const encodedProject = encodeURIComponent(project);
  const issue = await requestJson(`${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues/${issueIid}`, {
    headers: gitlabHeaders()
  });
  return gitlabIssueToTask(issue, { host, project });
}

async function updateGitLabIssue({ host, project }, issueIid, task, diffs) {
  const encodedProject = encodeURIComponent(project);
  const issue = await requestJson(`${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues/${issueIid}`, {
    method: "PUT",
    headers: gitlabHeaders(),
    body: gitlabBodyFromTask(task, diffs)
  });
  return replaceProviderRef(task, gitlabIssueToTask(issue, { host, project }).provider_refs[0]);
}

async function createGitLabIssue({ host, project }, task) {
  const encodedProject = encodeURIComponent(project);
  const issue = await requestJson(`${host.replace(/\/+$/, "")}/api/v4/projects/${encodedProject}/issues`, {
    method: "POST",
    headers: gitlabHeaders(),
    body: {
      title: task.title,
      description: task.description || "",
      labels: (task.labels || []).join(","),
      due_date: task.due_date || undefined
    }
  });
  return replaceProviderRef(task, gitlabIssueToTask(issue, { host, project }).provider_refs[0]);
}

async function applyGitHub(preview) {
  const repo = preview.provider_options.repo;
  const grouped = groupDiffsByTask(supportedFieldDiffs(preview.diffs, "github"));
  const appliedTasks = [];

  for (const diffs of grouped.values()) {
    const desiredTask = diffs[0].local_task;
    const remoteTask = diffs[0].source_task;
    const ref = providerRefFor(remoteTask, "github");
    if (!ref) continue;
    const currentTask = await fetchGitHubIssue(repo, ref.id);
    ensurePreviewFresh("github", remoteTask, currentTask);
    appliedTasks.push(await updateGitHubIssue(repo, ref.id, desiredTask, diffs));
  }

  for (const diff of preview.diffs.filter((item) => item.type === "only_in_wbs")) {
    appliedTasks.push(await createGitHubIssue(repo, diff.local_task));
  }

  return appliedTasks;
}

async function applyGitLab(preview) {
  const providerOptions = preview.provider_options;
  const host = providerOptions.host || "https://gitlab.com";
  const project = providerOptions.project;
  const grouped = groupDiffsByTask(supportedFieldDiffs(preview.diffs, "gitlab"));
  const appliedTasks = [];

  for (const diffs of grouped.values()) {
    const desiredTask = diffs[0].local_task;
    const remoteTask = diffs[0].source_task;
    const ref = providerRefFor(remoteTask, "gitlab");
    if (!ref) continue;
    const currentTask = await fetchGitLabIssue({ host, project }, ref.id);
    ensurePreviewFresh("gitlab", remoteTask, currentTask);
    appliedTasks.push(await updateGitLabIssue({ host, project }, ref.id, desiredTask, diffs));
  }

  for (const diff of preview.diffs.filter((item) => item.type === "only_in_wbs")) {
    appliedTasks.push(await createGitLabIssue({ host, project }, diff.local_task));
  }

  return appliedTasks;
}

async function applySync(provider, options) {
  const preview = loadPreview(options.outputDir);
  if (preview.provider !== provider) {
    throw new Error(`Sync apply preview is for ${preview.provider}, not ${provider}.`);
  }

  let appliedTasks;
  if (provider === "github") {
    appliedTasks = await applyGitHub(preview);
  } else if (provider === "gitlab") {
    appliedTasks = await applyGitLab(preview);
  } else {
    throw new Error("sync apply requires a provider: github or gitlab");
  }

  if (appliedTasks.length > 0) {
    const wbs = loadWbs(options.outputDir);
    const merged = mergeTasks(wbs.tasks, appliedTasks);
    saveWbs({ ...wbs, tasks: merged.tasks }, options.outputDir);
  }

  return {
    applied: appliedTasks.length
  };
}

module.exports = {
  applySync,
  parseSyncApplyArgs,
  supportedFieldDiffs
};
