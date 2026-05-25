#!/usr/bin/env node

const { initPlanwise } = require("./init");
const packageJson = require("../package.json");
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
  iris list [--status <status>] [--owner <owner>] [--milestone <id>] [--label <label>] [--output-dir <dir>]
  iris show <task-id> [--output-dir <dir>]
  iris validate [--output-dir <dir>]

Commands:
  init    Create a local .planwise project scaffold
  list    List tasks from .planwise/wbs.yaml
  show    Show one task from .planwise/wbs.yaml
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

function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (command === "--version" || command === "-v") {
    console.log(packageJson.version);
    return 0;
  }

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (!["init", "list", "show", "validate"].includes(command)) {
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
  process.exitCode = main();
}

module.exports = {
  main,
  parseInitArgs,
  parseOutputDirArgs,
  parseReadArgs
};
