const { loadWbs } = require("./wbs");

function summarizeTasks(tasks) {
  const byStatus = {};
  const byOwner = {};
  const blocked = [];
  const highPriorityOpen = [];

  for (const task of tasks) {
    const status = task.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (task.owner) {
      byOwner[task.owner] = (byOwner[task.owner] || 0) + 1;
    }

    if (status === "blocked") {
      blocked.push(task);
    }

    if (["urgent", "high"].includes(task.priority) && !["done", "cancelled"].includes(status)) {
      highPriorityOpen.push(task);
    }
  }

  return {
    total: tasks.length,
    byStatus,
    byOwner,
    blocked,
    highPriorityOpen
  };
}

function formatStatusSummary(summary) {
  const lines = [
    `Tasks: ${summary.total}`,
    `Status: ${Object.entries(summary.byStatus).map(([status, count]) => `${status}=${count}`).join(", ") || "none"}`
  ];

  if (Object.keys(summary.byOwner).length > 0) {
    lines.push(`Owners: ${Object.entries(summary.byOwner).map(([owner, count]) => `${owner}=${count}`).join(", ")}`);
  }

  if (summary.blocked.length > 0) {
    lines.push("", "Blocked:");
    lines.push(...summary.blocked.map((task) => `- ${task.id}: ${task.title}`));
  }

  if (summary.highPriorityOpen.length > 0) {
    lines.push("", "High priority open:");
    lines.push(...summary.highPriorityOpen.map((task) => `- ${task.id}: ${task.title}`));
  }

  return lines.join("\n");
}

function loadStatusSummary(outputDir) {
  return summarizeTasks(loadWbs(outputDir).tasks);
}

module.exports = {
  formatStatusSummary,
  loadStatusSummary,
  summarizeTasks
};
