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

async function searchUPC(query: string): Promise<UPCItem[]> {
  const res = await fetch(
    `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&match_mode=0&type=product`,
    {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    }
  );

  // 404 = no results found (UPCItemDB non-standard behavior)
  if (res.status === 404) return [];

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  const data = await res.json() as UPCResponse;
  return data.items ?? [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Paramètre q requis" }, { status: 400 });
  }

  try {
    // Strategy 1: full query (brand + title)
    let raw = await searchUPC(query);

    // Strategy 2: if no results, try with first 4 words only (avoids noise like sizes/colors in title)
    if (raw.length === 0) {
      const shortQuery = query.split(" ").slice(0, 4).join(" ");
      if (shortQuery !== query) {
        raw = await searchUPC(shortQuery);
      }
    }

    // Keep only items with a valid GTIN
    const items = raw
      .filter((item) => item.ean && GTIN_PATTERN.test(item.ean.replace(/\D/g, "")))
      .map((item) => ({
        ean: item.ean.replace(/\D/g, ""),
        title: item.title ?? "",
        brand: item.brand ?? "",
      }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        return NextResponse.json({ error: "Timeout — UPCItemDB ne répond pas" }, { status: 504 });
      }
      if (error.message === "RATE_LIMIT") {
        return NextResponse.json({ error: "Limite de requêtes atteinte (100/jour sur le plan gratuit)" }, { status: 429 });
      }
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
