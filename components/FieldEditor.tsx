"use client";

import { cn } from "@/lib/utils";

interface FieldEditorProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  multiline?: boolean;
  rows?: number;
  error?: string;
  warning?: string;
  hint?: string;
  className?: string;
}

export function FieldEditor({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  minLength,
  multiline = false,
  rows = 3,
  error,
  warning,
  hint,
  className,
}: FieldEditorProps) {
  const len = value?.length ?? 0;
  const isOverLimit = maxLength ? len > maxLength : false;
  const isUnderMin = minLength ? len < minLength && len > 0 : false;

  const borderClass = error || isOverLimit
    ? "border-red-400 focus:ring-red-300"
    : warning || isUnderMin
    ? "border-yellow-400 focus:ring-yellow-300"
    : "border-gray-300 focus:ring-blue-300";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {maxLength && (
          <span
            className={cn(
              "text-xs",
              isOverLimit ? "text-red-600 font-semibold" : len > maxLength * 0.9 ? "text-yellow-600" : "text-gray-400"
            )}
          >
            {len}/{maxLength}
          </span>
        )}
      </div>

      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors resize-y",
            borderClass
          )}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors",
            borderClass
          )}
        />
      )}

      {(error || warning || hint) && (
        <p
          className={cn(
            "text-xs",
            error || isOverLimit ? "text-red-600" : warning ? "text-yellow-600" : "text-gray-400"
          )}
        >
          {error || warning || hint}
        </p>
      )}
    </div>
  );
}
