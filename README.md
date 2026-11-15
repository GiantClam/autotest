# autosoftwarefactory

`autosoftwarefactory` is the project-independent orchestration layer for the complete engineering loop:

`discover → implementation → verify → build → package → commit → push → merge → tag → publish → smoke`

The implementation, verification, build, package, and smoke steps call methods exposed by the target project. `autosoftwarefactory` discovers package scripts and GitHub workflows, but it does not copy a project's commands into its own source. Each project can provide a project definition based on [examples/project.autotest.json](examples/project.autotest.json).

The commit and push steps are generic Git operations. They stage only the configured paths, push the current non-default branch, and then let the release steps locate and merge the single open PR. The release steps run only after all required project methods pass, and the mutating path requires `run --execute`; `plan` is the default mode. A missing project method returns `needs_human` with a project-owned implementation handoff. `assist` previews generated files, requires explicit write authorization, writes only allowed paths, and re-runs discovery. Unresolved dirty paths return a human assistance request before commit.

## Commands

```bash
npm test
npm run check
node src/cli.mjs discover /path/to/project
node src/cli.mjs doctor --project-root /path/to/project
node src/cli.mjs init --project-root /path/to/project
node src/cli.mjs assist --project-root /path/to/project --stage implementation
node src/cli.mjs case-init --project-root /path/to/project --work-item-id WI-1 --project demo --repository owner/demo --target-sha <sha> --branch codex/demo
node src/cli.mjs plan --project-root /path/to/project
node src/cli.mjs run --project-root /path/to/project --execute --output /tmp/autotest-run.json
node src/cli.mjs resume --project-root /path/to/project --case /path/to/project/.autotest/cases/WI-1
node src/cli.mjs verify --case /path/to/project/.autotest/cases/WI-1 --project-root /path/to/project
node src/cli.mjs release-gate
```

`package-script` methods resolve the project's package manager from `package.json` and invoke the existing script. `workflow` methods dispatch an existing GitHub Actions workflow through `gh`. `command` methods are explicit project-owned commands. `manual` methods make a human or agent implementation step visible in the pipeline and block release until it is marked complete.

Each executed Delivery Case records stage events under `.autotest/cases/<work-item-id>/events.jsonl`. Evidence is hashed in `evidence-manifest.json`; `resume` skips passed stages, and `verify` fails closed on missing evidence or target SHA drift. TypeSafe/Jev is an optional bounded decision provider: set `JEV_API_KEY` or `TYPESAFE_API_KEY` only for an explicitly registered Agent Desktop operation. The autosoftwarefactory plugin does not call JEV during discovery or planning.

The generic engine deliberately does not contain CoworkAny, AIMarketing, AutoViralVid, or Image Editor commands. `init` creates a project-owned definition from discovered entries; if a required entry is missing, the handoff tells the Agent how to create it in the target project and re-run discovery.

## DeepSeek Harness plugin

`plugin/` exposes the lifecycle tools plus `autosoftwarefactory_project_assist`. Install the local plugin into a Harness profile with `dsh plugin --profile web add /path/to/autosoftwarefactory/plugin`, then apply `plugin/cordis.patch.yml`. The tools accept `project_root`, so the plugin remains project-independent. Desktop registration is bounded and does not call JEV; the Agent calls JEV on demand. Planning is the default; `execute: true` is the explicit mutating path for project methods and configured GitHub release actions.

When `--execute` is supplied, the release stages use `gh` and `git` to locate and merge the single open PR for the current branch, tag the merged default branch, and create the GitHub Release. The token used by `gh` must have the repository's pull request, contents, and release permissions. A duplicate tag, missing PR, missing project version, or missing smoke method stops the pipeline.
