# Human-Agent Software Factory Autotest Implementation Plan

> For agentic workers: use the executing-plans workflow to implement this plan task by task. Each task ends with an independent verification gate.

**Goal:** 将当前 autotest 从“项目脚本 + GitHub Release 编排器”升级为一个接收任意项目路径、能够发现项目能力、创建或修改目标项目、执行测试并推进发布闭环的半自动交付系统；CoworkAny 只作为真实验证项目，不进入 autotest 核心代码。

**Architecture:** autotest 通过 project-root 接入任意 Git 项目，先发现语言、包管理器、构建工具、测试入口、workflow、发布目标和运行环境，再生成或更新目标项目内的通用 .autotest/project.json。若项目缺少入口，implementation/bootstrap 阶段可以在目标项目允许路径内创建或修改脚本、测试、配置和 workflow；这些变更属于目标项目，不属于 autotest 专用适配器。浏览器测试优先调用项目已有入口，真实桌面操作通过统一的 Agent Desktop + JEV 边界执行，发布语义由目标项目现有或自动生成的 workflow 负责。

**Harness integration:** DeepSeek Harness 是控制面，`autotest/plugin/` 提供 project-root 工具插件。插件只转发到 autotest 通用 CLI；目标项目的脚本、workflow、构建器和发布入口仍由目标仓库提供。Harness Agent 先调用 discover/init/plan，再由项目内修改和重新发现闭环缺失入口，最后显式传入 execute 才进入 Git、GitHub 和发布动作。

**Tech Stack:** Node.js 20+、ESM、Node test runner、pnpm/npm project scripts、Git、GitHub CLI/API、GitHub Actions、Playwright、Agent Desktop、JEV/TypeSafe API、JSON Schema/YAML artifacts。

## Global Constraints

- 附件文档是方案设计稿和目标约束，不能替代项目当前 workflow、发布文档和 CI 的事实状态。
- autotest 不复制任何具体项目的命令；优先发现标准入口，缺失时在目标项目内生成或修改通用入口。项目配置是生成的能力清单，不是需要为每个项目编写的专用 adapter。
- DeepSeek Harness 插件不绑定 CoworkAny 或其他具体项目；它只接收绝对 project-root，并把 discover、init、desktop-goal、plan、run 暴露为模型工具。桌面工具只注册有边界的目标，不直接调用 JEV。
- “任何项目”表示任何 Git 项目都能通过 project-root 接入并进入发现、计划、修改、测试、审查和发布决策；未知语言、外部部署或缺失凭据必须生成可执行的 BLOCKED 原因，不得伪装成自动通过。
- 每个 Delivery Case 固定一个 work_item_id、目标 Git SHA、分支、仓库和环境；缺少这些信息只能进入 BLOCKED。
- Agent 不能以自然语言宣布完成；阶段完成必须由确定性结果和证据 manifest 判定。
- 默认执行顺序为：预检 → 方法执行 → 证据校验 → PR/CI → 合并 → tag → 项目 release workflow → 发布验证 → smoke/observe；任何失败立即停止并可恢复。
- plan/无 execute 只读；所有 commit、push、PR、merge、tag、release、deploy 和桌面写操作必须受执行模式和政策控制。
- secret 只保存引用或环境变量名；不写入 config、artifact、日志、截图、trace、PR 或模型上下文。
- 发布要求必须从目标项目的 workflow、发布文档和 CI 事实中读取并转成 gate；autotest 不得绕过目标项目已有的签名、人工验收、回滚或环境要求。

## Current Baseline

- autotest 当前 HEAD 为 8d84fbd，本地与 origin/main 同步，工作树干净。
- autotest 当前阶段为 discover、implementation、verify、build、package、commit、push、merge、tag、publish、smoke。
- autotest 当前测试为 18/18 通过，npm run check 通过。
- CoworkAny 当前远端为 https://github.com/GiantClam/coworkany；当前 checkout 为 codex/add-workflow-ai-authoring-skill，发现版本为 0.1.18，工作树有大量未提交修改和未跟踪文件。
- CoworkAny 已有 pnpm scripts、desktop-release.yml、deployed-regression.yml、桌面 POC contract/lifecycle/preflight 脚本、Release 版本/资产/签名/公证校验脚本。
- 当前 CoworkAny 没有 autotest 项目配置；这应由通用 project-root 初始化流程生成，而不是由 CoworkAny 专用代码补齐。

## Files To Add or Modify

### autotest repository

- Modify: src/contracts.mjs — v2 project contract、lifecycle stages、methods、policy、environment 和 evidence references；保留 v1 读取兼容。
- Modify: src/discovery.mjs — runtime、package manager、scripts、workflows、repository、branch、clean state 和项目入口发现。
- Modify: src/method-runner.mjs — bounded execution、timeout、output redaction、artifact capture、workflow dispatch/wait 和 adapter routing。
- Modify: src/pipeline.mjs — resumable state machine 和 gate evaluation。
- Modify: src/release.mjs — PR checks gate、幂等 tag/release workflow handling 和 release verification。
- Create: src/artifacts.mjs — Delivery Case paths、JSON/YAML writing、SHA-256 evidence manifest 和 redacted handoff records。
- Create: src/policy.mjs — risk score、side-effect policy、allowlists 和 gate requirements。
- Create: src/github.mjs — GitHub CLI/API wrappers、workflow run polling 和 check/release lookup。
- Create: src/desktop.mjs — registered desktop-goal adapter boundary；禁止 arbitrary shell generation。
- Create: src/project-init.mjs — project-root discovery、通用 .autotest 文件生成/更新和变更预览。
- Create: src/agent-runner.mjs — 在目标项目允许路径内执行实现/修复任务并返回结构化 handoff。
- Create: templates/project.autotest.json、templates/environment-manifest.json、templates/github/autotest.yml。
- Modify: src/cli.mjs — init、doctor、resume、verify 和 Delivery Case output options。
- Modify: examples/project.autotest.json 和 README.md。
- Create: schemas/project.autotest.schema.json、schemas/delivery-case.schema.json、schemas/event.schema.json、schemas/evidence-manifest.schema.json。
- Create: test/artifacts.test.mjs、test/policy.test.mjs、test/github.test.mjs、test/desktop.test.mjs、test/pipeline-resume.test.mjs、test/contract-v2.test.mjs。

### Target project repository

- Create or update only inside the supplied project-root: .autotest/project.json、.autotest/environment-manifest.json、.autotest/cases/WORK_ITEM_ID/ and, when explicitly allowed, project scripts/tests/workflows required to expose discovered capabilities.
- The generated project config records discovered commands and paths; it must not embed a CoworkAny name, path or command.
- The first run must produce a diff preview and an allowlist before writing to the target project.
- A dirty target checkout is read-only until the user selects a target SHA/worktree and enables project writes.

## Task 1: Lock the Delivery Case and contract

**Files:** src/contracts.mjs、src/artifacts.mjs、schemas/project.autotest.schema.json、schemas/delivery-case.schema.json、schemas/event.schema.json、schemas/evidence-manifest.schema.json、test/contract-v2.test.mjs、test/artifacts.test.mjs。

**Interfaces:**

- normalizeProjectDefinition(raw, { projectRoot }) -> normalizedDefinition
- createDeliveryCase({ workItemId, project, repository, targetSha, branch, environment }) -> deliveryCase
- appendEvent(caseDir, event) -> eventRecord
- writeEvidenceManifest(caseDir, evidenceEntries) -> manifest result
- loadResumeState(caseDir) -> state result

- [ ] Accept schema versions 1 and 2 and normalize v1 into the v2 shape without changing existing v1 plan output.
- [ ] Add lifecycle identifiers: intake、triage、discover、clarification、requirement-review、research、spec、planning、implementation、review、verify、security、release-candidate、acceptance、release-approval、commit、push、merge、tag、publish、deploy、smoke、observe、iteration、closed。
- [ ] Model results as passed、failed、blocked、needs_human、planned、skipped。
- [ ] Require every case/event to include work_item_id、actor kind、stage、input/output artifact references、status、timestamps and failure reason when applicable.
- [ ] Hash evidence files and store only relative path、byte size、type and SHA-256 in the manifest.
- [ ] Test missing work item、invalid stage、duplicate event ID、invalid evidence path、secret-like redaction and resume from the last successful event.

Run: npm test -- --test-name-pattern='contract|artifact'

Expected: contract and artifact tests pass.

## Task 2: Discover any project and expose a generic method contract

**Files:** src/discovery.mjs、src/method-runner.mjs、src/policy.mjs、test/policy.test.mjs、test/method-runner-v2.test.mjs、test/discovery.test.mjs、test/method-runner.test.mjs。

**Interfaces:**

- discoverProject(root) -> discovery
- resolveMethodInvocation(method, discovery) -> invocation
- executeProjectMethod(method, context) -> methodResult
- evaluatePolicy({ stage, method, discovery, caseContext }) -> policyDecision

- [ ] Add gitSha、worktreeClean、defaultBranch、runtime versions、lockfile、package-manager executable、workflow dispatch inputs and release-like workflows to discovery.
- [ ] Detect standard project families without project names: package.json/pnpm/yarn/bun、Makefile、pyproject/pytest、Cargo、Go、Gradle/Maven and GitHub Actions.
- [ ] Keep candidates for diagnostics, then rank them by stage and evidence; allow the generated project config to select exact methods. Never treat every script containing test/deploy/release as a final gate.
- [ ] Add method fields id、kind、required、timeoutMs、envRefs、evidence、successCondition、allowedPaths、allowedApps and riskLevel.
- [ ] Make command methods fail closed unless executable and argument array are explicit; never invoke through a shell string.
- [ ] Add workflow dispatch/wait with run ID、URL、terminal conclusion、commit SHA and artifact names.
- [ ] Add desktop-goal adapter with registered goal ID and bounded policy; reject arbitrary shell、URL、path and app values.
- [ ] Allow an implementation method to call a configured agent runtime with a task artifact and project-root allowlist; the agent may create or modify target-project files and must return changed paths, commit/evidence references and test results.
- [ ] Test read-only、branch-write、PR、release、deploy and desktop policies, including timeout、action count、app allowlist and workspace allowlist failures.

Run: npm test -- --test-name-pattern='discovery|method|policy'

Expected: existing tests and new fail-closed policy tests pass.

## Task 3: Initialize, create or modify the target project safely

**Files:** src/project-init.mjs、src/agent-runner.mjs、src/cli.mjs、src/artifacts.mjs、src/policy.mjs、templates/project.autotest.json、templates/environment-manifest.json、templates/github/autotest.yml、test/project-init.test.mjs、test/agent-runner.test.mjs。

**Interfaces:**

- initializeProject({ projectRoot, write, allowProjectEdits }) -> initializationResult
- createProjectMethod({ projectRoot, stage, taskArtifact, policy }) -> methodResult
- updateProjectMethod({ projectRoot, methodId, patch, policy }) -> methodResult
- previewProjectChanges({ projectRoot, generatedFiles, allowedPaths }) -> changePreview

- [x] Add init --project-root "$PROJECT_ROOT" to discover capabilities and generate .autotest/project.json. Without --force it preserves an existing definition; the Harness plugin requires `write: true` before creating or refreshing it.
- [ ] Add --allow-project-edits as a separate opt-in. The default write scope is .autotest/; source/scripts/tests/workflows require an explicit path allowlist and a diff preview.
- [ ] When a required stage has no runnable method, create a generic project task artifact that tells the implementation agent to add the smallest project-owned entry point using the detected ecosystem. Re-run discovery after the change; do not add project-specific code to autotest.

### DeepSeek Harness plugin

- [x] Add `plugin/package.json`, `plugin/src/index.mjs`, and `plugin/cordis.patch.yml` as a standalone Cordis plugin.
- [x] Expose `autotest_project_discover`, `autotest_project_init`, `autotest_desktop_goal_register`, `autotest_project_plan`, and `autotest_project_run`; keep plan-only defaults and explicit write/execute switches.
- [x] Persist bounded desktop goals under `.autotest/cases/<case-id>/desktop-goals.json`; defer actual JEV invocation to the Agent.
- [x] Install the local plugin into the Harness profile and validate tool registration with a real keyless Harness boot. Registration passed; model execution remains blocked until `DEEPSEEK_API_KEY` is configured.
- [x] Validate the plugin against CoworkAny in an isolated worktree; `init → plan → run --execute` reached the implementation gate without touching the dirty checkout or any release action.
- [ ] Allow generic project changes for package scripts, Make targets, Python commands, Cargo commands and GitHub Actions templates. Unsupported ecosystems become a named blocked capability, not a silent skip.
- [ ] Persist every generated/modified file, reason, agent handoff, test result and approval in the Delivery Case.

## Task 4: Implement the resumable lifecycle and evidence gates

**Files:** src/pipeline.mjs、src/cli.mjs、src/artifacts.mjs、src/policy.mjs、test/pipeline-resume.test.mjs、test/pipeline.test.mjs。

**Interfaces:**

- createPipelinePlan(definition, discovery, caseContext) -> plan
- executePipeline(definition, discovery, options) -> runResult
- resumePipeline(caseDir, options) -> runResult
- evaluateStageGate(stage, context) -> gateResult

- [ ] Preserve plan as read-only.
- [ ] Add init to create case directory and baseline manifest；doctor to create environment evidence；run to execute from a clean checkpoint；resume to continue from the last successful event；verify to validate artifacts without side effects.
- [ ] Enforce security before release-candidate；acceptance and release-approval before publish/deploy；smoke after deploy/publish.
- [ ] Stop on target SHA drift、missing required evidence、manual_required stage or non-resumable prior result.
- [ ] Write a result after every stage and generate verification.json and release.md from the same event/evidence data.
- [ ] Add retry limits and classify failures as product、environment、dependency/provider、test-script、policy or human-required.
- [ ] Test stage ordering、blocking、resume without duplicate side effects、target SHA drift and missing evidence.

Run: npm test -- --test-name-pattern='pipeline'; npm run check

Expected: pipeline tests pass and the CLI check reports the expanded stage list.

## Task 5: Make GitHub merge, tag and release generic and idempotent

**Files:** src/release.mjs、src/github.mjs、test/github.test.mjs、test/release.test.mjs、README.md。

**Interfaces:**

- waitForWorkflowRun({ repository, runId, timeoutMs, pollMs, commandRunner }) -> workflowResult
- verifyChecks({ repository, ref, requiredChecks, commandRunner }) -> checksResult
- mergePullRequest(action, context) -> releaseResult
- createOrVerifyTag(action, context) -> releaseResult
- publishOrVerifyRelease(action, context) -> releaseResult

- [ ] Before merge, verify exactly one PR and all required CI checks for its head SHA；do not merge solely because a PR exists.
- [ ] After merge, fetch default branch and record merge commit SHA；tag that exact SHA.
- [ ] Make tag/release retry-safe；existing objects must match target SHA and metadata or fail closed.
- [ ] Add publish modes github-release、project-workflow、draft-await-human and manual.
- [ ] For project-workflow, dispatch the project workflow and wait for completion；do not rebuild or upload project artifacts in autotest.
- [ ] Verify release artifacts by project-provided verifier；do not infer success from gh exit status alone.
- [ ] Keep the existing large-upload recovery only for direct GitHub upload mode.
- [ ] Test missing checks、wrong SHA、duplicate tag、duplicate release、workflow timeout、draft release and client-side timeout recovery.

Run: npm test -- --test-name-pattern='release|github'

Expected: release tests pass and every mutating release path has an explicit mode.

## Task 6: Integrate bounded Agent Desktop + JEV and deterministic Playwright evidence

**Files:** src/desktop.mjs、src/method-runner.mjs、test/desktop.test.mjs、docs/desktop-adapter.md、README.md。

**Interfaces:**

- registerDesktopAdapter(name, adapter) -> void
- runDesktopGoal({ adapter, goalId, workspace, allowedApps, allowedWindows, maxActions, timeoutMs }) -> operationReceipt
- verifyDesktopReceipt(receipt, verifier) -> verificationResult

- [ ] Define inspect-only、bounded-operation and human-assisted modes.
- [ ] Require registered goal ID、workspace/app/window allowlists、maximum action count、timeout、success probe and independent verifier.
- [ ] Pass only a secret reference to JEV/TypeSafe through the environment；never serialize the key.
- [ ] Treat JEV output as an operation receipt；business success requires a separate process/port/health/UI/API verifier.
- [ ] Stop on unknown dialog、permission prompt、MFA/CAPTCHA、production account、delete/payment/deploy/secret operation、action limit、timeout or repeated failure.
- [ ] Require Playwright methods to save stable locator assertions and trace/screenshot/video/JUnit paths；classify product/environment/test-script failures.
- [ ] Test with a fake adapter；never call the real JEV API from unit tests.

Run: npm test -- --test-name-pattern='desktop'

Expected: desktop policy tests pass without a real key or desktop session.

## Task 7: Run generic onboarding against a real project path

**Files:** target project .autotest/project.json、.autotest/environment-manifest.json、.autotest/cases/WI-2026-1115-coworkany-release/；generic fixtures under test/fixtures/projects/。

**Interfaces:**

- The generated config references discovered project methods/workflows by ID and path, without a project-specific adapter.
- autotest doctor --project-root "$PROJECT_ROOT" --json returns runtime、repo、branch、lockfile、local service、browser and desktop facts without secret values.
- autotest verify --project-root "$PROJECT_ROOT" --release "$RELEASE_REFERENCE" returns passed、blocked or failed、verified commit、release mode、asset names、SHA256 and missing gates.

- [ ] Create the project config only through autotest init --project-root "$PROJECT_ROOT"; do not write a project-specific adapter into autotest.
- [ ] Start from a clean worktree based on a fixed target SHA for any mutating rehearsal. A dirty checkout is allowed for discovery and plan only.
- [ ] Run init without write and inspect the proposed capability map, selected methods, generated files and allowed paths.
- [ ] Run init with write only after approval; create/update .autotest files and, when explicitly allowed, add the smallest missing project-owned scripts/tests/workflow.
- [ ] Re-run discovery after every project modification and require the new method to return machine-readable evidence.
- [ ] Exercise Node package scripts, Python pyproject and Rust Cargo fixture projects; add CoworkAny as a real repository path test, not as a code branch.
- [ ] Assert that autotest source contains no CoworkAny name/path/command and that all target-project changes are visible in the target diff.

Run:

node /Users/beihuang/Documents/github/autotest/src/cli.mjs discover /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115 --output /tmp/coworkany-discovery.json

node /Users/beihuang/Documents/github/autotest/src/cli.mjs init --project-root /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115 --output /tmp/coworkany-init-plan.json

node /Users/beihuang/Documents/github/autotest/src/cli.mjs plan --project-root /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115 --config /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115/.autotest/project.json --output /tmp/coworkany-plan.json

Expected: discovery identifies the project ecosystem and workflows；init proposes generic files and methods；plan is planned、explicit and side-effect free.

## Task 8: Execute the generic closed-loop rehearsal on CoworkAny

**Files in the target project case:** .autotest/cases/WI-2026-1115-coworkany-release/request.md、clarification.md、spec.md、tasks.md、verification.json、release.md、observe.md；any project files explicitly authorized by the generated change allowlist。

- [ ] Freeze scope and acceptance criteria；if release mode、target platform、signing/notarization、staging URL、test account or rollback behavior is unresolved，通过 grill-me 形成问题清单并在正确 gate 阻塞。
- [ ] Run environment doctor and local deterministic checks.
- [ ] Run the generated project methods and collect logs、traces、screenshots、videos and JUnit only where those methods produce them.
- [ ] Run independent review/security checks and classify every failure.
- [ ] Create/refresh PR，wait for required GitHub checks，record PR URL、head SHA and conclusions.
- [ ] Merge only after checks pass；record merge commit SHA.
- [ ] Create tag on merged default-branch SHA；record tag target.
- [ ] Dispatch or observe the discovered project release workflow，wait for all jobs，verify release metadata and artifacts through the generic release verifier.
- [ ] Run Agent Desktop/JEV only for registered desktop goals；use Playwright/API/CI for deterministic assertions.
- [ ] Stop at G5 if the target project’s clean-machine acceptance、signing、notarization、production credentials or rollback rehearsal is incomplete.
- [ ] If policy approves publication, publish the verified release and verify public URL、checksums and release-manifest.
- [ ] Run post-release smoke against the exact released/deployed version；write observe metrics and any factory-improvement item.
- [ ] Report separately: local tests、CI、push、merge、tag、draft/public release、deployment、smoke and observation.

Run:

node /Users/beihuang/Documents/github/autotest/src/cli.mjs run --project-root /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115 --config /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115/.autotest/project.json --execute --output /tmp/coworkany-run.json

node /Users/beihuang/Documents/github/autotest/src/cli.mjs verify --case /Users/beihuang/Documents/github/coworkany-factory-WI-2026-1115/.autotest/cases/WI-2026-1115-coworkany-release

Expected: every completed stage has deterministic evidence；incomplete external gates remain blocked with a named reason.

## Task 9: Add factory meta-tests and CI quality gates

**Files:** test/meta/pipeline-recovery.test.mjs、test/meta/policy-bypass.test.mjs、test/meta/evidence-integrity.test.mjs、.github/workflows/test.yml、package.json、README.md。

- [ ] Test interrupted runs、duplicate retries、missing evidence、target SHA drift、unauthorized desktop actions、direct publish before approval and release artifact mismatch.
- [ ] Add fixture projects for Node、Python and Rust with package/build/test methods, one workflow method, one desktop-goal method and one failing verifier.
- [ ] Assert that dry-run never calls Git、GitHub、deployment or JEV side effects.
- [ ] Assert that redaction removes API key/token/password-like values from stdout、stderr and artifacts.
- [ ] Add CI for npm ci、npm test、npm run check、schema validation and fixture plan.
- [ ] Require meta-tests before a release action is allowed.

Run: npm ci; npm test; npm run check

Expected: CI and local meta-tests pass without external secrets or a real desktop session.

## Acceptance Criteria

- A project can be discovered and planned without copying its commands.
- A Delivery Case can be initialized、resumed and independently verified.
- Required stages cannot be skipped by an Agent’s natural-language claim.
- Every mutating operation is policy-checked、bounded and recorded.
- PR merge waits for required checks and tags the verified merged SHA.
- Project workflows own build/package/deploy semantics and return machine-readable evidence.
- Any target project’s release workflow、artifact manifest、checksums and human release policy are respected；CoworkAny is only one validation sample.
- Agent Desktop/JEV actions are registered、bounded、independently verified and resumable.
- Playwright/browser evidence is deterministic and linked to the case.
- Final reporting distinguishes local tests、CI、push、merge、tag、draft/public release、deployment、smoke and observation.

## Self-review against the attachment

- Sections 7–9: lifecycle、gates、policy and release-candidate tasks.
- Sections 8、23–24: case artifacts、event log、handoff/evidence and resumability.
- Sections 26–27: deterministic test layers、Playwright evidence and failure classification.
- Sections 28–31: meta-tests、failure recovery and factory-improvement output.
- Sections 37–41: environment doctor、Agent Desktop/JEV boundaries、bounded goals、independent verification and macOS-first acceptance.
- Remaining external decisions intentionally remain blocking per target project: release mode、target environment/URL、signing/notarization credentials、rollback rehearsal and exact native desktop acceptance path.
