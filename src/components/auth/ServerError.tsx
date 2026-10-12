import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="border-destructive/40 bg-error-surface text-error-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
