// Shared Claude client + call helper. Reads ANTHROPIC_API_KEY from .env.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

export const MODEL = "claude-opus-5-5";
export const client = new Anthropic();

// One structured-output call. Server-side fallback reroutes if a safety classifier declines.
export async function askJSON({ system, content, schema, effort = "low", max_tokens = 4000 }) {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens,
    system,
    messages: [{ role: "user", content }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (res.stop_reason === "refusal") throw new Error(`refused: ${res.stop_details?.category ?? "unknown"}`);
  if (!res.parsed_output) throw new Error(`no parsed output (stop_reason=${res.stop_reason})`);
  return res.parsed_output;
}
