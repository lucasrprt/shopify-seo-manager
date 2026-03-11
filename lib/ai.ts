import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { EnrichedProduct, GeneratedContent, AIModel } from "@/types";
import {
  SYSTEM_PROMPT,
  buildFullGenerationPrompt,
  buildSeoOnlyPrompt,
  buildGoogleOnlyPrompt,
} from "./prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type GenerationMode = "full" | "seo" | "google";

function getPrompt(product: EnrichedProduct, mode: GenerationMode): string {
  switch (mode) {
    case "seo":
      return buildSeoOnlyPrompt(product);
    case "google":
      return buildGoogleOnlyPrompt(product);
    default:
      return buildFullGenerationPrompt(product);
  }
}

function parseJsonResponse(raw: string): Partial<GeneratedContent> {
  // Extract JSON block if wrapped in markdown code fences
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = match ? match[1] : raw;

  try {
    return JSON.parse(jsonStr.trim()) as Partial<GeneratedContent>;
  } catch {
    // Try to find the first { ... } block
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]) as Partial<GeneratedContent>;
    }
    throw new Error("Impossible de parser la réponse JSON du modèle AI");
  }
}

export async function generateWithClaude(
  product: EnrichedProduct,
  mode: GenerationMode = "full"
): Promise<Partial<GeneratedContent>> {
  const prompt = getPrompt(product, mode);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return parseJsonResponse(text);
}

export async function generateWithOpenAI(
  product: EnrichedProduct,
  mode: GenerationMode = "full"
): Promise<Partial<GeneratedContent>> {
  const prompt = getPrompt(product, mode);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  return parseJsonResponse(text);
}

export async function generateContent(
  product: EnrichedProduct,
  model: AIModel,
  mode: GenerationMode = "full"
): Promise<Partial<GeneratedContent>> {
  if (model === "claude") {
    return generateWithClaude(product, mode);
  }
  return generateWithOpenAI(product, mode);
}
