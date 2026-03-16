import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai";
import { detectAgeGroup } from "@/lib/prompts";
import type { EnrichedProduct, AIModel } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      product: EnrichedProduct;
      model: AIModel;
      mode?: "full" | "seo" | "google";
    };

    if (!body.product) {
      return NextResponse.json({ error: "Données produit manquantes" }, { status: 400 });
    }

    const model: AIModel = body.model ?? "claude";
    const mode = body.mode ?? "full";

    const generated = await generateContent(body.product, model, mode);

    // Guarantee age_group is always correct — AI may miss it on kids products
    if (mode !== "seo") {
      const detectedAgeGroup = detectAgeGroup(body.product.shopify.tags ?? "");
      if (!generated.googleAgeGroup || generated.googleAgeGroup === "") {
        generated.googleAgeGroup = detectedAgeGroup;
      }
      // Override AI if it said "adult" but tags clearly say kids
      if (detectedAgeGroup === "kids") {
        generated.googleAgeGroup = "kids";
      }
    }

    return NextResponse.json({ generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
