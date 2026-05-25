# Project Iris

See the current state of a project across tools.

Project Iris stores project metadata, a WBS task list, provider mappings, and review rubrics in a local `.planwise` directory. The current `iris` CLI supports creating the scaffold and reading tasks from `.planwise/wbs.yaml`.

## Requirements

- Node.js 18 or newer
- npm

## Install

After publication, install the CLI from npm:

```sh
npm install -g project-iris
```

For repository-local development:

```sh
npm install
```

For local CLI testing:

```sh
npm link
```

You can also run the CLI directly:

```sh
node src/cli.js --help
```

Check the installed CLI version:

```sh
iris --version
```

## Initialize A Project

Create a `.planwise` scaffold in the current directory:

```sh
iris init
```

Create the scaffold somewhere else:

```sh
iris init --output-dir ./example-project
```

Overwrite an existing scaffold:

```sh
iris init --output-dir ./example-project --force
```

The scaffold includes:

- `.planwise/project.yaml`
- `.planwise/wbs.yaml`
- `.planwise/providers.yaml`
- `.planwise/rubrics/default.yaml`

## List Tasks

`iris list` reads `.planwise/wbs.yaml` and prints compact task rows.

```sh
iris list
```

Use filters when you only want part of the WBS:

```sh
iris list --status todo
iris list --owner release
iris list --milestone M-001
iris list --label smoke
iris list --output-dir ./example-project --status todo
```

Example `wbs.yaml`:

```yaml
version: 1

tasks:
  - id: T-001
    title: Verify release smoke path
    status: todo
    priority: high
    owner: release
    labels:
      - smoke
    milestone: M-001
    depends_on: []
    acceptance:
      - CLI can list and show seeded tasks
```

Example output:

```text
T-001 [todo high] @release Verify release smoke path
```

## Show One Task

Show full details for one task ID:

```sh
iris show T-001
```

Use `--output-dir` when the `.planwise` directory is not under the current working directory:

```sh
iris show T-001 --output-dir ./example-project
```

## Validate WBS

Validate `.planwise/wbs.yaml` before using it in automation:

```sh
iris validate
iris validate --output-dir ./example-project
```

Validation checks that `version` is `1`, `tasks` is an array, each task has a non-empty `id` and `title`, common scalar fields are strings, common list fields are arrays, task IDs are unique, and `depends_on` entries reference existing tasks without cycles.

Example invalid `wbs.yaml`:

```yaml
version: 1

tasks:
  - id: T-001
    title: Valid task
    depends_on:
      - T-999
  - id: ""
    labels: cli
  - id: T-002
    title: Self cycle
    depends_on:
      - T-002
```

## Verification

Run the unit tests:

```sh
npm test
```

Run the CLI smoke test:

```sh
npm run smoke
```

The smoke test creates a temporary project, runs `init`, verifies the scaffold files, seeds one WBS task, then checks `list` and `show`.

## Release Policy

Project Iris is the project/product name. The public npm package name is `project-iris`; the CLI command is `iris`.

- `"license": "MIT"` publishes the package under the MIT License.
- `"files": ["src/"]` keeps npm package contents limited to runtime CLI code. npm still includes required package metadata and this README automatically.

Before publishing to npm, re-run `npm test`, `npm run smoke`, and `npm pack --dry-run`.

## Release Checklist

Before cutting a release candidate:

1. Run `npm test`.
2. Run `npm run smoke`.
3. Run `npm pack --dry-run`.
4. Confirm `package.json` metadata is intentional.
5. Review the generated `.planwise` schema examples in this README against the current CLI behavior.
