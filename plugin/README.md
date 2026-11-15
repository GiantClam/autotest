# DeepSeek Harness autotest plugin

This package mounts the generic `autotest` lifecycle as DeepSeek Harness tools. It accepts any project root that can expose standard project metadata or explicit project-owned commands:

`discover → init → desktop-goal → plan → run`

The plugin does not contain CoworkAny commands. `autotest_project_init` discovers the target project's existing scripts and workflows and writes `.autotest/project.json` only when the model passes `write: true`. Missing required stages become visible manual gates so the agent can create the smallest project-owned implementation, refresh the definition, and re-run the plan.

`autotest_desktop_goal_register` persists a bounded desktop objective when `write: true`. It records allowed applications, allowed windows, maximum actions, timeout, and required evidence. It does not call JEV; the Agent invokes JEV only when that goal is needed and must return the registered operation receipt.

## Local profile overlay

From the DeepSeek Harness source checkout:

```bash
AUTOTEST_ROOT=/Users/beihuang/Documents/github/autotest \
  dsh plugin --profile autotest add /Users/beihuang/Documents/github/autotest/plugin
cp /Users/beihuang/Documents/github/autotest/plugin/cordis.patch.yml \
  "$DSH_HOME/profiles/autotest/cordis.patch.yml"
# Keep this variable set when launching the profile as well.
export AUTOTEST_ROOT=/Users/beihuang/Documents/github/autotest
dsh --profile autotest "inspect the target project"
```

The copy applies the plugin row to the profile; an equivalent `--patch /path/to/plugin/cordis.patch.yml` overlay can be used for a one-off launch. Set `AUTOTEST_ROOT` when the package is installed outside this repository.

The plugin has no runtime dependency on a particular DSH package version: it registers ordinary Cordis tool definitions through the host `ctx.tools` service. `autotest_project_run` is plan-only by default. Passing `execute: true` enables the configured project methods and release actions; the generated definition stages only `.autotest` until the agent explicitly expands the commit paths after reviewing its diff.
