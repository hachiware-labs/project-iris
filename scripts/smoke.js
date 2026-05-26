#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main } = require("../src/cli");

const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-iris-smoke-"));

async function runCli(args) {
  const originalLog = console.log;
  const originalError = console.error;
  const output = [];

  console.log = (message = "") => output.push(String(message));
  console.error = (message = "") => output.push(String(message));

  try {
    const code = await main(args);
    assert.equal(code, 0, output.join("\n"));
    return output.join("\n");
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

(async () => {
  const initOutput = await runCli(["init", "--output-dir", smokeDir]);
  assert.match(initOutput, /Created .*\.planwise/);
  assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "project.yaml")));
  assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "wbs.yaml")));
  assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "providers.yaml")));
  assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "rubrics", "default.yaml")));

  const versionOutput = await runCli(["--version"]);
  assert.match(versionOutput.trim(), /^\d+\.\d+\.\d+$/);

  const emptyListOutput = await runCli(["list", "--output-dir", smokeDir]);
  assert.equal(emptyListOutput.trim(), "No tasks found.");

  const wbsPath = path.join(smokeDir, ".planwise", "wbs.yaml");
  fs.writeFileSync(
    wbsPath,
    `version: 1

tasks:
  - id: T-001
    title: Verify release smoke path
    status: todo
    priority: high
    owner: release
    labels:
      - smoke
    acceptance:
      - CLI can list and show seeded tasks
`,
    "utf8"
  );

  const listOutput = await runCli(["list", "--output-dir", smokeDir, "--label", "smoke"]);
  assert.match(listOutput, /T-001 \[todo high\] @release Verify release smoke path/);

  const validateOutput = await runCli(["validate", "--output-dir", smokeDir]);
  assert.match(validateOutput, /WBS is valid\. 1 task\(s\)\./);

  const showOutput = await runCli(["show", "T-001", "--output-dir", smokeDir]);
  assert.match(showOutput, /T-001: Verify release smoke path/);
  assert.match(showOutput, /Acceptance:\n- CLI can list and show seeded tasks/);

  const exportPath = path.join(smokeDir, "wbs.xlsx");
  const exportOutput = await runCli(["export", "excel", "--path", exportPath, "--output-dir", smokeDir]);
  assert.match(exportOutput, /Exported 1 task\(s\)/);
  assert.ok(fs.existsSync(exportPath));

  const syncOutput = await runCli(["sync", "preview", "excel", "--path", exportPath, "--output-dir", smokeDir]);
  assert.equal(syncOutput.trim(), "No sync differences found.");

  console.log(`Smoke test passed: ${smokeDir}`);
})();
