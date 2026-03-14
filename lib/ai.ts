import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { EnrichedProduct, GeneratedContent, AIModel } from "@/types";
import type { MetafieldDefinition } from "./shopify";
import {
  SYSTEM_PROMPT,
  buildFullGenerationPrompt,
  buildSeoOnlyPrompt,
  buildGoogleOnlyPrompt,
} from "./prompts";

// Lazy singletons — only instantiated at call time, not at module load (build phase)
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

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

  const message = await getAnthropic().messages.create({
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

  const completion = await getOpenAI().chat.completions.create({
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

// ─── Category metafield AI generation ─────────────────────────────────────────

export interface CategoryFieldValue {
  namespace: string;
  key: string;
  value: string;
}

export interface ProductSlimForCategory {
  title: string;
  vendor: string;
  productType: string;
  tags: string;
  options: Array<{ name: string; values: string[] }>;
  variantTitles: string[];
}

function buildCategoryPrompt(product: ProductSlimForCategory, defs: MetafieldDefinition[]): string {
  const defLines = defs
    .map((d) => {
      const choices = d.choices.length > 0 ? ` | Choix valides: ${d.choices.join(", ")}` : "";
      const listNote = d.typeName.startsWith("list.") ? ' (liste → sérialiser: ["val1","val2"])' : "";
      return `  "${d.namespace}:${d.key}" → ${d.name}${listNote}${choices}`;
    })
    .join("\n");

  const ctx = JSON.stringify(
    {
      titre: product.title,
      marque: product.vendor,
      type_produit: product.productType,
      tags: product.tags,
      options: product.options.map((o) => `${o.name}: ${o.values.join(", ")}`),
      variantes: product.variantTitles.slice(0, 8),
    },
    null,
    2
  );

  return `Remplis les champs métadonnées Catégorie Shopify de ce produit de mode.

## Données produit
${ctx}

## Champs vides à remplir
${defLines}

## Règles
- Retourne {"fields":[{"namespace":"...","key":"...","value":"..."},...]}
- Pour les types liste: value = tableau JSON sérialisé, ex: "[\\\"Cuir\\\",\\\"Textile\\\"]"
- Pour les champs avec "Choix valides": utilise EXACTEMENT l'une des valeurs listées
- N'inclus que les champs que tu peux inférer avec confiance depuis les données produit`;
}

function parseCategoryResponse(raw: string): CategoryFieldValue[] {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fence ? fence[1] : raw;
  try {
    const parsed = JSON.parse(jsonStr.trim()) as
      | { fields?: CategoryFieldValue[] }
      | CategoryFieldValue[];
    if (Array.isArray(parsed)) return parsed;
    if (parsed && "fields" in parsed && Array.isArray(parsed.fields)) return parsed.fields;
    return [];
  } catch {
    const arrMatch = jsonStr.match(/\[[\s\S]*?\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]) as CategoryFieldValue[]; } catch { /* ignore */ }
    }
    return [];
  }
}

export async function generateCategoryFieldValues(
  product: ProductSlimForCategory,
  defs: MetafieldDefinition[],
  model: AIModel
): Promise<CategoryFieldValue[]> {
  if (defs.length === 0) return [];
  const prompt = buildCategoryPrompt(product, defs);
  const systemMsg = "Expert e-commerce. Réponds uniquement avec un JSON valide.";

  if (model === "claude") {
    const msg = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return parseCategoryResponse(text);
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  return parseCategoryResponse(completion.choices[0]?.message?.content ?? "{}");
}
