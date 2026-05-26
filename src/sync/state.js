const fs = require("node:fs");
const path = require("node:path");

function syncDirFor(outputDir = process.cwd()) {
  return path.join(path.resolve(outputDir), ".planwise", "sync");
}

function previewPathFor(outputDir = process.cwd()) {
  return path.join(syncDirFor(outputDir), "last-preview.json");
}

function savePreview(outputDir, preview) {
  const target = previewPathFor(outputDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
  return target;
}

function loadPreview(outputDir = process.cwd()) {
  const target = previewPathFor(outputDir);
  if (!fs.existsSync(target)) {
    throw new Error("Sync apply requires a preview result. Run iris sync preview first.");
  }

  return JSON.parse(fs.readFileSync(target, "utf8"));
}

module.exports = {
  loadPreview,
  previewPathFor,
  savePreview
};
