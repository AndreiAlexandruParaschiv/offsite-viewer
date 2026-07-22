import type { MissingOpportunityInfo, OpportunityIndicator } from '../types';

const LABELS: Record<OpportunityIndicator, string> = {
  visible: 'yes',
  ignored: 'ignored',
  missing: 'no',
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

interface StatusPillProps {
  status: OpportunityIndicator;
  date?: string;
  suggestionCount?: number;
  missingInfo?: MissingOpportunityInfo;
}

export function StatusPill({ status, date, suggestionCount, missingInfo }: StatusPillProps) {
  const showExtras = status === 'visible' || status === 'ignored';
  const formattedDate = showExtras && date ? formatDate(date) : '';
  // suggestionCount is absent (not 0) when it hasn't been fetched for this
  // row, so only render it once it's actually known.
  const hasSuggestionCount = showExtras && suggestionCount !== undefined;

  const missingLabel =
    status === 'missing' && missingInfo
      ? missingInfo.kind === 'audit-error'
        ? 'audit failed'
        : 'audit ran, no opportunity'
      : '';

  return (
    <span className="status-cell">
      <span className={`status-pill status-pill--${status}`}>
        <span aria-hidden="true" className="status-pill__dot" />
        {LABELS[status]}
      </span>
      {formattedDate ? <span className="status-cell__date">{formattedDate}</span> : null}
      {hasSuggestionCount ? (
        <span className="status-cell__suggestions">
          {suggestionCount} suggestion{suggestionCount === 1 ? '' : 's'}
        </span>
      ) : null}
      {missingLabel ? (
        <span
          className={`status-cell__reason status-cell__reason--${missingInfo?.kind}`}
          title={missingInfo?.detail}
        >
          {missingLabel}
        </span>
      ) : null}
    </span>
  );
}
