import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CollectionTableColumn {
  label: string;
  ariaLabel?: string;
}

interface CollectionTableProps {
  label: string;
  columns: CollectionTableColumn[];
  actionColumn?: "standard" | "compact";
  children: ReactNode;
}

interface CollectionTableRowProps {
  labelledBy: string;
  children: ReactNode;
}

interface CollectionTableRecordProps {
  labelledBy: string;
  children: ReactNode;
}

interface CollectionTableDetailRowProps {
  labelledBy: string;
  children: ReactNode;
}

interface CollectionTableCellProps {
  label?: string;
  mobileFullWidth?: boolean;
  ariaColSpan?: number;
  ariaLabelledBy?: string;
  className?: string;
  children: ReactNode;
}

export function CollectionTable({ label, columns, actionColumn = "standard", children }: CollectionTableProps) {
  return (
    <div
      className={cn("carbon-data-table", actionColumn === "compact" && "carbon-data-table--compact-actions")}
      role="table"
      aria-label={label}
    >
      <div className="carbon-data-table-header" role="rowgroup">
        <div className="carbon-data-table-header-row" role="row">
          {columns.map((column) => (
            <span key={column.label} role="columnheader" aria-label={column.ariaLabel}>
              {column.label}
            </span>
          ))}
        </div>
      </div>
      <div className="carbon-data-table-rows">{children}</div>
    </div>
  );
}

export function CollectionTableRecord({ labelledBy, children }: CollectionTableRecordProps) {
  return (
    <div role="rowgroup" aria-labelledby={labelledBy} className="carbon-data-table-record">
      {children}
    </div>
  );
}

export function CollectionTableRow({ labelledBy, children }: CollectionTableRowProps) {
  return (
    <article role="row" aria-labelledby={labelledBy} className="carbon-data-table-row">
      {children}
    </article>
  );
}

export function CollectionTableDetailRow({ labelledBy, children }: CollectionTableDetailRowProps) {
  return (
    <div role="row" aria-labelledby={labelledBy} className="carbon-data-table-detail-row">
      <div role="cell" aria-colspan={5} className="carbon-data-table-detail-cell">
        {children}
      </div>
    </div>
  );
}

export function CollectionTableCell({
  label,
  mobileFullWidth = false,
  ariaColSpan,
  ariaLabelledBy,
  className,
  children,
}: CollectionTableCellProps) {
  return (
    <div
      role="cell"
      aria-colspan={ariaColSpan}
      aria-labelledby={ariaLabelledBy}
      className={cn("carbon-data-table-cell", mobileFullWidth && "carbon-data-table-cell-mobile-wide", className)}
    >
      {label && <span className="carbon-data-table-mobile-label">{label}</span>}
      {children}
    </div>
  );
}
