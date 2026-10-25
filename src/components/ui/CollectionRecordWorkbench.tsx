import type { ReactNode } from "react";

interface CollectionRecordWorkbenchProps {
  id: string;
  labelledBy: string;
  eyebrow: string;
  title: string;
  record: ReactNode;
  contextLabel: string;
  children: ReactNode;
  context: ReactNode;
}

export function CollectionRecordWorkbench({
  id,
  labelledBy,
  eyebrow,
  title,
  record,
  contextLabel,
  children,
  context,
}: CollectionRecordWorkbenchProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="carbon-record-workbench">
      <header className="carbon-record-workbench-header">
        <div className="min-w-0">
          <p className="carbon-label">{eyebrow}</p>
          <h3 id={labelledBy} className="mt-1 text-lg font-semibold" tabIndex={-1}>
            {title}
          </h3>
          <p className="carbon-record-workbench-identity text-xs">{record}</p>
        </div>
      </header>
      <div className="carbon-record-workbench-grid">
        <div className="carbon-record-workbench-form">{children}</div>
        <aside aria-label={contextLabel} className="carbon-record-workbench-context">
          {context}
        </aside>
      </div>
    </section>
  );
}
