import type { MissingReason, OpportunityIndicator } from '../types';

const LABELS: Record<OpportunityIndicator, string> = {
  visible: 'yes',
  ignored: 'ignored',
  missing: 'no',
};

const MISSING_REASON_LABELS: Record<MissingReason, string> = {
  'no-source-urls': 'no source URLs found',
  'audit-error': 'audit error',
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
};

interface StatusPillProps {
  status: OpportunityIndicator;
  date?: string;
  suggestionCount?: number;
  missingReason?: MissingReason;
}

export function StatusPill({ status, date, suggestionCount, missingReason }: StatusPillProps) {
  const showExtras = status === 'visible' || status === 'ignored';
  const formattedDate = showExtras && date ? formatDate(date) : '';
  // suggestionCount is absent (not 0) when it hasn't been fetched for this
  // row, so only render it once it's actually known.
  const hasSuggestionCount = showExtras && suggestionCount !== undefined;

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
      {status === 'missing' && missingReason ? (
        <span className={`status-cell__reason status-cell__reason--${missingReason}`}>
          {MISSING_REASON_LABELS[missingReason]}
        </span>
      ) : null}
    </span>
  );
}
