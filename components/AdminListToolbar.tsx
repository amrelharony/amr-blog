"use client";

// Presentational toolbar for admin lists: search + optional status/sort selects
// + optional select-all and a bulk-action bar. All state/logic lives in the
// page (filtering via lib/admin-filter); this is pure UI.
interface Opt {
  value: string;
  label: string;
}

export default function AdminListToolbar({
  query,
  onQuery,
  placeholder = "Search…",
  status,
  onStatus,
  statusOptions,
  sort,
  onSort,
  sortOptions,
  selectable = false,
  allSelected = false,
  onToggleAll,
  selectedCount = 0,
  onBulkDelete,
  bulkDeleteLabel = "Delete",
  onBulkExport,
  bulkExportLabel = "Export CSV",
  onClearSelection,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder?: string;
  status?: string;
  onStatus?: (v: string) => void;
  statusOptions?: Opt[];
  sort?: string;
  onSort?: (v: string) => void;
  sortOptions?: Opt[];
  selectable?: boolean;
  allSelected?: boolean;
  onToggleAll?: () => void;
  selectedCount?: number;
  onBulkDelete?: () => void;
  bulkDeleteLabel?: string;
  onBulkExport?: () => void;
  bulkExportLabel?: string;
  onClearSelection?: () => void;
}) {
  return (
    <>
      <div className="adm-toolbar">
        {selectable && (
          <label className="adm-check" title="Select all (filtered)">
            <input type="checkbox" className="adm-rowcheck" checked={allSelected} onChange={onToggleAll} />
            All
          </label>
        )}
        <input
          className="adm-input adm-toolbar-search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
        />
        {statusOptions && onStatus && (
          <select
            className="adm-select adm-toolbar-select"
            value={status}
            onChange={(e) => onStatus(e.target.value)}
            aria-label="Filter by status"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {sortOptions && onSort && (
          <select
            className="adm-select adm-toolbar-select"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            aria-label="Sort"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {selectedCount > 0 && (
        <div className="adm-bulkbar" role="region" aria-label="Bulk actions">
          <span>{selectedCount} selected</span>
          {onBulkExport && (
            <button className="adm-btn" onClick={onBulkExport}>
              {bulkExportLabel}
            </button>
          )}
          {onBulkDelete && (
            <button className="adm-btn danger" onClick={onBulkDelete}>
              {bulkDeleteLabel}
            </button>
          )}
          {onClearSelection && (
            <button className="adm-btn" onClick={onClearSelection}>
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );
}
