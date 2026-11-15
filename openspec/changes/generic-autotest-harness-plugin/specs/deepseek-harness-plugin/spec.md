## Purpose

This capability exposes the generic project lifecycle through a local DeepSeek Harness Cordis plugin while keeping the plugin independent from CoworkAny, other named projects, and any single project command convention.

## ADDED Requirements

### Requirement: The local plugin exposes the generic lifecycle

The plugin SHALL load through a DeepSeek Harness profile patch and register these model-facing tools: `autotest_project_discover`, `autotest_project_init`, `autotest_desktop_goal_register`, `autotest_project_plan`, and `autotest_project_run`.

#### Scenario: Load the plugin in a Harness profile
- **WHEN** the plugin package is installed from the local source path and its profile patch is applied
- **THEN** all five tools register without requiring a project-specific adapter or a direct JEV API connection

#### Scenario: Load the plugin without a model credential
- **WHEN** Harness boots the profile without `DEEPSEEK_API_KEY`
- **THEN** plugin registration remains independently valid and only model execution reports the missing provider credential

### Requirement: Every lifecycle tool accepts a target project root

Each project lifecycle tool SHALL accept `project_root` and SHALL delegate to the generic autotest core. The plugin SHALL NOT contain CoworkAny names, paths, scripts, or workflow commands.

#### Scenario: Run the plugin against CoworkAny or another project
- **WHEN** an agent supplies a valid project root
- **THEN** the tool operates on that root and returns structured JSON containing status and relevant discovery, plan, initialization, or execution data

#### Scenario: Project root is missing
- **WHEN** the supplied root does not exist
- **THEN** the tool returns a structured failure and performs no project write or release action

### Requirement: Mutating operations require explicit flags

The plugin SHALL keep initialization and execution read-only by default. It SHALL require `write: true` to create or refresh target-project definitions and `execute: true` to invoke project methods or release actions.

#### Scenario: Agent requests a plan
- **WHEN** the agent calls `autotest_project_plan` or calls `autotest_project_run` without `execute: true`
- **THEN** the plugin returns a plan and does not invoke project commands, Git, GitHub, deployment, or JEV

#### Scenario: Agent enables execution after a green plan
- **WHEN** the agent calls `autotest_project_run` with `execute: true`
- **THEN** the plugin forwards the request to the core pipeline and returns the first failure or the complete release result without hiding a blocked gate

### Requirement: Plugin results and secrets are safe to expose

The plugin SHALL return machine-readable status values and SHALL redact API-key, token, secret, password, and key-like values from subprocess error output. It SHALL pass environment references to the core without serializing secret values into project definitions or evidence.

#### Scenario: Project command emits a credential-like value
- **WHEN** a delegated command fails and its output contains a credential-like value
- **THEN** the returned tool result contains a redacted value and preserves the failure status

#### Scenario: JEV is needed
- **WHEN** a registered desktop goal is required during a project case
- **THEN** the plugin returns the bounded goal contract and the Agent invokes JEV through its own approved capability; the plugin does not call JEV directly
