# autotest

`autotest` is the project-independent orchestration layer for the complete engineering loop:

`discover → implementation → verify → build → package → commit → push → merge → tag → publish → smoke`

The implementation, verification, build, package, and smoke steps call methods exposed by the target project. `autotest` discovers package scripts and GitHub workflows, but it does not copy a project's commands into its own source. Each project can provide an `autotest` definition based on [examples/project.autotest.json](examples/project.autotest.json).

The commit and push steps are generic Git operations. They stage only the configured paths, push the current non-default branch, and then let the release steps locate and merge the single open PR. The release steps run only after all required project methods pass, and the mutating path requires `run --execute`; `plan` is the default mode. The package method remains project-owned, while `release.publish.assets` tells the generic GitHub Release step which generated installers or archives to upload. A missing project method, version, repository, PR, or smoke check stops the pipeline with `blocked` instead of silently skipping a stage.

## Commands

```bash
npm test
npm run check
node src/cli.mjs discover /path/to/project
node src/cli.mjs plan --project-root /path/to/project --config /path/to/project/autotest.project.json
node src/cli.mjs run --project-root /path/to/project --config /path/to/project/autotest.project.json --execute --output /tmp/autotest-run.json
```

`package-script` methods resolve the project's package manager from `package.json` and invoke the existing script. `workflow` methods dispatch an existing GitHub Actions workflow through `gh`. `command` methods are explicit project-owned commands. `manual` methods make a human or agent implementation step visible in the pipeline and block release until it is marked complete.

The generic engine deliberately does not contain CoworkAny, AIMarketing, AutoViralVid, or Image Editor commands. Their adapters can be added after discovery confirms the exact project-owned entry points.

When `--execute` is supplied, the release stages use `gh` and `git` to locate and merge the single open PR for the current branch, tag the merged default branch, and create the GitHub Release. The token used by `gh` must have the repository's pull request, contents, and release permissions. A duplicate tag, missing PR, missing project version, or missing smoke method stops the pipeline.
