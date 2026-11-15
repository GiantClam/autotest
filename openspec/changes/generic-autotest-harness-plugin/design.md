## Context

The current core already discovers project scripts/workflows, initializes `.autotest/project.json`, executes a staged pipeline, and performs generic Git/GitHub release actions. The local DeepSeek Harness plugin currently delegates to the CLI because the target project's commands must remain project-owned. The target project may be dirty during discovery and planning, so mutating validation uses an isolated worktree or an explicitly selected project root.

The design follows the decisions captured by grill-me: local/source Harness plugin first; generic standard-ecosystem discovery with named blocking for unknown capabilities; full target-project write capability behind explicit tool flags; desktop goals registered by autotest while JEV is called only by the Agent when needed; and automatic push, merge, tag, and release after all required checks are green.

## Goals / Non-Goals

**Goals:**

- Keep one project-independent lifecycle contract based on `project_root`.
- Make missing project methods visible and recoverable through target-project changes and re-discovery.
- Provide a locally installable Harness plugin with structured, redacted results.
- Persist bounded desktop goals without coupling autotest to a JEV SDK or key.
- Preserve explicit plan/write/execute boundaries and automatic release behavior after a green pipeline.

**Non-Goals:**

- Adding CoworkAny-specific code, commands, paths, or adapters.
- Calling JEV directly from the autotest core or Harness plugin.
- Replacing a target project's build, packaging, signing, notarization, deployment, or rollback workflow.
- Claiming production readiness from local tests, plugin registration, or a JEV operation receipt alone.

## Decisions

### Use the CLI as the stable plugin seam

The Harness plugin delegates to `src/cli.mjs` through an argument array and bounded subprocess. This keeps discovery, initialization, pipeline, release, redaction, and future evidence logic in one core. A native Harness implementation was considered, but it would duplicate the project contract and make the plugin version-sensitive.

### Generate a project-owned definition from discovery

`init` writes `.autotest/project.json` from detected scripts and workflows. A missing required stage becomes an incomplete manual method, allowing the Agent to create the smallest project-owned entry and re-run discovery. Autotest does not invent a named project's command.

### Separate desktop registration from desktop execution

`desktop-goal` validates safe identifiers and bounded policy fields, then optionally writes `.autotest/cases/<case-id>/desktop-goals.json`. The plugin returns `executor: agent-jv` and a policy reference; the Agent owns the later JEV invocation and independent verification. Direct JEV integration was rejected for this change because it would mix provider credentials and desktop side effects into the generic lifecycle.

### Make mutation explicit and release automatic after green

The plugin defaults to read-only discovery, initialization preview, and planning. `write: true` permits target-project definition changes; `execute: true` permits project methods and the configured release actions. Once all required stages pass, the existing release pipeline may push, merge, tag, and publish automatically according to the target definition.

### Keep local profile installation dependency-light

The source plugin registers ordinary Cordis tool definitions through the host `ctx.tools` service and does not require a particular DSH package version at runtime. This avoids the local profile peer-resolution failure found when a linked plugin depended on `@deepseek-ai/dsh-tools` and `@deepseek-ai/schemastery` from outside the Harness workspace.

## Risks / Trade-offs

- **[Risk]** A generated method may select a plausible but incorrect project script. → Preserve candidates, expose the selected method in the plan, and block on its failure rather than treating discovery as proof.
- **[Risk]** Automatic release can mutate GitHub and publish artifacts. → Require explicit `execute: true`, execute project methods first, and stop on missing context or failed gates.
- **[Risk]** A desktop receipt may be mistaken for product success. → Require independent evidence and keep receipt verification separate from goal registration.
- **[Risk]** Local source installation can point at the wrong autotest checkout. → Configure `AUTOTEST_ROOT` in the Harness profile environment and return a structured CLI failure when the core cannot be found.
- **[Risk]** The current core does not yet persist a complete Delivery Case event/evidence manifest. → Track resumability, evidence hashing, and release verification as follow-up tasks before claiming factory-level production readiness.

## Migration Plan

1. Keep existing v1 project definitions and CLI plan/run behavior working.
2. Install the local plugin into a dedicated Harness profile and apply `plugin/cordis.patch.yml`.
3. Run discover and init in plan mode for each target project; inspect the generated method map and desktop goals.
4. Enable writes only in an isolated or explicitly selected target worktree, then re-run discovery and plan.
5. Enable `execute: true` only after project methods, release context, and required credentials are verified; record push, merge, tag, release, deployment, smoke, and observation separately.
6. Roll back by removing the profile patch and deleting only generated `.autotest` files from the target case; existing project-owned scripts and workflows remain under project Git history.

## Open Questions

None for this change. Target-specific signing, deployment, rollback, and production credential requirements remain runtime gates and must be resolved by the target project's release policy before execution.
