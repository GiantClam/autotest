## Purpose

This capability gives an agent one project-root entry point for discovering project-owned methods, creating a generic delivery definition, planning the complete lifecycle, and executing release actions only after required project checks pass.

## ADDED Requirements

### Requirement: Project-root discovery is project-independent

The system SHALL accept a target project root and report its repository identity, current branch, version, package manager, available scripts, standard project files, and GitHub Actions workflows. The discovery result SHALL preserve candidate methods for diagnostics and SHALL NOT embed commands or paths for a named project.

#### Scenario: Discover a Node project with existing workflows
- **WHEN** an agent discovers a Git project containing `package.json`, package scripts, and `.github/workflows`
- **THEN** the result includes the detected package manager, version, script candidates, workflow capabilities, repository, and branch

#### Scenario: Discover an unsupported or incomplete project
- **WHEN** the project does not expose a required standard entry point or its ecosystem cannot be determined
- **THEN** the result identifies the missing capability and the lifecycle can enter `blocked` with a named reason

### Requirement: Initialization creates a generic project definition

The system SHALL generate `.autotest/project.json` from discovered project-owned capabilities. Initialization SHALL preserve an existing definition unless force is explicitly requested, and a missing required stage SHALL be represented as an incomplete manual method rather than silently skipped.

#### Scenario: Initialize a project with existing methods
- **WHEN** an agent initializes a project containing test, build, package, or smoke entries
- **THEN** the generated definition references those entries by method kind and identifier without copying project-specific implementation into autotest

#### Scenario: Initialize a project with a missing method
- **WHEN** a required stage has no discovered runnable method
- **THEN** the generated definition contains an incomplete project-owned task and the next execution is blocked until the agent creates and verifies the missing entry

#### Scenario: Initialize without write authorization
- **WHEN** the agent requests initialization without an explicit write flag
- **THEN** the system returns the proposed action without creating or modifying files under the target project

### Requirement: Planning is side-effect free and execution is gated

The system SHALL provide a read-only plan for discover, implementation, verify, build, package, smoke, commit, push, merge, tag, and publish. The system SHALL execute project methods before release actions, stop at the first required failure or manual gate, and SHALL NOT perform release actions when the pipeline is blocked.

#### Scenario: Plan a complete project lifecycle
- **WHEN** an agent requests a plan without execution authorization
- **THEN** the system reports ordered stage statuses and planned release actions without invoking project commands, Git, GitHub, deployment, or JEV side effects

#### Scenario: Required implementation is incomplete
- **WHEN** execution reaches an incomplete implementation or required project method
- **THEN** the pipeline returns `blocked` with the stopping stage and performs zero commit, push, merge, tag, or publish actions

#### Scenario: All required checks pass with execution enabled
- **WHEN** every required project method passes and the agent explicitly enables execution
- **THEN** the pipeline may automatically commit configured paths, push the current branch, create or merge the single valid pull request, tag the merged default branch, and publish the configured GitHub Release

### Requirement: Release actions use target-project semantics

The system SHALL invoke the target project's existing scripts and workflows for verification, build, package, and smoke behavior. The system SHALL retain explicit release configuration, reject missing repository/version/branch context, and return a machine-readable result for every stage.

#### Scenario: Target project owns packaging and release workflow
- **WHEN** the project definition selects a package script or workflow
- **THEN** autotest invokes that project-owned method and records its result before any generic GitHub release action

#### Scenario: Release context is incomplete
- **WHEN** the repository, non-default branch, version/tag, pull request, or required project method is unavailable
- **THEN** the system returns `blocked` or `manual_required` with the missing context and does not claim publication
