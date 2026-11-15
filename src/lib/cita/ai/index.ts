import "server-only";
import { AnthropicProvider } from "./anthropic";
import { TestProvider } from "./test-provider";
import type { AiProvider } from "./types";

let cached: AiProvider | null = null;

/** CITA_AI_PROVIDER=anthropic → Claude; aksi hâlde açıkça işaretli test sağlayıcısı. */
export function aiProvider(): AiProvider {
  if (cached) return cached;
  cached = process.env.CITA_AI_PROVIDER === "anthropic" ? new AnthropicProvider() : new TestProvider();
  return cached;
}

export { AiUnavailableError } from "./anthropic";
export type { AiProvider, StudentContext, Image, WebResult } from "./types";
