function normalizeDate(value) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return undefined;
  }

  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateOnly ? dateOnly[1] : text;
}

function addDateRef(task, { provider, source, field, value }) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return;
  }

  if (!task.date_refs) {
    task.date_refs = [];
  }

  task.date_refs.push({
    provider,
    source,
    field,
    value: normalized
  });
}

function setTaskDate(task, field, value, ref) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return;
  }

  task[field] = normalized;
  if (ref) {
    addDateRef(task, { ...ref, value: normalized });
  }
}

module.exports = {
  addDateRef,
  normalizeDate,
  setTaskDate
};
