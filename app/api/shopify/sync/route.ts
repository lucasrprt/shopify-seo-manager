import { NextRequest, NextResponse } from "next/server";
import { syncProductToShopify, syncMultipleProducts } from "@/lib/shopify";
import type { SyncPayload } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { payload?: SyncPayload; payloads?: SyncPayload[] };

    // Bulk sync
    if (body.payloads && Array.isArray(body.payloads)) {
      const result = await syncMultipleProducts(body.payloads);
      return NextResponse.json(result);
    }

    // Single product sync
    if (body.payload) {
      await syncProductToShopify(body.payload);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Payload manquant" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
