"use client";

import { useState } from "react";
import type { EnrichedProduct, AIModel } from "@/types";
import { Zap, Upload, X, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionBarProps {
  selected: number[];
  products: EnrichedProduct[];
  onClear: () => void;
  model: AIModel;
  onModelChange: (m: AIModel) => void;
  onBulkGenerate: (ids: number[], mode: "full" | "seo" | "google") => Promise<void>;
  onBulkSync: (ids: number[]) => Promise<void>;
}

export function BulkActionBar({
  selected,
  products: _products,
  onClear,
  model,
  onModelChange,
  onBulkGenerate,
  onBulkSync,
}: BulkActionBarProps) {
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mode, setMode] = useState<"full" | "seo" | "google">("full");
  const [modeOpen, setModeOpen] = useState(false);

  if (selected.length === 0) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onBulkGenerate(selected, mode);
    } finally {
      setGenerating(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onBulkSync(selected);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateAndSync = async () => {
    setGenerating(true);
    try {
      await onBulkGenerate(selected, mode);
    } finally {
      setGenerating(false);
    }
    setSyncing(true);
    try {
      await onBulkSync(selected);
    } finally {
      setSyncing(false);
    }
  };

  const modeLabels = { full: "Tout générer", seo: "SEO seulement", google: "Google seulement" };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
      <span className="text-sm font-medium">
        {selected.length} produit{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}
      </span>

      <div className="w-px h-5 bg-gray-600" />

      {/* Model toggle */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
        {(["claude", "openai"] as AIModel[]).map((m) => (
          <button
            key={m}
            onClick={() => onModelChange(m)}
            className={cn(
              "px-2 py-1 text-xs rounded-md transition-colors",
              model === m ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            )}
          >
            {m === "claude" ? "Claude" : "GPT-4o"}
          </button>
        ))}
      </div>

      {/* Mode selector */}
      <div className="relative">
        <button
          onClick={() => setModeOpen(!modeOpen)}
          className="flex items-center gap-1 text-xs bg-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
        >
          {modeLabels[mode]}
          <ChevronDown className="w-3 h-3" />
        </button>
        {modeOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden min-w-[160px]">
            {(Object.entries(modeLabels) as [typeof mode, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setMode(k); setModeOpen(false); }}
                className={cn(
                  "w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition-colors",
                  mode === k ? "text-blue-400" : "text-gray-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Generate + Sync (primary) */}
      <button
        onClick={handleGenerateAndSync}
        disabled={generating || syncing}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors font-medium"
      >
        {generating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Génération...</>
        ) : syncing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Sync Shopify...</>
        ) : (
          <><Zap className="w-4 h-4" /> Générer & Sync</>
        )}
      </button>

      {/* Generate only */}
      <button
        onClick={handleGenerate}
        disabled={generating || syncing}
        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
        title="Générer sans synchroniser"
      >
        <Zap className="w-3.5 h-3.5" />
        Générer
      </button>

      {/* Sync only */}
      <button
        onClick={handleSync}
        disabled={generating || syncing}
        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
        title="Synchroniser sans générer"
      >
        <Upload className="w-3.5 h-3.5" />
        Sync
      </button>

      <button
        onClick={onClear}
        className="text-gray-400 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
