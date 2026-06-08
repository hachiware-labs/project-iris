const { normalizeDate } = require("../dates");

const STRING_FIELDS = [
  "id",
  "title",
  "status",
  "priority",
  "owner",
  "milestone",
  "description",
  "start_date",
  "due_date",
  "target_date"
];

const OWNER_PREFERRED_FIELDS = [
  "display_name",
  "displayName",
  "name",
  "full_name",
  "username",
  "user_name",
  "login",
  "nickname",
  "email"
];

function normalizeOwner(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeOwner(item);
      if (typeof normalized === "string") {
        return normalized;
      }
    }
    return undefined;
  }

  if (typeof value === "object") {
    for (const key of OWNER_PREFERRED_FIELDS) {
      const candidate = normalizeOwner(value[key]);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function normalizeStatus(status) {
  if (!status) {
    return "todo";
  }

  const normalized = String(status).trim().toLowerCase();
  const normalizedStatus = ["todo", "in_progress", "blocked", "done", "cancelled"].includes(normalized)
    ? normalized
    : "todo";

  if (normalizedStatus === "in_progress") {
    return "in_progress";
  }

  return normalizedStatus;
}

function normalizeList(value) {
  if (value === undefined || value === null) {
    return [];
  }

  const values = Array.isArray(value)
    ? value
    : String(value).split(/[,;\n]/);

  return [...new Set(
    values
      .map((item) => String(item).trim())
      .filter(Boolean)
  )];
}

function normalizeProviderRefs(refs) {
  if (!Array.isArray(refs)) {
    return [];
  }

  return refs
    .map((ref) => {
      if (!ref || typeof ref !== "object") {
        return null;
      }
      const cleaned = {};
      for (const [key, value] of Object.entries(ref)) {
        if (value === undefined || value === null) continue;
        cleaned[key] = value;
      }
      return Object.keys(cleaned).length > 0 ? cleaned : null;
    })
    .filter(Boolean);
}

function normalizeDateRefs(refs) {
  if (!Array.isArray(refs)) {
    return [];
  }

  return refs
    .map((ref) => {
      if (!ref || typeof ref !== "object") {
        return null;
      }
      if (typeof ref.provider !== "string" || ref.provider.trim() === "") {
        return null;
      }
      if (typeof ref.value !== "string" || !ref.value.trim()) {
        return null;
      }
      return {
        ...ref,
        provider: String(ref.provider).trim(),
        source: typeof ref.source === "string" ? ref.source.trim() : ref.source,
        field: typeof ref.field === "string" ? ref.field.trim() : ref.field,
        value: ref.value.trim()
      };
    })
    .filter(Boolean);
}

function normalizeTaskDates(task) {
  for (const field of ["start_date", "due_date", "target_date"]) {
    if (task[field]) {
      task[field] = normalizeDate(task[field]);
      if (!task[field]) {
        delete task[field];
      }
    }
  }
}

function normalizeDependencies(value) {
  const list = normalizeList(value);
  if (list.length === 0) {
    return [];
  }
  return list;
}

function normalizeTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new Error("source task must be an object");
  }

  const normalized = { ...task };

  for (const field of STRING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field) && normalized[field] !== undefined) {
      if (field === "status") {
        normalized[field] = normalizeStatus(normalized[field]);
      } else if (field === "owner") {
        const normalizedOwner = normalizeOwner(normalized[field]);
        if (normalizedOwner) {
          normalized[field] = normalizedOwner;
        } else {
          delete normalized[field];
        }
      } else {
        normalized[field] = String(normalized[field]).trim();
        if (normalized[field] === "") {
          delete normalized[field];
        }
      }
    }
  }

  if (typeof normalized.id !== "string" || normalized.id.trim() === "") {
    throw new Error("source task id is required");
  }
  normalized.id = normalized.id.trim();

  if (!normalized.title) {
    throw new Error(`task ${normalized.id} has no title`);
  }

  normalized.status = normalizeStatus(normalized.status || "todo");

  normalized.provider_refs = normalizeProviderRefs(normalized.provider_refs);
  normalized.labels = normalizeList(normalized.labels);
  normalized.acceptance = normalizeList(normalized.acceptance);
  normalized.risks = normalizeList(normalized.risks);
  normalized.depends_on = normalizeDependencies(normalized.depends_on);
  normalized.date_refs = normalizeDateRefs(normalized.date_refs);

  normalizeTaskDates(normalized);

  return normalized;
}

module.exports = {
  normalizeTask,
  normalizeStatus
};
