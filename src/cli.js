#!/usr/bin/env node

const { initPlanwise } = require("./init");
const { exportExcelTasks, parseExcelExportArgs } = require("./exporters/excel");
const { importExcelTasks, parseExcelImportArgs } = require("./importers/excel");
const { importGitLabIssues, parseGitLabImportArgs } = require("./importers/gitlab");
const { importGitHubIssues, parseGitHubImportArgs } = require("./importers/github");
const packageJson = require("../package.json");
const { formatStatusSummary, loadStatusSummary } = require("./status");
const { formatSyncPreview, previewSync } = require("./sync/preview");
const {
  filterTasks,
  findTask,
  formatTaskDetails,
  formatTaskList,
  loadWbs
} = require("./wbs");

function printHelp() {
  console.log(`Usage:
  iris --version
  iris init [--output-dir <dir>] [--force]
  iris import github --repo <owner/name> [--state open|closed|all] [--limit <n>] [--output-dir <dir>]
  iris import gitlab --project <id-or-path> [--host <url>] [--state opened|closed|all] [--limit <n>] [--output-dir <dir>]
  iris import excel --path <file.xlsx> [--sheet <name-or-number>] [--output-dir <dir>]
  iris export excel --path <file.xlsx> [--output-dir <dir>]
  iris sync preview <github|gitlab|excel> [provider options] [--output-dir <dir>]
  iris list [--status <status>] [--owner <owner>] [--milestone <id>] [--label <label>] [--output-dir <dir>]
  iris show <task-id> [--output-dir <dir>]
  iris status [--output-dir <dir>]
  iris validate [--output-dir <dir>]

Commands:
  init     Create a local .planwise project scaffold
  export   Export local WBS views
  import   Import tasks from supported providers
  list     List tasks from .planwise/wbs.yaml
  show     Show one task from .planwise/wbs.yaml
  status   Summarize the current WBS state
  sync     Preview differences between WBS and providers
  validate Validate .planwise/wbs.yaml
`);
}

function parseInitArgs(args) {
  const options = {
    outputDir: process.cwd(),
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output-dir requires a directory path");
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseReadArgs(args) {
  const options = {
    outputDir: process.cwd()
  };
  const optionNames = {
    "--output-dir": "outputDir",
    "--status": "status",
    "--owner": "owner",
    "--milestone": "milestone",
    "--label": "label"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (optionNames[arg]) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[optionNames[arg]] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseOutputDirArgs(args) {
  const options = {
    outputDir: process.cwd()
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output-dir requires a directory path");
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (command === "--version" || command === "-v") {
    console.log(packageJson.version);
    return 0;
  }

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (!["init", "export", "import", "list", "show", "status", "sync", "validate"].includes(command)) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  try {
    if (command === "list") {
      const options = parseReadArgs(args);
      const wbs = loadWbs(options.outputDir);
      console.log(formatTaskList(filterTasks(wbs.tasks, options)));
      return 0;
    }

    if (command === "import") {
      const [provider, ...providerArgs] = args;

      if (provider === "github") {
        const result = await importGitHubIssues(parseGitHubImportArgs(providerArgs));
        console.log(`Imported ${result.imported} GitHub issue(s). Created ${result.created}, updated ${result.updated}.`);
        return 0;
      }

      if (provider === "gitlab") {
        const result = await importGitLabIssues(parseGitLabImportArgs(providerArgs));
        console.log(`Imported ${result.imported} GitLab issue(s). Created ${result.created}, updated ${result.updated}.`);
        return 0;
      }

      if (provider === "excel") {
        const result = await importExcelTasks(parseExcelImportArgs(providerArgs));
        console.log(`Imported ${result.imported} Excel task(s). Created ${result.created}, updated ${result.updated}.`);
        return 0;
      }

      throw new Error("import requires a provider: github, gitlab, or excel");
    }

    if (command === "export") {
      const [provider, ...providerArgs] = args;

      if (provider === "excel") {
        const result = exportExcelTasks(parseExcelExportArgs(providerArgs));
        console.log(`Exported ${result.exported} task(s) to ${result.path}.`);
        return 0;
      }

      throw new Error("export requires a provider: excel");
    }

    if (command === "show") {
      const [taskId, ...rest] = args;
      if (!taskId || taskId.startsWith("--")) {
        throw new Error("show requires a task id");
      }
      const options = parseReadArgs(rest);
      const wbs = loadWbs(options.outputDir);
      const task = findTask(wbs.tasks, taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      console.log(formatTaskDetails(task));
      return 0;
    }

    if (command === "status") {
      const options = parseOutputDirArgs(args);
      console.log(formatStatusSummary(loadStatusSummary(options.outputDir)));
      return 0;
    }

    if (command === "sync") {
      const [action, provider, ...providerArgs] = args;
      if (action !== "preview") {
        throw new Error("sync requires an action: preview");
      }
      const diffs = await previewSync(provider, providerArgs);
      console.log(formatSyncPreview(diffs));
      return 0;
    }

    if (command === "validate") {
      const options = parseOutputDirArgs(args);
      const wbs = loadWbs(options.outputDir);
      console.log(`WBS is valid. ${wbs.tasks.length} task(s).`);
      return 0;
    }

    const result = initPlanwise(parseInitArgs(args));
    console.log(`Created ${result.planwiseDir}`);
    for (const file of result.files) {
      console.log(`Created ${file}`);
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  main,
  parseInitArgs,
  parseOutputDirArgs,
  parseReadArgs
};
