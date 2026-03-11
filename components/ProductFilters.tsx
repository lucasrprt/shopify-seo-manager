"use client";

import type { FilterState, EnrichedProduct } from "@/types";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  products: EnrichedProduct[];
}

export function ProductFilters({ filters, onChange, products }: ProductFiltersProps) {
  const vendors = [...new Set(products.map((p) => p.shopify.vendor).filter(Boolean))].sort();
  const types = [...new Set(products.map((p) => p.shopify.product_type).filter(Boolean))].sort();

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const hasActiveFilters =
    filters.search ||
    filters.missingType !== "all" ||
    filters.vendor ||
    filters.productType ||
    filters.status !== "all" ||
    filters.healthMin > 0 ||
    filters.healthMax < 100;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un produit..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {filters.search && (
          <button
            onClick={() => set("search", "")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        {/* Missing type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Champs manquants</label>
          <div className="flex gap-1">
            {(["all", "seo", "google", "both"] as const).map((v) => (
              <button
                key={v}
                onClick={() => set("missingType", v)}
                className={cn(
                  "px-3 py-1 text-xs rounded-full border transition-colors",
                  filters.missingType === v
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                )}
              >
                {v === "all" ? "Tous" : v === "seo" ? "SEO" : v === "google" ? "Google" : "Les deux"}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Statut</label>
          <select
            value={filters.status}
            onChange={(e) => set("status", e.target.value as FilterState["status"])}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="all">Tous</option>
            <option value="active">Actif</option>
            <option value="draft">Brouillon</option>
            <option value="archived">Archivé</option>
          </select>
        </div>

        {/* Vendor */}
        {vendors.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Marque</label>
            <select
              value={filters.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Toutes</option>
              {vendors.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Product type */}
        {types.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
            <select
              value={filters.productType}
              onChange={(e) => set("productType", e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Tous</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Health score range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Score santé: {filters.healthMin}–{filters.healthMax}%
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={filters.healthMin}
              onChange={(e) => set("healthMin", Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-gray-400">à</span>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.healthMax}
              onChange={(e) => set("healthMax", Number(e.target.value))}
              className="w-20"
            />
          </div>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() =>
              onChange({
                search: "",
                healthMin: 0,
                healthMax: 100,
                missingType: "all",
                vendor: "",
                productType: "",
                status: "all",
              })
            }
            className="self-end flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1 rounded-full hover:bg-red-50 transition-colors"
          >
            <X className="w-3 h-3" /> Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}
