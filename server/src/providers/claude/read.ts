import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import pLimit from "p-limit";
import type { z } from "zod";
import { getSettings } from "@/config";
import { describeError } from "@/shared";

/**
 * How Claude is asked to read provider names (titles TMDB does not know, live entries the reference
 * does not know): the names in requests of PER_REQUEST, a structured answer of `entries`, each tied to
 * the id it was asked for. What the names mean is the caller's (`titles.ts`, `channels.ts`).
 */

export const CLAUDE_MODEL = "claude-sonnet-5-5";
/** Names read in one request: enough to amortise the instructions, few enough to answer in a few seconds. */
const PER_REQUEST = 25;
/** Requests in flight at once: well under the rate limits of a new account. */
const CONCURRENCY = 2;
const TIMEOUT_MS = 120_000;

export function hasClaudeKey(s: { anthropic_api_key: string }): boolean {
  return Boolean(s.anthropic_api_key);
}

/**
 * The model's entries for these queries, one at most per id asked; a query it did not answer is missing
 * from the result. Null without a key. A request that fails is logged and its queries left out. The
 * first failure that says the service is unreachable stops the rest.
 */
export async function readNames<Q extends { id: number }, E extends { id: number }>(
  queries: Q[],
  system: string,
  answer: z.ZodType<{ entries: E[] }>,
  line: (q: Q) => string,
): Promise<E[] | null> {
  const s = await getSettings();
  if (!hasClaudeKey(s)) return null;
  const client = new Anthropic({ apiKey: s.anthropic_api_key, timeout: TIMEOUT_MS, maxRetries: 2 });
  const limit = pLimit(CONCURRENCY);
  const chunks: Q[][] = [];
  for (let i = 0; i < queries.length; i += PER_REQUEST) chunks.push(queries.slice(i, i + PER_REQUEST));
  const out: E[] = [];
  let halted: string | null = null;
  await Promise.all(
    chunks.map((chunk) =>
      limit(async () => {
        if (halted) return;
        try {
          out.push(...(await ask(client, chunk, system, answer, line)));
        } catch (e) {
          const m = describeError(e);
          console.error(`[claude] ${chunk.length} noms non lus : ${m}`);
          if (
            e instanceof Anthropic.APIConnectionError ||
            e instanceof Anthropic.AuthenticationError ||
            e instanceof Anthropic.RateLimitError
          )
            halted = m;
        }
      }),
    ),
  );
  if (halted) throw new Error(`Claude injoignable (${halted})`);
  return out;
}

async function ask<Q extends { id: number }, E extends { id: number }>(
  client: Anthropic,
  chunk: Q[],
  system: string,
  answer: z.ZodType<{ entries: E[] }>,
  line: (q: Q) => string,
): Promise<E[]> {
  const res = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    output_config: { effort: "medium", format: zodOutputFormat(answer) },
    messages: [{ role: "user", content: chunk.map(line).join("\n\n") }],
  });
  if (res.stop_reason === "refusal") {
    console.error(
      `[claude] ${chunk.length} noms refusés par le modèle${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`,
    );
    return [];
  }
  if (!res.parsed_output) {
    console.error(`[claude] réponse illisible pour ${chunk.length} noms (arrêt : ${res.stop_reason})`);
    return [];
  }
  const asked = new Set(chunk.map((q) => q.id));
  const seen = new Set<number>();
  // Only the ids asked, once each: the model's answer is data, not a key into the catalogue.
  return res.parsed_output.entries.filter((e) => {
    if (!asked.has(e.id) || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/** A text of the model, trimmed; null when empty. */
export const cleanText = (t: string | null) => (t?.trim() ? t.trim() : null);
