const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

function redact(value) {
  return String(value).replace(/apikey_[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]").replace(/(token|secret|password|key)=([^\s&]+)/giu, "$1=[REDACTED]");
}

export function createJevClient({ apiKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY, endpoint = DEFAULT_ENDPOINT, model = "jev-latest", fetchImpl = fetch } = {}) {
  return {
    async evaluate({ state, questions, signal } = {}) {
      if (!apiKey) return { status: "blocked", classification: "dependency/provider", reason: "jev_api_key_missing" };
      if (state === undefined || !questions || typeof questions !== "object") return { status: "failed", classification: "test-script", reason: "jev_request_invalid" };
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, state, questions }),
          signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) return { status: "failed", classification: "dependency/provider", reason: `jev_http_${response.status}`, detail: redact(body?.detail ?? body?.error ?? "provider_request_failed") };
        return { status: "passed", model: body?.model ?? model, answers: body?.answers ?? {}, usage: body?.usage ?? null };
      } catch (error) {
        return { status: "failed", classification: "dependency/provider", reason: redact(error instanceof Error ? error.message : String(error)) };
      }
    },
  };
}
