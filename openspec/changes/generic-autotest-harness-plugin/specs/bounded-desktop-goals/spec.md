## Purpose

This capability defines a portable, bounded desktop-goal record that lets an agent request a specific desktop objective while limiting applications, windows, actions, duration, and required evidence before any JEV operation is attempted.

## ADDED Requirements

### Requirement: Desktop goals are explicit and bounded

The system SHALL require a safe case identifier, goal identifier, purpose, action limit, timeout, and evidence requirements for every registered desktop goal. Applications and windows SHALL be represented as explicit allowlists.

#### Scenario: Register a valid desktop goal
- **WHEN** an agent supplies a valid case, goal, purpose, application/window allowlists, action limit, timeout, and evidence list
- **THEN** the system returns a bounded goal record with an `agent-jv` executor designation and a policy stating that JEV must stay within the registered bounds

#### Scenario: Register an unsafe identifier or limit
- **WHEN** a case/goal identifier contains path traversal or a limit is outside its allowed range
- **THEN** registration fails before writing any file

### Requirement: Desktop goal registration is planable and idempotent

The system SHALL support a read-only registration preview and SHALL persist an authorized registration at `.autotest/cases/<case-id>/desktop-goals.json`. Re-registering an identical goal SHALL be idempotent; changing an existing goal SHALL return an explicit update result.

#### Scenario: Preview a desktop goal
- **WHEN** an agent registers a goal without `write: true`
- **THEN** the system returns `planned` and does not create the goal file

#### Scenario: Persist and repeat a desktop goal
- **WHEN** an agent registers a goal with `write: true` and repeats the same registration
- **THEN** the first call returns `created`, the second returns `exists`, and the persisted document contains one goal

### Requirement: The plugin does not treat JEV execution as business success

The system SHALL treat the registered goal as an execution boundary and SHALL require the Agent to obtain an operation receipt and independent evidence from the target application or verifier. The registration capability SHALL not claim that the desktop operation itself proves product success.

#### Scenario: JEV operation completes without application evidence
- **WHEN** JEV returns an operation receipt but the required screenshot, health check, UI assertion, or API probe is missing
- **THEN** the desktop stage remains incomplete or blocked

#### Scenario: Desktop operation encounters a protected condition
- **WHEN** the operation reaches an unknown dialog, MFA/CAPTCHA, payment, deletion, production deploy, secret operation, timeout, or action limit
- **THEN** the agent stops the operation and records a named human-required or blocked reason
