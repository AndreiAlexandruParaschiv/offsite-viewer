import { RefreshCw } from 'lucide-react';

interface ConnectionBarProps {
  baseUrl: string;
  token: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  statusText: string;
  onBaseUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onLoad: () => void;
}

export function ConnectionBar({
  baseUrl,
  token,
  status,
  statusText,
  onBaseUrlChange,
  onTokenChange,
  onLoad,
}: ConnectionBarProps) {
  const canLoad = status !== 'loading' && token.trim().length > 0 && baseUrl.trim().length > 0;

  return (
    <section className="control-bar" aria-label="API controls">
      <label>
        API base URL
        <input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder="https://llmo.experiencecloud.live/api/v1"
          spellCheck={false}
        />
      </label>
      <label>
        IMS or session token
        <input
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          type="password"
          placeholder="Bearer token"
        />
      </label>
      <div className="actions">
        <button type="button" onClick={onLoad} disabled={!canLoad}>
          <RefreshCw size={16} className={status === 'loading' ? 'spin' : ''} aria-hidden="true" />
          Load
        </button>
      </div>
      {statusText ? <p className="control-bar__status">{statusText}</p> : null}
    </section>
  );
}
