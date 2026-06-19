import type { OpportunityIndicator } from '../types';

const LABELS: Record<OpportunityIndicator, string> = {
  visible: 'yes',
  ignored: 'ignored',
  missing: 'no',
};

export function StatusPill({ status }: { status: OpportunityIndicator }) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      <span aria-hidden="true" className="status-pill__dot" />
      {LABELS[status]}
    </span>
  );
}
