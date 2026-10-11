import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type FormFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "autoFocus" | "id" | "label" | "onChange" | "value"
> & {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function FormField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  className,
  inputRef,
  ...inputProps
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-foreground block text-sm font-medium">
        {label}
      </label>
      <input
        {...inputProps}
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-h-11 w-full min-w-0 rounded-md border px-3 py-2 shadow-xs transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-destructive" : "border-input",
          className,
        )}
      />
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive flex items-start gap-1.5 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
