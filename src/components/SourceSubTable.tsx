import { Check, Clipboard } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmationModal } from './ConfirmationModal';
import { SignalIcon } from './SignalIcon';
import { Tooltip } from './Tooltip';
import { OPPORTUNITY_SOURCES, type SiteOpportunityRow, type SourceKey, type SpacecatOpportunity } from '../types';
import { computeFilteredIndicator, extractLlmUsage, extractQaVerdict, formatUsd, hallucinationLevel, lastVisibleSignal, spacecatAuditCommand } from '../utils/dashboard';
import { COPY_FEEDBACK_MS } from '../utils/ui';
import { formatWeekLabel, opportunityTouchedInWeeks } from '../utils/weekFilter';

interface PendingAction {
  type: 'hide' | 'show' | 'delete';
  opportunityId: string;
}

interface SourceSubTableProps {
  row: SiteOpportunityRow;
  sourceKey: SourceKey;
  weeks: string[];
  onToggleStatus: (row: SiteOpportunityRow, sourceKey: SourceKey, opportunityId: string, newStatus: 'NEW' | 'IGNORED') => Promise<void>;
  onDeleteOpportunity: (row: SiteOpportunityRow, opportunityId: string) => Promise<void>;
}

const formatCell = (dateIso: string | undefined): string => {
  if (!dateIso) return '—';
  const w = formatWeekLabel(dateIso);
  const d = dateIso.slice(0, 10);
  const t = dateIso.slice(11, 19); // HH:MM:SS
  return t ? `${w} · ${d} ${t}` : `${w} · ${d}`;
};

export function SourceSubTable({
  row,
  sourceKey,
  weeks,
  onToggleStatus,
  onDeleteOpportunity,
}: SourceSubTableProps) {
  const source = OPPORTUNITY_SOURCES[sourceKey];
  const allOpps = row.allOpportunitiesBySource[sourceKey] ?? [];
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  // Apply week filter: show ALL opportunities touched in the selected weeks.
  // Amendment A2: multi-NEW — all matching rows are shown, not just the winner.
  const displayOpps = useMemo(
    () =>
      weeks.length === 0
        ? allOpps
        : allOpps.filter((o) => opportunityTouchedInWeeks(o, weeks)),
    [allOpps, weeks],
  );

  // Sort: NEW first by updatedAt desc, then IGNORED by updatedAt desc.
  const sortedOpps = useMemo(
    () =>
      [...displayOpps].sort((a, b) => {
        const statusOrder = (o: SpacecatOpportunity) =>
          o.status?.toUpperCase() === 'NEW' ? 0 : 1;
        const diff = statusOrder(a) - statusOrder(b);
        if (diff !== 0) return diff;
        const ta = a.updatedAt ?? a.createdAt ?? '';
        const tb = b.updatedAt ?? b.createdAt ?? '';
        return tb > ta ? 1 : -1;
      }),
    [displayOpps],
  );

  // last (visible): most recent NEW opportunity's updatedAt, no week filter applied.
  const lastVisible = useMemo(() => {
    const newOpps = allOpps.filter((o) => o.status?.toUpperCase() === 'NEW');
    if (newOpps.length === 0) return null;
    return newOpps.reduce((latest, o) => {
      const ta = latest.updatedAt ?? latest.createdAt ?? '';
      const tb = o.updatedAt ?? o.createdAt ?? '';
      return tb > ta ? o : latest;
    });
  }, [allOpps]);

  const lastVisibleLabel = lastVisible
    ? `last visible: ${formatCell(lastVisible.updatedAt ?? lastVisible.createdAt)}`
    : 'last visible: n/a';

  const headerStatus = computeFilteredIndicator(allOpps, source.opportunityType, weeks).indicator;

  const signal = lastVisibleSignal(allOpps);

  const hasRerunButton = source.cadence !== 'monthly';
  const slackCommand = spacecatAuditCommand(row.baseURL, source.opportunityType);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const copyRerun = async () => {
    try {
      await navigator.clipboard.writeText(slackCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard not available in some envs
    }
  };

  const handleConfirm = async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    try {
      if (pendingAction.type === 'delete') {
        await onDeleteOpportunity(row, pendingAction.opportunityId);
      } else {
        await onToggleStatus(row, sourceKey, pendingAction.opportunityId, pendingAction.type === 'hide' ? 'IGNORED' : 'NEW');
      }
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const getModalProps = () => {
    if (!pendingAction) return null;
    const domain = row.baseURL.replace(/^https?:\/\//, '');
    if (pendingAction.type === 'hide') {
      return {
        title: 'Hide opportunity',
        description: `Hide the ${source.label} Analysis opportunity for ${domain}? It will become IGNORED (not visible to the customer) but remains in the system.`,
        actionWord: 'hide',
        actionLabel: 'Hide',
      };
    }
    if (pendingAction.type === 'show') {
      return {
        title: 'Show opportunity',
        description: `Set the ${source.label} Analysis opportunity for ${domain} back to NEW (visible to the customer)?`,
        actionWord: 'show',
        actionLabel: 'Show',
      };
    }
    return {
      title: 'Delete opportunity',
      description: `Permanently delete this ${source.label} Analysis opportunity for ${domain}? This cannot be undone.`,
      actionWord: 'delete',
      actionLabel: 'Delete',
    };
  };

  const modalProps = getModalProps();

  return (
    <>
      {modalProps ? (
        <ConfirmationModal
          {...modalProps}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}

      <div className="source-sub-table">
        {/* Section header */}
        <div className="source-sub-table__header">
          <span className="source-sub-table__name">
            {source.label} Analysis
            {source.cadence === 'monthly' ? (
              <span className="cadence-tag">(monthly)</span>
            ) : null}
          </span>
          <span className="source-sub-table__meta">
            <span className={`status-indicator status-indicator--${headerStatus}`}>
              {headerStatus === 'visible'
                ? '● Visible'
                : headerStatus === 'ignored'
                  ? '● Hidden'
                  : '○ Not Produced'}
            </span>
            <span className="sep">|</span>
            <span><SignalIcon signal={signal} />{lastVisibleLabel}</span>
          </span>
        </div>

        {/* Opportunity table */}
        <table className="opp-table">
          <colgroup>
            <col className="opp-col-num" />
            <col className="opp-col-status" />
            <col className="opp-col-date" />
            <col className="opp-col-date" />
            <col className="opp-col-sugg" />
            <col className="opp-col-hall" />
            <col className="opp-col-cost" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>OPP #</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th>UPDATED</th>
              <th>SUGGESTIONS</th>
              <th>HALL. RATE</th>
              <th>COST</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {sortedOpps.length === 0 ? (
              <tr className="opp-row opp-row--not-produced">
                <td>0</td>
                <td className="opp-status--missing">○ Not Produced</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ) : (
              sortedOpps.map((opp, idx) => {
                const isNew = opp.status?.toUpperCase() === 'NEW';
                const isIgnored = opp.status?.toUpperCase() === 'IGNORED';
                const suggCount = row.suggestionCountsByOpportunityId?.[opp.id];
                const usage = source.cadence !== 'monthly' ? extractLlmUsage(opp) : undefined;
                const qa = source.cadence !== 'monthly' ? extractQaVerdict(opp) : undefined;
                const hallLabel = qa
                  ? (qa.rateDetermined ? `${Math.round(qa.rate * 100)}% (${qa.hallucinatedCount}/${qa.analyzedCount})` : 'N/A')
                  : '—';
                const hallLevel = qa?.rateDetermined ? hallucinationLevel(qa.rate) : null;
                const updatedBold =
                  opp.updatedAt && opp.createdAt && opp.updatedAt !== opp.createdAt;

                return (
                  <tr
                    key={opp.id}
                    className={`opp-row${isNew ? ' opp-row--new' : isIgnored ? ' opp-row--ignored' : ''}`}
                  >
                    <td className={!isNew ? 'opp-num--dim' : ''}>{idx + 1}</td>
                    <td className={isNew ? 'opp-status--new' : isIgnored ? 'opp-status--ignored' : 'opp-status--unknown'}>
                      {isNew ? '● Visible' : isIgnored ? '● Hidden' : `● ${opp.status ?? 'UNKNOWN'}`}
                    </td>
                    <td>{formatCell(opp.createdAt)}</td>
                    <td className={updatedBold ? 'opp-updated--bold' : ''}>
                      {formatCell(opp.updatedAt)}
                    </td>
                    <td>{suggCount !== undefined ? suggCount : '—'}</td>
                    <td className={hallLevel ? `opp-hall--${hallLevel}` : undefined}>{hallLabel}</td>
                    <td>{usage ? formatUsd(usage.totalCostUsd) : '—'}</td>
                    <td className="opp-actions">
                      {isNew ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingAction({ type: 'hide', opportunityId: opp.id })}
                        >
                          Hide
                        </button>
                      ) : null}
                      {isIgnored ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingAction({ type: 'show', opportunityId: opp.id })}
                          >
                            Show
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingAction({ type: 'delete', opportunityId: opp.id })}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Rerun footer */}
        {hasRerunButton ? (
          <div className="source-sub-table__footer">
            <Tooltip text={`Copies: ${slackCommand}`}>
              <button type="button" className="rerun-btn" onClick={copyRerun}>
                {copiedCmd
                  ? <><Check size={11} aria-hidden="true" /> Copied!</>
                  : <><Clipboard size={11} aria-hidden="true" /> Copy @spacecat command</>
                }
              </button>
            </Tooltip>
          </div>
        ) : null}
      </div>
    </>
  );
}
