import { ArrowDown, ArrowUp, ChevronDown, Download, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { OPPORTUNITY_SOURCES, type OpportunityIndicator, type SiteOpportunityRow } from '../types';
import { StatusPill } from './StatusPill';

interface CustomerTableProps {
  title: string;
  rows: SiteOpportunityRow[];
  defaultOpen?: boolean;
  onExport?: () => void;
}

const sourceKeys = Object.keys(OPPORTUNITY_SOURCES) as Array<keyof typeof OPPORTUNITY_SOURCES>;

type SortColumn = 'site' | (typeof sourceKeys)[number] | 'tier';
type SortDirection = 'asc' | 'desc';

// yes (visible) before ignored before no (missing), so sorting a source
// column groups matching statuses together.
const INDICATOR_ORDER: Record<OpportunityIndicator, number> = {
  visible: 0,
  ignored: 1,
  missing: 2,
};

export function CustomerTable({ title, rows, defaultOpen = true, onExport }: CustomerTableProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection } | null>(null);

  const toggleSort = (column: SortColumn) => {
    setSort((current) => {
      if (current?.column === column) {
        return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }

      return { column, direction: 'asc' };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) {
      return rows;
    }

    const factor = sort.direction === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (sort.column === 'site') {
        return factor * a.siteName.localeCompare(b.siteName);
      }

      if (sort.column === 'tier') {
        return factor * a.entitlementTier.localeCompare(b.entitlementTier);
      }

      const indicatorDiff =
        INDICATOR_ORDER[a.indicators[sort.column]] - INDICATOR_ORDER[b.indicators[sort.column]];
      if (indicatorDiff !== 0) {
        return factor * indicatorDiff;
      }

      // Same status (e.g. both "visible"): most recent date first.
      const dateA = a.opportunityDates[sort.column];
      const dateB = b.opportunityDates[sort.column];
      return factor * (dateB > dateA ? 1 : dateB < dateA ? -1 : 0);
    });
  }, [rows, sort]);

  const sortIndicator = (column: SortColumn) => {
    if (sort?.column !== column) {
      return null;
    }

    return sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <section className="customer-section">
      <div className="customer-section__header">
        <button
          type="button"
          className="customer-section__toggle"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          <ChevronDown className={isOpen ? 'chevron chevron--open' : 'chevron'} size={18} />
          <span>{title}</span>
          <strong>{rows.length}</strong>
        </button>
        {onExport ? (
          <button
            type="button"
            className="customer-section__export"
            onClick={onExport}
            disabled={rows.length === 0}
          >
            <Download size={14} />
            Export CSV
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>
                  <button type="button" className="th-sort" onClick={() => toggleSort('site')}>
                    Site {sortIndicator('site')}
                  </button>
                </th>
                {sourceKeys.map((sourceKey) => (
                  <th key={sourceKey}>
                    <button type="button" className="th-sort" onClick={() => toggleSort(sourceKey)}>
                      {OPPORTUNITY_SOURCES[sourceKey].label} {sortIndicator(sourceKey)}
                    </button>
                  </th>
                ))}
                <th>
                  <button type="button" className="th-sort" onClick={() => toggleSort('tier')}>
                    Tier {sortIndicator('tier')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No sites in this group.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.siteId}>
                    <td>
                      <div className="site-cell">
                        <strong>{row.siteName}</strong>
                        <a href={row.baseURL} target="_blank" rel="noreferrer">
                          {row.baseURL}
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </div>
                    </td>
                    {sourceKeys.map((sourceKey) => (
                      <td key={sourceKey}>
                        <StatusPill
                          status={row.indicators[sourceKey]}
                          date={row.opportunityDates[sourceKey]}
                        />
                      </td>
                    ))}
                    <td>
                      <span className="tier-label">{row.entitlementTier}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
