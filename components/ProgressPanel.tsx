"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressItem {
  id: number;
  name: string;
  status: "pending" | "active" | "done" | "error";
  step: string;
}

interface ProgressPanelProps {
  visible: boolean;
  operation: string;
  items: ProgressItem[];
  onClose: () => void;
}

export function ProgressPanel({ visible, operation, items, onClose }: ProgressPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const done = items.filter((i) => i.status === "done" || i.status === "error").length;
  const errors = items.filter((i) => i.status === "error").length;
  const total = items.length;
  const allDone = total > 0 && done === total;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  // Auto-scroll the active row into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [items]);

  // Auto-dismiss 5 s after all products are processed
  useEffect(() => {
    if (!allDone) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [allDone, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-20 z-[60] w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <div>
          <p className="text-white text-sm font-semibold leading-tight">{operation}</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {allDone
              ? `${done - errors} succès · ${errors} échec${errors !== 1 ? "s" : ""}`
              : `${done} / ${total} traité${done !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors mt-0.5 ml-2 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-700 shrink-0">
        <div
          className={cn(
            "h-full transition-all duration-300",
            allDone && errors === 0 ? "bg-green-500" : allDone ? "bg-yellow-500" : "bg-blue-500"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Product list */}
      <div ref={listRef} className="overflow-y-auto max-h-64 py-1">
        {items.map((item) => (
          <div
            key={item.id}
            data-active={item.status === "active" ? "true" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-2 transition-colors",
              item.status === "active" && "bg-gray-800/80"
            )}
          >
            <div className="shrink-0">
              {item.status === "pending" && <Clock className="w-3.5 h-3.5 text-gray-500" />}
              {item.status === "active" && (
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              )}
              {item.status === "error" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate leading-tight">
                {item.name}
              </p>
              <p
                className={cn(
                  "text-xs truncate mt-0.5 leading-tight",
                  item.status === "error"
                    ? "text-red-400"
                    : item.status === "done"
                    ? "text-green-400"
                    : item.status === "active"
                    ? "text-blue-400"
                    : "text-gray-500"
                )}
              >
                {item.step}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer when all done */}
      {allDone && (
        <div
          className={cn(
            "px-4 py-2 text-xs text-center border-t border-gray-700 shrink-0",
            errors === 0 ? "text-green-400" : "text-yellow-400"
          )}
        >
          {errors === 0
            ? "✓ Tous les produits ont été traités"
            : `${errors} produit${errors !== 1 ? "s" : ""} en erreur`}
          {" · Fermeture dans 5 s"}
        </div>
      )}
    </div>
  );
}
