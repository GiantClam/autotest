# DeepSeek Harness autosoftwarefactory plugin

This package mounts the generic `autosoftwarefactory` lifecycle as DeepSeek Harness tools. It accepts any project root that can expose standard project metadata or explicit project-owned commands:

`discover → init → desktop-goal → plan → run`

The plugin does not contain CoworkAny commands. `autotest_project_init` discovers the target project's existing scripts and workflows and writes `.autotest/project.json` only when the model passes `write: true`. Missing required stages return a handoff; `autosoftwarefactory_project_assist` previews Agent-provided files, requires `write: true`, writes only allowed paths, and re-runs discovery.

`autotest_desktop_goal_register` persists a bounded desktop objective when `write: true`. It records allowed applications, allowed windows, maximum actions, timeout, and required evidence. It does not call JEV; the Agent invokes JEV only when that goal is needed and must return the registered operation receipt.

## Local profile overlay

From the DeepSeek Harness source checkout:

```bash
AUTOSOFTWAREFACTORY_ROOT=/Users/beihuang/Documents/github/autosoftwarefactory \
  dsh plugin --profile autosoftwarefactory add /Users/beihuang/Documents/github/autosoftwarefactory/plugin
cp /Users/beihuang/Documents/github/autosoftwarefactory/plugin/cordis.patch.yml \
  "$DSH_HOME/profiles/autosoftwarefactory/cordis.patch.yml"
# Keep this variable set when launching the profile as well.
export AUTOSOFTWAREFACTORY_ROOT=/Users/beihuang/Documents/github/autosoftwarefactory
dsh --profile autosoftwarefactory "inspect the target project"
```

The copy applies the plugin row to the profile; an equivalent `--patch /path/to/plugin/cordis.patch.yml` overlay can be used for a one-off launch. Set `AUTOSOFTWAREFACTORY_ROOT` when the package is installed outside this repository.

The plugin has no runtime dependency on a particular DSH package version: it registers ordinary Cordis tool definitions through the host `ctx.tools` service. `autotest_project_run` is plan-only by default. Passing `execute: true` enables the configured project methods and release actions; the generated definition stages only `.autotest` until the agent explicitly expands the commit paths after reviewing its diff.
