import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  OPPORTUNITY_SOURCES,
  type OpportunityIndicator,
  type SiteOpportunityRow,
  type SourceKey,
} from '../types';
import { formatCount, formatUsd, spacecatAuditCommand, sumRowLlmUsage } from '../utils/dashboard';
import { StatusPill } from './StatusPill';

interface CustomerTableProps {
  title: string;
  rows: SiteOpportunityRow[];
  defaultOpen?: boolean;
  onExport?: () => void;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshTitle?: string;
  onToggleStatus?: (row: SiteOpportunityRow, sourceKey: SourceKey) => Promise<void>;
  // Shows a per-row "copy Slack audit command" button plus a header button to
  // copy all of them at once — the @spacecat bot's `run audit` command has no
  // safe way to be sent directly from this browser-only app (would require a
  // backend to hold a Slack token), so copy-to-clipboard is the practical
  // middle ground.
  enableAuditCommand?: boolean;
}

const sourceKeys = Object.keys(OPPORTUNITY_SOURCES) as Array<keyof typeof OPPORTUNITY_SOURCES>;

type SortColumn = 'site' | (typeof sourceKeys)[number] | 'llmcost' | 'tier';
type SortDirection = 'asc' | 'desc';

// Human-readable tooltip for a usage block, e.g. "10 calls · 326,070 tokens · $1.468751".
const usageTooltip = (usage: { totalLlmCalls: number; totalTokens: number; totalCostUsd: number }) =>
  `${formatCount(usage.totalLlmCalls)} calls · ${formatCount(usage.totalTokens)} tokens · $${usage.totalCostUsd}`;

// yes (visible) before ignored before no (missing), so sorting a source
// column groups matching statuses together.
const INDICATOR_ORDER: Record<OpportunityIndicator, number> = {
  visible: 0,
  ignored: 1,
  missing: 2,
};

const COPY_FEEDBACK_MS = 1800;

export function CustomerTable({
  title,
  rows,
  defaultOpen = true,
  onExport,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Refresh',
  refreshTitle = 'Re-check opportunities for these sites only, without reloading everything',
  onToggleStatus,
  enableAuditCommand = false,
}: CustomerTableProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection } | null>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyRowCommand = async (row: SiteOpportunityRow) => {
    if (await copyText(spacecatAuditCommand(row.baseURL))) {
      setCopiedRowId(row.siteId);
      setTimeout(() => setCopiedRowId((current) => (current === row.siteId ? null : current)), COPY_FEEDBACK_MS);
    }
  };

  const handleCopyAllCommands = async () => {
    const text = rows.map((row) => spacecatAuditCommand(row.baseURL)).join('\n');
    if (await copyText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), COPY_FEEDBACK_MS);
    }
  };

  const handleToggleStatus = async (row: SiteOpportunityRow, sourceKey: SourceKey) => {
    if (!onToggleStatus) {
      return;
    }

    const key = `${row.siteId}:${sourceKey}`;
    setPendingToggle(key);
    try {
      await onToggleStatus(row, sourceKey);
    } finally {
      setPendingToggle((current) => (current === key ? null : current));
    }
  };

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

      if (sort.column === 'llmcost') {
        return factor * (sumRowLlmUsage(a).totalCostUsd - sumRowLlmUsage(b).totalCostUsd);
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
        {onRefresh ? (
          <button
            type="button"
            className="customer-section__export"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title={refreshTitle}
          >
            <RefreshCw size={14} />
            {refreshLabel}
          </button>
        ) : null}
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
        {enableAuditCommand ? (
          <button
            type="button"
            className="customer-section__export"
            onClick={handleCopyAllCommands}
            disabled={rows.length === 0}
            title="Copy an @spacecat run audit ... command for every site in this table, one per line"
          >
            {copiedAll ? <Check size={14} /> : <Clipboard size={14} />}
            {copiedAll ? `Copied ${rows.length}` : 'Copy audit commands'}
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
                  <button type="button" className="th-sort" onClick={() => toggleSort('llmcost')}>
                    LLM cost {sortIndicator('llmcost')}
                  </button>
                </th>
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
                  <td colSpan={7} className="empty-cell">
                    No sites in this group.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, index) => (
                  <tr key={row.siteId}>
                    <td>
                      <div className="site-cell">
                        <div className="site-cell__name-row">
                          <span className="site-cell__index">{index + 1}</span>
                          <strong>{row.siteName}</strong>
                          {enableAuditCommand ? (
                            <button
                              type="button"
                              className="site-cell__copy-command"
                              onClick={() => handleCopyRowCommand(row)}
                              title="Copy @spacecat run audit ... command for this site"
                            >
                              {copiedRowId === row.siteId ? (
                                <Check size={12} />
                              ) : (
                                <Clipboard size={12} />
                              )}
                            </button>
                          ) : null}
                        </div>
                        <a href={row.baseURL} target="_blank" rel="noreferrer">
                          {row.baseURL}
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </div>
                    </td>
                    {sourceKeys.map((sourceKey) => {
                      const status = row.indicators[sourceKey];
                      const toggleKey = `${row.siteId}:${sourceKey}`;
                      const isPending = pendingToggle === toggleKey;
                      const usage = row.llmUsage?.[sourceKey];

                      return (
                        <td key={sourceKey}>
                          <div className="status-toggle-cell">
                            <StatusPill
                              status={status}
                              date={row.opportunityDates[sourceKey]}
                              suggestionCount={row.suggestionCounts?.[sourceKey]}
                              missingInfo={row.missingInfo?.[sourceKey]}
                            />
                            {usage ? (
                              <span className="status-cell__cost" title={usageTooltip(usage)}>
                                {formatUsd(usage.totalCostUsd)}
                              </span>
                            ) : null}
                            {onToggleStatus && status !== 'missing' ? (
                              <button
                                type="button"
                                className="status-toggle-button"
                                disabled={isPending}
                                onClick={() => handleToggleStatus(row, sourceKey)}
                                title={
                                  status === 'visible'
                                    ? `Mark ${OPPORTUNITY_SOURCES[sourceKey].label} as ignored`
                                    : `Mark ${OPPORTUNITY_SOURCES[sourceKey].label} as visible`
                                }
                              >
                                {isPending ? (
                                  <Loader2 size={13} className="spin" />
                                ) : status === 'visible' ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td>
                      {(() => {
                        const hasUsage = Object.keys(row.llmUsage ?? {}).length > 0;
                        if (!hasUsage) {
                          return <span className="llm-cost-cell llm-cost-cell--empty">—</span>;
                        }
                        const total = sumRowLlmUsage(row);
                        return (
                          <span className="llm-cost-cell" title={usageTooltip(total)}>
                            {formatUsd(total.totalCostUsd)}
                          </span>
                        );
                      })()}
                    </td>
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
