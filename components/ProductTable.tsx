"use client";

import { useState } from "react";
import Link from "next/link";
import type { EnrichedProduct, FilterState } from "@/types";
import { HealthBadge, ScoreGrid } from "./HealthBadge";
import { AlertCircle, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ProductTableProps {
  products: EnrichedProduct[];
  filters: FilterState;
  selected: number[];
  onSelectChange: (ids: number[]) => void;
  /** True while phase-2 metafield enrichment is still in progress */
  enriching?: boolean;
  /** Set of product IDs that have been fully enriched with metafields */
  enrichedIds?: Set<number>;
}

type SortKey = "title" | "score" | "seoScore" | "googleScore" | "vendor" | "updated";
type SortDir = "asc" | "desc";

function applyFilters(products: EnrichedProduct[], filters: FilterState): EnrichedProduct[] {
  return products.filter((p) => {
    const s = filters.search.toLowerCase();
    if (s && !p.shopify.title.toLowerCase().includes(s) && !p.shopify.vendor.toLowerCase().includes(s)) return false;
    if (filters.status !== "all" && p.shopify.status !== filters.status) return false;
    if (filters.vendor && p.shopify.vendor !== filters.vendor) return false;
    if (filters.productType && p.shopify.product_type !== filters.productType) return false;
    if (p.health.score < filters.healthMin || p.health.score > filters.healthMax) return false;
    if (filters.missingType === "seo" && p.health.seoScore >= 100) return false;
    if (filters.missingType === "google" && p.health.googleScore >= 100) return false;
    if (filters.missingType === "both" && (p.health.seoScore >= 100 || p.health.googleScore >= 100)) return false;
    return true;
  });
}

export function ProductTable({ products, filters, selected, onSelectChange, enriching, enrichedIds }: ProductTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "score", dir: "asc" });

  const filtered = applyFilters(products, filters);

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number, bv: string | number;
    switch (sort.key) {
      case "title": av = a.shopify.title; bv = b.shopify.title; break;
      case "vendor": av = a.shopify.vendor; bv = b.shopify.vendor; break;
      case "score": av = a.health.score; bv = b.health.score; break;
      case "seoScore": av = a.health.seoScore; bv = b.health.seoScore; break;
      case "googleScore": av = a.health.googleScore; bv = b.health.googleScore; break;
      case "updated": av = a.shopify.updated_at; bv = b.shopify.updated_at; break;
      default: av = 0; bv = 0;
    }
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const allIds = sorted.map((p) => p.shopify.id);
  const allSelected = allIds.every((id) => selected.includes(id)) && allIds.length > 0;

  const toggleAll = () => {
    if (allSelected) {
      onSelectChange(selected.filter((id) => !allIds.includes(id)));
    } else {
      onSelectChange([...new Set([...selected, ...allIds])]);
    }
  };

  const toggleOne = (id: number) => {
    if (selected.includes(id)) {
      onSelectChange(selected.filter((s) => s !== id));
    } else {
      onSelectChange([...selected, id]);
    }
  };

  const SortIcon = ({ key: k }: { key: SortKey }) =>
    sort.key === k ? (
      sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3 opacity-30" />
    );

  const Th = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => (
    <th
      className={cn("px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none", className)}
      onClick={() => toggleSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon key={sortKey} />
      </span>
    </th>
  );

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">Aucun produit trouvé</p>
        <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="pl-4 pr-2 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-14">
              Image
            </th>
            <Th label="Produit" sortKey="title" />
            <Th label="Marque" sortKey="vendor" className="hidden md:table-cell" />
            <Th label="Score" sortKey="score" />
            <Th label="SEO" sortKey="seoScore" className="hidden lg:table-cell" />
            <Th label="Google" sortKey="googleScore" className="hidden lg:table-cell" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Problèmes
            </th>
            <th className="px-4 py-3 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((product) => {
            const p = product.shopify;
            const isSelected = selected.includes(p.id);
            const img = p.images?.[0]?.src;

            return (
              <tr
                key={p.id}
                className={cn(
                  "hover:bg-gray-50 transition-colors",
                  isSelected && "bg-blue-50"
                )}
              >
                <td className="pl-4 pr-2 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(p.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3">
                  {img ? (
                    <Image
                      src={img}
                      alt={p.title}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
                      —
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 line-clamp-1">{p.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.product_type}</div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-600">{p.vendor}</td>
                <td className="px-4 py-3">
                  <HealthBadge score={product.health.score} showBar />
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <HealthBadge score={product.health.seoScore} size="sm" />
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <HealthBadge score={product.health.googleScore} size="sm" />
                </td>
                <td className="px-4 py-3">
                  {enriching && enrichedIds && !enrichedIds.has(product.shopify.id) ? (
                    <span className="text-xs text-gray-400 italic">Calcul en cours…</span>
                  ) : product.health.missingFields.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {product.health.missingFields.slice(0, 3).map((f) => (
                        <span
                          key={f}
                          className="text-xs bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5"
                        >
                          {f}
                        </span>
                      ))}
                      {product.health.missingFields.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{product.health.missingFields.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-green-600 font-medium">✓ Complet</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${p.id}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Éditer <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        {filtered.length} produit{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
        {filtered.length !== products.length && ` sur ${products.length}`}
        {selected.length > 0 && ` · ${selected.length} sélectionné${selected.length > 1 ? "s" : ""}`}
      </div>
    </div>
  );
}
