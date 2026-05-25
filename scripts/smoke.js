#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const cliPath = path.join(rootDir, "src", "cli.js");
const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-iris-smoke-"));

function runCli(args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

const initOutput = runCli(["init", "--output-dir", smokeDir]);
assert.match(initOutput, /Created .*\.planwise/);
assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "project.yaml")));
assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "wbs.yaml")));
assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "providers.yaml")));
assert.ok(fs.existsSync(path.join(smokeDir, ".planwise", "rubrics", "default.yaml")));

const versionOutput = runCli(["--version"]);
assert.match(versionOutput.trim(), /^\d+\.\d+\.\d+$/);

const emptyListOutput = runCli(["list", "--output-dir", smokeDir]);
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

const listOutput = runCli(["list", "--output-dir", smokeDir, "--label", "smoke"]);
assert.match(listOutput, /T-001 \[todo high\] @release Verify release smoke path/);

const validateOutput = runCli(["validate", "--output-dir", smokeDir]);
assert.match(validateOutput, /WBS is valid\. 1 task\(s\)\./);

const showOutput = runCli(["show", "T-001", "--output-dir", smokeDir]);
assert.match(showOutput, /T-001: Verify release smoke path/);
assert.match(showOutput, /Acceptance:\n- CLI can list and show seeded tasks/);

console.log(`Smoke test passed: ${smokeDir}`);
