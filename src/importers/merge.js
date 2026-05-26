function taskProviderRefKey(ref) {
  if (!ref || typeof ref !== "object") {
    return null;
  }

  if (ref.provider === "github" && ref.repo && ref.id !== undefined) {
    return `github:${ref.repo}#${ref.id}`;
  }

  if (ref.provider === "gitlab" && ref.project && ref.id !== undefined) {
    return `gitlab:${ref.host || "https://gitlab.com"}:${ref.project}#${ref.id}`;
  }

  if (ref.provider === "excel" && ref.path && ref.row !== undefined) {
    return `excel:${ref.path}#${ref.row}`;
  }

  return null;
}

function taskProviderKeys(task) {
  return (task.provider_refs || [])
    .map(taskProviderRefKey)
    .filter(Boolean);
}

function mergeTasks(existingTasks, incomingTasks) {
  const tasks = existingTasks.map((task) => ({ ...task }));
  const byProviderRef = new Map();
  const byId = new Map();
  let created = 0;
  let updated = 0;

  tasks.forEach((task, index) => {
    if (typeof task.id === "string") {
      byId.set(task.id, index);
    }

    for (const key of taskProviderKeys(task)) {
      byProviderRef.set(key, index);
    }
  });

  for (const incoming of incomingTasks) {
    let targetIndex;
    for (const key of taskProviderKeys(incoming)) {
      if (byProviderRef.has(key)) {
        targetIndex = byProviderRef.get(key);
        break;
      }
    }

    if (targetIndex === undefined && byId.has(incoming.id)) {
      targetIndex = byId.get(incoming.id);
    }

    if (targetIndex === undefined) {
      targetIndex = tasks.length;
      tasks.push(incoming);
      created += 1;
    } else {
      tasks[targetIndex] = {
        ...tasks[targetIndex],
        ...incoming
      };
      updated += 1;
    }

    byId.set(tasks[targetIndex].id, targetIndex);
    for (const key of taskProviderKeys(tasks[targetIndex])) {
      byProviderRef.set(key, targetIndex);
    }
  }

  return {
    tasks,
    created,
    updated
  };
}

module.exports = {
  mergeTasks,
  taskProviderRefKey
};
