import { ArrowDown, ArrowUp, Eye, Info } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import {
  OPPORTUNITY_SOURCES,
  type FilterState,
  type SiteOpportunityRow,
  type SourceKey,
} from '../types';
import {
  computeFilteredIndicator,
  formatUsd,
  isAcceptedRegion,
  normalizeRegion,
  computeFilteredRowCost,
  lastVisibleSignal,
} from '../utils/dashboard';
import { isSafeUrl, stripProtocol } from '../utils/url';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { SignalIcon, SIGNAL_TOOLTIP } from './SignalIcon';
import { ExpandedSitePanel } from './ExpandedSitePanel';

// Hoisted to module level — stable reference, no need to include in dep arrays
const SOURCE_KEYS = Object.keys(OPPORTUNITY_SOURCES) as SourceKey[];

function SignalLegend() {
  const [showBox, setShowBox] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useOutsideClick([btnRef, boxRef], () => setShowBox(false));

  return (
    <div className="signal-legend" aria-label="Signal icon legend">
      {(Object.entries(SIGNAL_TOOLTIP) as [string, string][]).map(([level, text]) => (
        <span key={level} className="signal-legend__item">
          <Info size={11} className={`signal-icon--${level}`} aria-hidden="true" />
          {text}
        </span>
      ))}
      <span className="signal-legend__see-more">
        <button
          ref={btnRef}
          type="button"
          className={`signal-legend__eye-btn${showBox ? ' signal-legend__eye-btn--active' : ''}`}
          aria-label="How the last visible signal works"
          onClick={() => setShowBox((v) => !v)}
        >
          <Eye size={12} aria-hidden="true" /> How this works
        </button>
        {showBox && (
          <div ref={boxRef} className="signal-rules-box" role="dialog" aria-label="Last Visible Signal explained">
            <button type="button" className="counting-rules-box__close" onClick={() => setShowBox(false)} aria-label="Close">✕</button>
            <h3 className="counting-rules-box__title">Last Visible Signal</h3>
            <section className="counting-rules-box__section">
              <p>The coloured ⓘ icon next to each audit type status tells you <strong>how recently a customer-facing opportunity was last produced</strong> for that site. It answers: "is this site being actively served, or has production lapsed?"</p>
            </section>
            <section className="counting-rules-box__section">
              <h4>Important: it ignores your week filter</h4>
              <p>The signal always looks across <strong>all time</strong>, not just the weeks you have selected. You may be viewing W34, but if the last visible opportunity was in W32, the icon will be yellow — even if "Hidden" / "Not Produced" appears in the table.</p>
            </section>
            <section className="counting-rules-box__section">
              <h4>Colour meaning</h4>
              <div className="counting-rules-box__example counting-rules-box__example--signals">
                <div><Info size={11} className="signal-icon--ok" aria-hidden="true" style={{ display: 'inline-block', marginRight: 6 }} /> <strong>Green</strong> — last visible produced this week</div>
                <div><Info size={11} className="signal-icon--info" aria-hidden="true" style={{ display: 'inline-block', marginRight: 6 }} /> <strong>Blue</strong> — last visible produced last week</div>
                <div><Info size={11} className="signal-icon--warning" aria-hidden="true" style={{ display: 'inline-block', marginRight: 6 }} /> <strong>Yellow</strong> — last visible older than one week</div>
                <div><Info size={11} className="signal-icon--error" aria-hidden="true" style={{ display: 'inline-block', marginRight: 6 }} /> <strong>Red</strong> — no visible has ever been produced</div>
              </div>
            </section>
          </div>
        )}
      </span>
    </div>
  );
}

type SortCol = 'site' | 'tier' | 'region' | SourceKey | 'cost';
type SortDir = 'asc' | 'desc';

const INDICATOR_ORDER: Record<string, number> = { visible: 0, ignored: 1, missing: 2 };

interface SiteTableProps {
  rows: SiteOpportunityRow[];
  filter: FilterState;
  onToggleStatus: (row: SiteOpportunityRow, sourceKey: SourceKey, opportunityId: string, newStatus: 'NEW' | 'IGNORED') => Promise<void>;
  onDeleteOpportunity: (row: SiteOpportunityRow, opportunityId: string) => Promise<void>;
  onExpandRow: (siteId: string) => Promise<void>;
}

export function SiteTable({
  rows,
  filter,
  onToggleStatus,
  onDeleteOpportunity,
  onExpandRow,
}: SiteTableProps) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: 'site', dir: 'asc' });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const enabledSources = filter.sourceKeys;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!filter.tiers.includes(row.customerGroup)) return false;
      if (filter.selectedSites !== null && !filter.selectedSites.includes(row.baseURL)) return false;
      return true;
    });
  }, [rows, filter.tiers, filter.selectedSites]);

  const sortedRows = useMemo(() => {
    const sortSign = sort.dir === 'asc' ? 1 : -1;

    const costCache = sort.col === 'cost'
      ? new Map(filteredRows.map((r) => [r.siteId, computeFilteredRowCost(r, filter.weeks, enabledSources)]))
      : null;

    return [...filteredRows].sort((a, b) => {
      if (sort.col === 'site') {
        return sortSign * stripProtocol(a.baseURL).localeCompare(stripProtocol(b.baseURL));
      }
      if (sort.col === 'tier') return sortSign * a.entitlementTier.localeCompare(b.entitlementTier);
      if (sort.col === 'region') return sortSign * normalizeRegion(a.region).localeCompare(normalizeRegion(b.region));
      if (sort.col === 'cost') {
        const costA = costCache?.get(a.siteId) ?? 0;
        const costB = costCache?.get(b.siteId) ?? 0;
        return sortSign * (costA - costB);
      }
      // Source column: sort by filtered indicator, then date
      const ia = computeFilteredIndicator(
        a.allOpportunitiesBySource[sort.col] ?? [],
        OPPORTUNITY_SOURCES[sort.col].opportunityType,
        filter.weeks,
      );
      const ib = computeFilteredIndicator(
        b.allOpportunitiesBySource[sort.col] ?? [],
        OPPORTUNITY_SOURCES[sort.col].opportunityType,
        filter.weeks,
      );
      const diff = INDICATOR_ORDER[ia.indicator] - INDICATOR_ORDER[ib.indicator];
      if (diff !== 0) return sortSign * diff;
      return sortSign * (ib.date > ia.date ? 1 : ib.date < ia.date ? -1 : 0);
    });
  }, [filteredRows, sort, filter.weeks, enabledSources]);

  const toggleSort = (col: SortCol) =>
    setSort((cur) =>
      cur.col === col
        ? { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' },
    );

  const toggleExpand = async (siteId: string) => {
    const isCurrentlyExpanded = expandedIds.has(siteId);
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
    if (!isCurrentlyExpanded) {
      await onExpandRow(siteId);
    }
  };

  const sortIcon = (col: SortCol) => {
    if (sort.col !== col) return null;
    return sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />;
  };

  const thSort = (col: SortCol, label: string) => {
    const ariaSort: 'ascending' | 'descending' | 'none' =
      sort.col === col
        ? sort.dir === 'asc' ? 'ascending' : 'descending'
        : 'none';
    return (
      <th key={col} aria-sort={ariaSort}>
        <button type="button" className="th-sort" onClick={() => toggleSort(col)}>
          {label} {sortIcon(col)}
        </button>
      </th>
    );
  };

  return (
    <section className="site-table-section">
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th className="col-num">#</th>
              {thSort('site', 'SITE')}
              {thSort('region', 'REGION')}
              {SOURCE_KEYS
                .filter((k) => enabledSources.includes(k))
                .map((k) => thSort(k, OPPORTUNITY_SOURCES[k].label.toUpperCase()))}
              {thSort('cost', 'COST')}
              {thSort('tier', 'TIER')}
              <th>SEMRUSH</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const isExpanded = expandedIds.has(row.siteId);
              const domain = stripProtocol(row.baseURL);
              const colSpan = 5 + enabledSources.length + 1; // # + SITE + REGION + SEMRUSH + TIER + sources + COST

              return (
                <React.Fragment key={row.siteId}>
                  <tr
                    className={`site-row${isExpanded ? ' site-row--expanded' : ''}`}
                  >
                    <td className="row-num-cell">{rowIndex + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="site-row__expand-btn"
                        onClick={() => toggleExpand(row.siteId)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${domain}`}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                      {isSafeUrl(row.baseURL) ? (
                        <a
                          href={row.baseURL}
                          target="_blank"
                          rel="noreferrer"
                          className="site-row__link"
                        >
                          {domain}
                        </a>
                      ) : (
                        <span className="site-row__link">{domain}</span>
                      )}
                      <span className="site-id-label">{row.siteId}</span>
                    </td>
                    <td>
                      {(() => {
                        const accepted = isAcceptedRegion(row.region);
                        const label = normalizeRegion(row.region);
                        if (accepted === undefined) {
                          return <span className="region-cell region-cell--unknown">—</span>;
                        }
                        return (
                          <span
                            className={`region-cell${accepted ? '' : ' region-cell--unsupported'}${row.regionInferred ? ' region-cell--inferred' : ''}`}
                            title={[
                              !accepted ? `${label} — not in accepted regions (US/GB/CA/AU/IE/NZ)` : `${label} — supported region`,
                              row.regionInferred ? 'Inferred from domain TLD' : '',
                            ].filter(Boolean).join(' · ')}
                          >
                            {label}{row.regionInferred ? '*' : ''}
                          </span>
                        );
                      })()}
                    </td>
                    {SOURCE_KEYS
                      .filter((k) => enabledSources.includes(k))
                      .map((k) => {
                        const opps = row.allOpportunitiesBySource[k] ?? [];
                        const result = computeFilteredIndicator(
                          opps,
                          OPPORTUNITY_SOURCES[k].opportunityType,
                          filter.weeks,
                        );
                        const signal = lastVisibleSignal(opps);
                        return (
                          <td
                            key={k}
                            className={`status-cell status-cell--${result.indicator}`}
                          >
                            {result.indicator === 'visible'
                              ? '● Visible'
                              : result.indicator === 'ignored'
                                ? '● Hidden'
                                : '○ Not Produced'}
                            <SignalIcon signal={signal} />
                          </td>
                        );
                      })}
                    <td className="cost-cell">{formatUsd(computeFilteredRowCost(row, filter.weeks, enabledSources))}</td>
                    <td>
                      <span className={`tier-pill tier-pill--${row.customerGroup}`}>
                        {row.entitlementTier}
                      </span>
                    </td>
                    <td>
                      {row.hasSemrush === true
                        ? <span className="semrush-pill semrush-pill--yes">✓ Yes</span>
                        : row.hasSemrush === false
                          ? <span className="semrush-pill semrush-pill--no">✗ No</span>
                          : <span className="semrush-pill semrush-pill--unknown">—</span>}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="expanded-row">
                      <td colSpan={colSpan}>
                        <ExpandedSitePanel
                          row={row}
                          weeks={filter.weeks}
                          enabledSourceKeys={enabledSources}
                          onToggleStatus={onToggleStatus}
                          onDeleteOpportunity={onDeleteOpportunity}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={99} className="empty-cell">
                  No sites match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <SignalLegend />
    </section>
  );
}
