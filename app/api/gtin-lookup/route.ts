import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface UPCItem {
  ean: string;
  title: string;
  brand: string;
}

interface UPCResponse {
  code: string;
  total: number;
  items: UPCItem[];
}

const GTIN_PATTERN = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Paramètre q requis" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&match_mode=0&type=product`,
      {
        headers: { "Accept": "application/json" },
        // 8 second timeout
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 429) {
      return NextResponse.json({ error: "Limite de requêtes UPCItemDB atteinte (100/jour sur le plan gratuit)" }, { status: 429 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Erreur UPCItemDB: ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as UPCResponse;

    // Keep only items with a valid GTIN format
    const items = (data.items ?? [])
      .filter((item) => item.ean && GTIN_PATTERN.test(item.ean.replace(/\D/g, "")))
      .map((item) => ({
        ean: item.ean.replace(/\D/g, ""),
        title: item.title ?? "",
        brand: item.brand ?? "",
      }));

    return NextResponse.json({ items, total: data.total ?? 0 });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Timeout — UPCItemDB ne répond pas" }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
