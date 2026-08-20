import { Check, ChevronDown, Clipboard, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FilterState, type SiteOpportunityRow, type SourceKey } from '../types';
import { spacecatAuditCommand } from '../utils/dashboard';
import { COPY_FEEDBACK_MS } from '../utils/ui';
import { SiteTable } from './SiteTable';
import { Tooltip } from './Tooltip';

interface CustomerSectionProps {
  title: string;
  rows: SiteOpportunityRow[];
  filter: FilterState;
  defaultOpen?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  refreshedAt?: string;
  refreshedCount?: number;
  showCopyButton?: boolean;
  onToggleStatus: (row: SiteOpportunityRow, sourceKey: SourceKey, opportunityId: string, newStatus: 'NEW' | 'IGNORED') => Promise<void>;
  onDeleteOpportunity: (row: SiteOpportunityRow, opportunityId: string) => Promise<void>;
  onExpandRow: (siteId: string) => Promise<void>;
}

export function CustomerSection({
  title,
  rows,
  filter,
  defaultOpen = true,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Refresh',
  refreshedAt,
  refreshedCount,
  showCopyButton = true,
  onToggleStatus,
  onDeleteOpportunity,
  onExpandRow,
}: CustomerSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedAll, setCopiedAll] = useState(false);

  const filteredCount = useMemo(
    () =>
      rows.filter((row) => {
        if (!filter.tiers.includes(row.customerGroup)) return false;
        if (filter.selectedSites !== null && !filter.selectedSites.includes(row.baseURL))
          return false;
        return true;
      }).length,
    [rows, filter.tiers, filter.selectedSites],
  );

  const handleCopyAllCommands = async () => {
    const lines = rows.map((r) => spacecatAuditCommand(r.baseURL));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), COPY_FEEDBACK_MS);
    } catch { /* clipboard not available */ }
  };

  return (
    <section className="customer-section">
      <div className="customer-section__header">
        <button
          type="button"
          className="customer-section__toggle"
          onClick={() => setIsOpen((cur) => !cur)}
          aria-expanded={isOpen}
        >
          <ChevronDown
            size={18}
            className={isOpen ? 'chevron chevron--open' : 'chevron'}
            aria-hidden="true"
          />
          <span>{title}</span>
          <strong>{filteredCount}</strong>
        </button>

        <span className="customer-section__spacer" />

        {refreshedAt ? (
          <span className="customer-section__refreshed-at">
            Last refreshed: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(refreshedAt))}
            {refreshedCount !== undefined ? ` · ${refreshedCount} sites` : ''}
          </span>
        ) : null}

        {onRefresh ? (
          <button
            type="button"
            className="customer-section__action"
            onClick={onRefresh}
            disabled={refreshDisabled}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {refreshLabel}
          </button>
        ) : null}

        {showCopyButton ? (
          <Tooltip text={`Copies @spacecat run audit {domain} offsite-brand-presence · one line per site · ${filteredCount} site${filteredCount === 1 ? '' : 's'}`}>
            <button
              type="button"
              className="customer-section__action"
              onClick={handleCopyAllCommands}
              disabled={filteredCount === 0}
            >
              {copiedAll ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
              {copiedAll ? `Copied ${filteredCount}` : 'Copy @spacecat commands'}
            </button>
          </Tooltip>
        ) : null}
      </div>

      {isOpen ? (
        <SiteTable
          rows={rows}
          filter={filter}
          onToggleStatus={onToggleStatus}
          onDeleteOpportunity={onDeleteOpportunity}
          onExpandRow={onExpandRow}
        />
      ) : null}
    </section>
  );
}
