const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { main, parseOutputDirArgs, parseReadArgs } = require("../src/cli");
const { rowsToTasks } = require("../src/importers/excel");
const { issueToTask } = require("../src/importers/github");
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
  const task = issueToTask({
    number: 12,
    title: "Connect GitHub import",
    body: "Import open issues",
    state: "open",
    labels: [{ name: "priority:high" }, { name: "blocked" }],
    assignees: [{ login: "kitfactory" }],
    milestone: { title: "M-001" },
    html_url: "https://github.com/hachiware-labs/project-iris/issues/12",
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T01:00:00Z"
  }, "hachiware-labs/project-iris");

  assert.equal(task.id, "GH-12");
  assert.equal(task.status, "blocked");
  assert.equal(task.priority, "high");
  assert.equal(task.owner, "kitfactory");
  assert.equal(task.milestone, "M-001");
  assert.equal(task.provider_refs[0].provider, "github");
});

test("rowsToTasks maps Excel rows to WBS tasks", () => {
  const tasks = rowsToTasks([
    ["ID", "Title", "Status", "Priority", "Owner", "Labels", "Depends On", "Acceptance"],
    ["T-010", "Import spreadsheet", "todo", "medium", "ops", "excel, import", "T-001; T-002", "Rows become tasks\nIDs are preserved"]
  ], "C:\\tmp\\wbs.xlsx");

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "T-010");
  assert.equal(tasks[0].title, "Import spreadsheet");
  assert.deepEqual(tasks[0].labels, ["excel", "import"]);
  assert.deepEqual(tasks[0].depends_on, ["T-001", "T-002"]);
  assert.deepEqual(tasks[0].acceptance, ["Rows become tasks", "IDs are preserved"]);
});

test("main supports status with output-dir", async () => {
  const root = makePlanwiseDir(sampleWbs);

  const status = await withCapturedConsoleAsync(() => main(["status", "--output-dir", root]));

  assert.equal(status.result, 0);
  assert.match(status.output.join("\n"), /Tasks: 2/);
  assert.match(status.output.join("\n"), /todo=1/);
  assert.match(status.output.join("\n"), /done=1/);
});
