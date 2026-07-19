import type { OpportunityIndicator } from '../types';

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

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
};

export function StatusPill({ status, date }: { status: OpportunityIndicator; date?: string }) {
  const formattedDate = (status === 'visible' || status === 'ignored') && date ? formatDate(date) : '';

  return (
    <span className="status-cell">
      <span className={`status-pill status-pill--${status}`}>
        <span aria-hidden="true" className="status-pill__dot" />
        {LABELS[status]}
      </span>
      {formattedDate ? <span className="status-cell__date">{formattedDate}</span> : null}
    </span>
  );
}
