const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initPlanwise } = require("../src/init");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "project-iris-init-"));
}

test("initPlanwise creates the required scaffold files", () => {
  const root = makeTempDir();

  const result = initPlanwise({ outputDir: root });

  assert.equal(result.planwiseDir, path.join(root, ".planwise"));
  assert.ok(fs.existsSync(path.join(root, ".planwise", "project.yaml")));
  assert.ok(fs.existsSync(path.join(root, ".planwise", "wbs.yaml")));
  assert.ok(fs.existsSync(path.join(root, ".planwise", "providers.yaml")));
  assert.ok(fs.existsSync(path.join(root, ".planwise", "rubrics", "default.yaml")));
});

test("initPlanwise refuses to overwrite an existing .planwise directory by default", () => {
  const root = makeTempDir();
  initPlanwise({ outputDir: root });

  assert.throws(
    () => initPlanwise({ outputDir: root }),
    /already exists/
  );
});

test("initPlanwise overwrites scaffold files when force is true", () => {
  const root = makeTempDir();
  initPlanwise({ outputDir: root });
  const wbsPath = path.join(root, ".planwise", "wbs.yaml");
  fs.writeFileSync(wbsPath, "changed: true\n", "utf8");

  initPlanwise({ outputDir: root, force: true });

  assert.match(fs.readFileSync(wbsPath, "utf8"), /tasks: \[\]/);
});
