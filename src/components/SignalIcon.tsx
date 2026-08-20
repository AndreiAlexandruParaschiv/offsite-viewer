import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

export type LastVisibleSignal = 'ok' | 'info' | 'warning' | 'error';

export const SIGNAL_TOOLTIP: Record<LastVisibleSignal, string> = {
  ok: 'Last visible opportunity produced in the current week',
  info: 'Last visible opportunity produced in the previous week',
  warning: 'Last visible opportunity is older than 1 week',
  error: 'No visible opportunity ever produced',
};

export function SignalIcon({ signal }: { signal: LastVisibleSignal }) {
  return (
    <Tooltip text={SIGNAL_TOOLTIP[signal]}>
      <span className={`signal-icon signal-icon--${signal}`}>
        <Info size={11} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
