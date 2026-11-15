## 1. Formalize the generic project contract

- [x] 1.1 Keep `project_root` as the project-independent entry boundary and generate `.autotest/project.json` from discovered project-owned methods.
- [x] 1.2 Add explicit `init`, plan-default behavior, and missing-method blocking to the CLI.
- [x] 1.3 Extend the contract with v2 lifecycle identifiers, actor/input/output references, failure classifications, environment references, evidence requirements, and v1 normalization.
- [x] 1.4 Add JSON Schemas for project definitions, delivery cases, events, and evidence manifests.

**Verification:** Run focused contract, discovery, initialization, and pipeline tests; validate v1 definitions continue to produce the existing plan output.

## 2. Complete resumable execution and evidence

- [x] 2.1 Add Delivery Case creation under `.autotest/cases/<work-item-id>/` with target SHA, branch, repository, environment, and policy references.
- [x] 2.2 Record one durable event and result after every stage; write a redacted SHA-256 evidence manifest.
- [x] 2.3 Add `doctor`, `resume`, and `verify` commands; stop on target SHA drift, missing evidence, non-resumable failure, or policy violation.
- [x] 2.4 Add retry limits and classify failures as product, environment, dependency/provider, test-script, policy, or human-required.

**Verification:** Test interrupted runs, resume without duplicate side effects, invalid evidence paths, secret redaction, missing evidence, and target SHA drift.

## 3. Finish the local DeepSeek Harness plugin

- [x] 3.1 Add the local Cordis package, profile patch, and installation documentation.
- [x] 3.2 Register `autotest_project_discover`, `autotest_project_init`, `autotest_desktop_goal_register`, `autosoftwarefactory_project_assist`, `autotest_project_plan`, and `autotest_project_run`.
- [x] 3.3 Keep write and execute operations explicit, structured, redacted, and independent of CoworkAny.
- [x] 3.4 Validate local profile registration and keyless boot; treat a missing model credential as a provider gate rather than a plugin registration failure.
- [x] 3.5 Add a repeatable keyless Harness fixture test that loads the plugin, invokes each tool with a fake project, and checks tool output schemas.

**Verification:** Run `npm test`, `npm run check`, plugin syntax checks, Harness build, profile dump, and a keyless profile boot.

## 4. Support generic project creation and modification

- [x] 4.1 Add an implementation handoff artifact that describes the missing stage, detected ecosystem, allowed target paths, success condition, and required evidence.
- [x] 4.2 Add an Agent runner boundary that can create or modify target-project scripts, tests, configuration, and workflows only after explicit project write authorization, with a human assistance response when authorization or path scope is missing.
- [x] 4.3 Produce a diff preview before source/script/test/workflow writes and re-run discovery after every accepted change.
- [x] 4.4 Add standard-family fixtures for Node, Python, Rust, Go, Make, and JVM projects; unknown families must produce a named blocked capability.

**Verification:** Assert no project-specific adapter is added to autotest, all modified target paths appear in the diff, and missing methods become runnable only after re-discovery.

## 5. Add bounded desktop execution and deterministic evidence

- [x] 5.1 Validate safe case/goal IDs and persist bounded goal records with app/window allowlists, action limits, timeouts, and evidence requirements.
- [x] 5.2 Keep goal registration separate from JEV execution and label the delegated executor as `agent-jv`.
- [x] 5.3 Add a registered desktop adapter interface with inspect-only, bounded-operation, and human-assisted modes.
- [x] 5.4 Add independent desktop receipt verification and stop conditions for unknown dialogs, MFA/CAPTCHA, payment, deletion, deploy, secret, timeout, and action-limit events.
- [x] 5.5 Add Playwright methods that record stable assertions, trace/screenshot/video/JUnit paths, and failure classifications.

**Verification:** Use fake adapters and fake JEV receipts only; no unit test may call the real JEV API or expose its key.

## 6. Harden automatic GitHub release behavior

- [x] 6.1 Require exactly one pull request and all required checks for the head SHA before merge.
- [x] 6.2 Record the merge commit SHA and tag that exact default-branch commit.
- [x] 6.3 Make tag, release, and project-workflow dispatch retry-safe and fail closed on mismatched existing objects.
- [x] 6.4 Wait for project release workflows and verify project-provided artifacts, checksums, signatures, notarization, and release metadata.
- [x] 6.5 Keep automatic push/merge/tag/release behind `execute: true` and stop before publication on unresolved target-project policy gates.

**Verification:** Test missing checks, wrong SHA, duplicate tag/release, workflow timeout, draft release recovery, artifact mismatch, and plan-mode side-effect isolation.

## 7. Rehearse against CoworkAny and publish evidence

- [x] 7.1 Discover CoworkAny read-only and confirm the generic plugin reports its package manager, version, and workflows without a CoworkAny branch in autotest.
- [x] 7.2 Run `init → plan → run --execute` in an isolated CoworkAny worktree and confirm the implementation gate blocks release actions when incomplete.
- [ ] 7.3 Resolve CoworkAny's actual implementation, clean-machine acceptance, signing/notarization, deployment, rollback, and credential gates in the target case.
- [ ] 7.4 Run the full green pipeline with project-owned methods, required CI, merge, tag, release workflow, artifact verification, post-release smoke, and observation.
- [ ] 7.5 Report local tests, CI, push, merge, tag, draft/public release, deployment, smoke, and observation as separate evidence records.

**Verification:** Do not call the overall factory release-ready until every external gate has a current, target-SHA-specific evidence record.

## 8. Add CI and release quality gates

- [x] 8.1 Add CI for install, core tests, CLI check, schema validation, fixture planning, and plugin registration.
- [x] 8.2 Add meta-tests proving plan mode never calls Git/GitHub/deployment/JEV side effects.
- [x] 8.3 Add security tests for secret-like redaction, path traversal rejection, bounded desktop policy, and unauthorized publication.
- [x] 8.4 Require all applicable OpenSpec tasks and release evidence gates before publishing a new autotest/Harness plugin revision.

**Verification:** Run the repository CI gate and strict OpenSpec validation before implementation is considered complete.

## Current external gate

Tasks 7.3–7.5 remain open because the current CoworkAny checkout is dirty and the isolated rehearsal stopped at its incomplete implementation gate. The release gate intentionally blocks publication until target-SHA-specific implementation, clean-machine acceptance, signing/notarization, deployment, rollback, credential, release, smoke, and observation evidence is recorded.
