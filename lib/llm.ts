import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * Which model backs draft generation and website analysis.
 *
 * `anthropic` is the default. `openai` is kept for workspaces that already had
 * `OPENAI_API_KEY` configured. `none` means no key is present, in which case
 * every caller falls back to its deterministic template — the app stays fully
 * usable without an LLM key.
 */
export type LlmProvider = "anthropic" | "openai" | "none";

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export function activeProvider(): LlmProvider {
  const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "none") return "none";
  if (configured === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  if (configured === "openai") return process.env.OPENAI_API_KEY ? "openai" : "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export interface GenerateJsonOptions<T> {
  /** Validated on the way out, whichever provider produced the payload. */
  schema: z.ZodType<T>;
  /** System prompt. */
  instructions: string;
  /** User content. */
  input: string;
  maxTokens?: number;
}

/**
 * Ask the configured model for a JSON object matching `schema`.
 * Returns `null` when no provider is configured so callers can fall back to a
 * deterministic template instead of failing the request.
 */
export async function generateJson<T>(options: GenerateJsonOptions<T>): Promise<T | null> {
  const provider = activeProvider();
  if (provider === "none") return null;
  const maxTokens = options.maxTokens ?? 16_000;

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: options.instructions,
      messages: [{ role: "user", content: options.input }],
      output_config: { format: zodOutputFormat(options.schema) },
    });
    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to analyse this content. Review the source and try again.");
    }
    // parsed_output is null when the response could not be parsed.
    if (!response.parsed_output) return null;
    return options.schema.parse(response.parsed_output);
  }

  // Secondary provider. Plain JSON mode plus local validation, so no
  // Zod-to-JSON-Schema conversion is involved.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    store: false,
    max_output_tokens: maxTokens,
    instructions: `${options.instructions}\n\nReply with a single JSON object and no other text.`,
    input: options.input,
    text: { format: { type: "json_object" } },
  });
  const text = response.output_text?.trim();
  if (!text) return null;
  return options.schema.parse(JSON.parse(text));
}

/** Human-readable description of the active provider, surfaced in the UI. */
export function providerLabel(): string {
  switch (activeProvider()) {
    case "anthropic":
      return `Claude (${process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL})`;
    case "openai":
      return `OpenAI (${process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL})`;
    default:
      return "Templates only (no model key configured)";
  }
}
