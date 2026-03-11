import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/ai";
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

    return NextResponse.json({ generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
