import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

export interface ToastRow {
  siteId: string;
  baseUrl: string;
}

interface ToastProps {
  message: string;
  rows?: ToastRow[];
  onDismiss: () => void;
  durationMs?: number;
}

export function Toast({ message, rows, onDismiss, durationMs = 12000 }: ToastProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  const handleCopy = () => {
    if (!rows) return;
    const csv = rows.map((r) => r.siteId).join('\n');
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="toast" role="alert" aria-live="polite">
      <div className="toast__header">
        <span className="toast__title">{message}</span>
        <button
          type="button"
          className="toast__close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
      {rows && rows.length > 0 && (
        <ul className="toast__list">
          {rows.slice(0, 20).map((r) => (
            <li key={r.siteId} className="toast__list-item">
              <span className="toast__site-id">{r.siteId}</span>
              {r.baseUrl && <span className="toast__base-url">{r.baseUrl}</span>}
            </li>
          ))}
          {rows.length > 20 && (
            <li className="toast__list-item toast__list-more">…and {rows.length - 20} more</li>
          )}
        </ul>
      )}
      {rows && rows.length > 0 && (
        <div className="toast__footer">
          <button
            type="button"
            className="toast__copy"
            aria-label="Copy list as CSV"
            onClick={handleCopy}
            title="Copy site IDs, one per line"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? ' Copied' : ' Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
