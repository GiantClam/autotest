export async function runPlaywrightMethod({ runner, assertions = [], evidence = [] } = {}) {
  if (typeof runner !== "function") return { status: "blocked", classification: "human-required", reason: "playwright_runner_required" };
  try {
    const result = await runner({ assertions, evidence });
    if (!result || result.passed !== true) {
      return { status: "failed", classification: result?.classification ?? "product", reason: result?.reason ?? "playwright_assertion_failed", evidence: result?.evidence ?? evidence };
    }
    return { status: "passed", assertions, evidence: result.evidence ?? evidence, junit: result.junit ?? null, trace: result.trace ?? null, screenshot: result.screenshot ?? null, video: result.video ?? null };
  } catch (error) {
    return { status: "failed", classification: "test-script", reason: error instanceof Error ? error.message : String(error), evidence };
  }
}
