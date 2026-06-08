const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const readXlsxFile = require("read-excel-file/node");

const { main, parseOutputDirArgs, parseReadArgs } = require("../src/cli");
const { tasksToRows } = require("../src/exporters/excel");
const { rowsToTasks } = require("../src/importers/excel");
const { issueToTask: githubIssueToTask } = require("../src/importers/github");
const { issueToTask: gitlabIssueToTask } = require("../src/importers/gitlab");
const { applySync, supportedFieldDiffs } = require("../src/sync/apply");
const { previewTaskDiffs } = require("../src/sync/preview");
const { writeXlsx } = require("../src/xlsx");
const packageJson = require("../package.json");
const {
  filterTasks,
  findTask,
  formatTaskDetails,
  formatTaskList,
  loadWbs,
  validateWbs
} = require("../src/wbs");

function makePlanwiseDir(wbsContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-iris-wbs-"));
  const dir = path.join(root, ".planwise");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "wbs.yaml"), wbsContent, "utf8");
  return root;
}

function withCapturedConsole(callback) {
  const originalLog = console.log;
  const originalError = console.error;
  const output = [];

  console.log = (message = "") => output.push(String(message));
  console.error = (message = "") => output.push(String(message));

  try {
    return {
      result: callback(),
      output
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function withCapturedConsoleAsync(callback) {
  const originalLog = console.log;
  const originalError = console.error;
  const output = [];

  console.log = (message = "") => output.push(String(message));
  console.error = (message = "") => output.push(String(message));

  try {
    return {
      result: await callback(),
      output
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function withMockedProvider(env, fetchImplementation, callback) {
  const originalFetch = global.fetch;
  const originals = {};
  for (const key of Object.keys(env)) {
    originals[key] = process.env[key];
    process.env[key] = env[key];
  }
  global.fetch = fetchImplementation;

  try {
    return await callback();
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(env)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

function writeLastPreview(root, preview) {
  const syncDir = path.join(root, ".planwise", "sync");
  fs.mkdirSync(syncDir, { recursive: true });
  fs.writeFileSync(path.join(syncDir, "last-preview.json"), JSON.stringify(preview, null, 2), "utf8");
}

const sampleWbs = `version: 1

tasks:
  - id: T-001
    title: Implement list
    description: Read tasks from local YAML
    status: todo
    priority: high
    owner: agent
    labels:
      - cli
      - mvp
    milestone: M-001
    depends_on: []
    acceptance:
      - list displays task rows
  - id: T-002
    title: Implement show
    status: done
    priority: medium
    owner: kitfactory
    labels:
      - cli
`;

test("loadWbs reads tasks from .planwise/wbs.yaml", () => {
  const root = makePlanwiseDir(sampleWbs);

  const wbs = loadWbs(root);

  assert.equal(wbs.version, 1);
  assert.equal(wbs.tasks.length, 2);
  assert.equal(wbs.tasks[0].id, "T-001");
});

test("filterTasks filters by status, owner, milestone, and label", () => {
  const tasks = loadWbs(makePlanwiseDir(sampleWbs)).tasks;

  assert.deepEqual(filterTasks(tasks, { status: "todo" }).map((task) => task.id), ["T-001"]);
  assert.deepEqual(filterTasks(tasks, { owner: "kitfactory" }).map((task) => task.id), ["T-002"]);
  assert.deepEqual(filterTasks(tasks, { milestone: "M-001" }).map((task) => task.id), ["T-001"]);
  assert.deepEqual(filterTasks(tasks, { label: "mvp" }).map((task) => task.id), ["T-001"]);
});

test("parseReadArgs maps output-dir to outputDir", () => {
  assert.deepEqual(parseReadArgs(["--output-dir", "tmp", "--status", "todo"]), {
    outputDir: "tmp",
    status: "todo"
  });
});

test("parseOutputDirArgs only accepts output-dir", () => {
  assert.deepEqual(parseOutputDirArgs(["--output-dir", "tmp"]), {
    outputDir: "tmp"
  });
  assert.throws(() => parseOutputDirArgs(["--status", "todo"]), /Unknown option/);
});

test("main prints package version", async () => {
  const version = await withCapturedConsoleAsync(() => main(["--version"]));

  assert.equal(version.result, 0);
  assert.equal(version.output.join("\n"), packageJson.version);
});

test("formatTaskList renders compact rows", () => {
  const tasks = loadWbs(makePlanwiseDir(sampleWbs)).tasks;

  assert.equal(
    formatTaskList(tasks),
    "T-001 [todo high] @agent Implement list\nT-002 [done medium] @kitfactory Implement show"
  );
});

test("findTask and formatTaskDetails render one task", () => {
  const tasks = loadWbs(makePlanwiseDir(sampleWbs)).tasks;
  const task = findTask(tasks, "T-001");

  assert.match(formatTaskDetails(task), /T-001: Implement list/);
  assert.match(formatTaskDetails(task), /Acceptance:\n- list displays task rows/);
});

test("loadWbs rejects a wbs without a tasks array", () => {
  const root = makePlanwiseDir("version: 1\ntasks: invalid\n");

  assert.throws(() => loadWbs(root), /must contain a tasks array/);
});

test("loadWbs rejects a wbs missing tasks", () => {
  const root = makePlanwiseDir("version: 1\n");

  assert.throws(() => loadWbs(root), /must contain a tasks array/);
});

test("validateWbs detects missing required fields and broken references", () => {
  const errors = validateWbs({
    version: 1,
    tasks: [
      {
        id: "T-001",
        title: "Valid task",
        depends_on: ["T-999"]
      },
      {
        id: "",
        labels: "cli"
      }
    ]
  });

  assert.match(errors.join("\n"), /tasks\[0\]\.depends_on references unknown task id: T-999/);
  assert.match(errors.join("\n"), /tasks\[1\]\.id is required/);
  assert.match(errors.join("\n"), /tasks\[1\]\.title is required/);
  assert.match(errors.join("\n"), /tasks\[1\]\.labels must be an array/);
});

test("loadWbs rejects an invalid task schema", () => {
  const root = makePlanwiseDir(`version: 1

tasks:
  - id: T-001
    title: Valid task
  - id: T-001
    title: Duplicate task
`);

  assert.throws(() => loadWbs(root), /duplicate task id: T-001/);
});

test("validateWbs detects dependency cycles", () => {
  const errors = validateWbs({
    version: 1,
    tasks: [
      {
        id: "T-SELF",
        title: "Self dependency",
        depends_on: ["T-SELF"]
      },
      {
        id: "T-A",
        title: "Direct cycle start",
        depends_on: ["T-B"]
      },
      {
        id: "T-B",
        title: "Direct cycle end",
        depends_on: ["T-A"]
      },
      {
        id: "T-C",
        title: "Multi cycle start",
        depends_on: ["T-D"]
      },
      {
        id: "T-D",
        title: "Multi cycle middle",
        depends_on: ["T-E"]
      },
      {
        id: "T-E",
        title: "Multi cycle end",
        depends_on: ["T-C"]
      }
    ]
  });

  assert.match(errors.join("\n"), /dependency cycle detected: T-SELF -> T-SELF/);
  assert.match(errors.join("\n"), /dependency cycle detected: T-A -> T-B -> T-A/);
  assert.match(errors.join("\n"), /dependency cycle detected: T-C -> T-D -> T-E -> T-C/);
});

test("main supports list and show with output-dir", async () => {
  const root = makePlanwiseDir(sampleWbs);

  const list = await withCapturedConsoleAsync(() => main(["list", "--output-dir", root, "--status", "todo"]));
  const show = await withCapturedConsoleAsync(() => main(["show", "T-001", "--output-dir", root]));

  assert.equal(list.result, 0);
  assert.match(list.output.join("\n"), /T-001 \[todo high\] @agent Implement list/);
  assert.equal(show.result, 0);
  assert.match(show.output.join("\n"), /T-001: Implement list/);
});

test("main supports validate with output-dir", async () => {
  const root = makePlanwiseDir(sampleWbs);

  const validate = await withCapturedConsoleAsync(() => main(["validate", "--output-dir", root]));

  assert.equal(validate.result, 0);
  assert.match(validate.output.join("\n"), /WBS is valid\. 2 task\(s\)\./);
});

test("issueToTask maps GitHub issues to WBS tasks", () => {
  const task = githubIssueToTask({
    number: 12,
    title: "Connect GitHub import",
    body: "Import open issues",
    state: "open",
    labels: [{ name: "priority:high" }, { name: "blocked" }],
    assignees: [{ login: "kitfactory" }],
    milestone: { title: "M-001", due_on: "2026-06-30T00:00:00Z" },
    html_url: "https://github.com/hachiware-labs/project-iris/issues/12",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T01:00:00Z"
  }, "hachiware-labs/project-iris");

  assert.equal(task.id, "GH-12");
  assert.equal(task.status, "blocked");
  assert.equal(task.priority, "high");
  assert.equal(task.owner, "kitfactory");
  assert.equal(task.milestone, "M-001");
  assert.equal(task.due_date, "2026-06-30");
  assert.equal(task.target_date, "2026-06-30");
  assert.equal(task.provider_refs[0].provider, "github");
});

test("issueToTask maps GitLab issues to WBS tasks", () => {
  const task = gitlabIssueToTask({
    id: 999,
    iid: 34,
    title: "Connect GitLab import",
    description: "Import opened issues",
    state: "opened",
    labels: ["priority:medium"],
    assignees: [{ username: "release" }],
    milestone: { title: "M-002", start_date: "2026-06-01", due_date: "2026-06-20" },
    web_url: "https://gitlab.com/group/project/-/issues/34",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T01:00:00Z",
    start_date: null,
    due_date: null
  }, {
    host: "https://gitlab.com",
    project: "group/project"
  });

  assert.equal(task.id, "GL-34");
  assert.equal(task.status, "todo");
  assert.equal(task.priority, "medium");
  assert.equal(task.owner, "release");
  assert.equal(task.milestone, "M-002");
  assert.equal(task.start_date, "2026-06-01");
  assert.equal(task.due_date, "2026-06-20");
  assert.equal(task.provider_refs[0].provider, "gitlab");
});

test("issueToTask normalizes GitHub owner display names", () => {
  const task = githubIssueToTask({
    number: 13,
    title: "GitHub display name mapping",
    body: "Import issue with owner object",
    state: "open",
    labels: [],
    assignee: {
      name: "Alice Example",
      login: "alice",
      display_name: "Alice Display"
    },
    html_url: "https://github.com/hachiware-labs/project-iris/issues/13",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T01:00:00Z"
  }, "hachiware-labs/project-iris");

  assert.equal(task.owner, "Alice Display");
});

test("issueToTask normalizes GitLab owner display names", () => {
  const task = gitlabIssueToTask({
    id: 1000,
    iid: 35,
    title: "GitLab display name mapping",
    description: "Import issue with assignee object",
    state: "opened",
    labels: [],
    assignees: [{
      name: "Bob Example",
      username: "bob"
    }],
    web_url: "https://gitlab.com/group/project/-/issues/35",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T01:00:00Z",
    start_date: null,
    due_date: null
  }, {
    host: "https://gitlab.com",
    project: "group/project"
  });

  assert.equal(task.owner, "Bob Example");
});

test("rowsToTasks maps owner via display name header alias", () => {
  const tasks = rowsToTasks([
    ["ID", "Title", "Display Name", "Status"],
    ["T-020", "Spreadsheet mapping", "Carol Example", "done"]
  ], "C:\\tmp\\wbs.xlsx");

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].owner, "Carol Example");
});

test("rowsToTasks maps Excel rows to WBS tasks", () => {
  const tasks = rowsToTasks([
    ["ID", "Title", "Status", "Priority", "Owner", "Labels", "Start Date", "Due Date", "Depends On", "Acceptance", "Provider Refs"],
    ["T-010", "Import spreadsheet", "todo", "medium", "ops", "excel, import", "2026-06-01", "2026-06-14", "T-001; T-002", "Rows become tasks\nIDs are preserved", "[{\"provider\":\"github\",\"repo\":\"owner/repo\",\"id\":10}]"]
  ], "C:\\tmp\\wbs.xlsx");

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "T-010");
  assert.equal(tasks[0].title, "Import spreadsheet");
  assert.deepEqual(tasks[0].labels, ["excel", "import"]);
  assert.equal(tasks[0].start_date, "2026-06-01");
  assert.equal(tasks[0].due_date, "2026-06-14");
  assert.deepEqual(tasks[0].depends_on, ["T-001", "T-002"]);
  assert.deepEqual(tasks[0].acceptance, ["Rows become tasks", "IDs are preserved"]);
  assert.deepEqual(tasks[0].provider_refs, [{ provider: "github", repo: "owner/repo", id: 10 }]);
});

test("writeXlsx writes rows that read-excel-file can read", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-iris-xlsx-"));
  const xlsxPath = path.join(root, "wbs.xlsx");

  writeXlsx(xlsxPath, [
    ["id", "title"],
    ["T-001", "Round trip"]
  ]);

  const result = await readXlsxFile(xlsxPath);
  const rows = Array.isArray(result[0]) ? result : result[0].data;
  assert.deepEqual(rows, [
    ["id", "title"],
    ["T-001", "Round trip"]
  ]);
});

test("tasksToRows exports provider refs for local Excel WBS views", () => {
  const rows = tasksToRows([{
    id: "GH-1",
    title: "Export me",
    status: "todo",
    labels: ["github"],
    provider_refs: [{ provider: "github", repo: "owner/repo", id: 1 }]
  }]);

  assert.equal(rows[0].includes("provider_refs"), true);
  assert.match(rows[1][14], /"provider":"github"/);
});

test("previewTaskDiffs detects field differences", () => {
  const diffs = previewTaskDiffs([{
    id: "GH-1",
    title: "Local",
    status: "todo",
    provider_refs: [{ provider: "github", repo: "owner/repo", id: 1 }]
  }], [{
    id: "GH-1",
    title: "Remote",
    status: "done",
    provider_refs: [{ provider: "github", repo: "owner/repo", id: 1 }]
  }], "github");

  assert.deepEqual(diffs.map((diff) => diff.field), ["title", "status"]);
});

test("supportedFieldDiffs keeps provider writable fields only", () => {
  const diffs = [
    { type: "field_changed", field: "title" },
    { type: "field_changed", field: "due_date" },
    { type: "field_changed", field: "start_date" },
    { type: "only_in_wbs" }
  ];

  assert.deepEqual(supportedFieldDiffs(diffs, "github").map((diff) => diff.field), ["title"]);
  assert.deepEqual(supportedFieldDiffs(diffs, "gitlab").map((diff) => diff.field), ["title", "due_date"]);
});

test("sync apply updates GitHub issues from the saved preview", async () => {
  const root = makePlanwiseDir(`version: 1

tasks:
  - id: GH-1
    title: Local title
    status: done
    labels:
      - bug
    due_date: "2026-06-30"
    provider_refs:
      - provider: github
        type: issue
        repo: owner/repo
        id: 1
        updated_at: "2026-05-25T01:00:00Z"
`);
  const localTask = loadWbs(root).tasks[0];
  const sourceTask = {
    id: "GH-1",
    title: "Remote title",
    status: "todo",
    labels: [],
    depends_on: [],
    provider_refs: [{
      provider: "github",
      type: "issue",
      repo: "owner/repo",
      id: 1,
      updated_at: "2026-05-25T01:00:00Z"
    }]
  };
  writeLastPreview(root, {
    version: 1,
    provider: "github",
    provider_options: { repo: "owner/repo" },
    diffs: [
      { type: "field_changed", task_id: "GH-1", field: "title", local_task: localTask, source_task: sourceTask },
      { type: "field_changed", task_id: "GH-1", field: "status", local_task: localTask, source_task: sourceTask },
      { type: "field_changed", task_id: "GH-1", field: "due_date", local_task: localTask, source_task: sourceTask }
    ]
  });

  const requests = [];
  await withMockedProvider({ GITHUB_TOKEN: "test-token" }, async (url, options = {}) => {
    requests.push({ url, options });
    if ((options.method || "GET") === "GET") {
      return {
        ok: true,
        json: async () => ({
          number: 1,
          title: "Remote title",
          body: "",
          state: "open",
          labels: [],
          assignees: [],
          html_url: "https://github.com/owner/repo/issues/1",
          created_at: "2026-05-25T00:00:00Z",
          updated_at: "2026-05-25T01:00:00Z"
        }),
        text: async () => ""
      };
    }
    return {
      ok: true,
      json: async () => ({
        number: 1,
        title: "Local title",
        body: "",
        state: "closed",
        labels: [{ name: "bug" }],
        assignees: [],
        html_url: "https://github.com/owner/repo/issues/1",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T02:00:00Z"
      }),
      text: async () => ""
    };
  }, async () => {
    const result = await applySync("github", { outputDir: root });
    assert.equal(result.applied, 1);
  });

  const patchBody = JSON.parse(requests.find((request) => request.options.method === "PATCH").options.body);
  assert.deepEqual(patchBody, {
    title: "Local title",
    state: "closed"
  });
  const task = loadWbs(root).tasks[0];
  assert.equal(task.provider_refs[0].updated_at, "2026-05-25T02:00:00Z");
});

test("sync apply updates GitLab issue due dates from the saved preview", async () => {
  const root = makePlanwiseDir(`version: 1

tasks:
  - id: GL-2
    title: Local title
    status: todo
    due_date: "2026-06-30"
    labels:
      - planning
    provider_refs:
      - provider: gitlab
        type: issue
        host: https://gitlab.com
        project: group/project
        id: 2
        updated_at: "2026-05-25T01:00:00Z"
`);
  const localTask = loadWbs(root).tasks[0];
  const sourceTask = {
    id: "GL-2",
    title: "Local title",
    status: "todo",
    due_date: "2026-06-20",
    labels: ["planning"],
    depends_on: [],
    provider_refs: [{
      provider: "gitlab",
      type: "issue",
      host: "https://gitlab.com",
      project: "group/project",
      id: 2,
      updated_at: "2026-05-25T01:00:00Z"
    }]
  };
  writeLastPreview(root, {
    version: 1,
    provider: "gitlab",
    provider_options: { host: "https://gitlab.com", project: "group/project" },
    diffs: [
      { type: "field_changed", task_id: "GL-2", field: "due_date", local_task: localTask, source_task: sourceTask }
    ]
  });

  const requests = [];
  await withMockedProvider({ GITLAB_TOKEN: "test-token" }, async (url, options = {}) => {
    requests.push({ url, options });
    if ((options.method || "GET") === "GET") {
      return {
        ok: true,
        json: async () => ({
          id: 200,
          iid: 2,
          title: "Local title",
          description: "",
          state: "opened",
          labels: ["planning"],
          assignees: [],
          web_url: "https://gitlab.com/group/project/-/issues/2",
          created_at: "2026-05-25T00:00:00Z",
          updated_at: "2026-05-25T01:00:00Z",
          due_date: "2026-06-20"
        }),
        text: async () => ""
      };
    }
    return {
      ok: true,
      json: async () => ({
        id: 200,
        iid: 2,
        title: "Local title",
        description: "",
        state: "opened",
        labels: ["planning"],
        assignees: [],
        web_url: "https://gitlab.com/group/project/-/issues/2",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T02:00:00Z",
        due_date: "2026-06-30"
      }),
      text: async () => ""
    };
  }, async () => {
    const result = await applySync("gitlab", { outputDir: root });
    assert.equal(result.applied, 1);
  });

  const putBody = JSON.parse(requests.find((request) => request.options.method === "PUT").options.body);
  assert.deepEqual(putBody, {
    due_date: "2026-06-30"
  });
  const task = loadWbs(root).tasks[0];
  assert.equal(task.due_date, "2026-06-30");
  assert.equal(task.provider_refs[0].updated_at, "2026-05-25T02:00:00Z");
});

test("main supports status with output-dir", async () => {
  const root = makePlanwiseDir(sampleWbs);

  const status = await withCapturedConsoleAsync(() => main(["status", "--output-dir", root]));

  assert.equal(status.result, 0);
  assert.match(status.output.join("\n"), /Tasks: 2/);
  assert.match(status.output.join("\n"), /todo=1/);
  assert.match(status.output.join("\n"), /done=1/);
});
