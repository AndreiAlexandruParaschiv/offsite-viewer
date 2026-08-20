import { Check, Clipboard } from 'lucide-react';
import { useState } from 'react';
import { OPPORTUNITY_SOURCES, type SiteOpportunityRow, type SourceKey } from '../types';
import { stripProtocol } from '../utils/url';
import { COPY_FEEDBACK_MS } from '../utils/ui';
import { SourceSubTable } from './SourceSubTable';
import { Tooltip } from './Tooltip';

const SOURCE_ORDER = Object.keys(OPPORTUNITY_SOURCES) as SourceKey[];

interface ExpandedSitePanelProps {
  row: SiteOpportunityRow;
  weeks: string[];
  enabledSourceKeys: SourceKey[];
  onToggleStatus: (row: SiteOpportunityRow, sourceKey: SourceKey, opportunityId: string, newStatus: 'NEW' | 'IGNORED') => Promise<void>;
  onDeleteOpportunity: (row: SiteOpportunityRow, opportunityId: string) => Promise<void>;
}

function CopyAuditButton({ baseURL }: { baseURL: string }) {
  const [copied, setCopied] = useState(false);
  const domain = stripProtocol(baseURL);
  const cmd = `@spacecat run audit ${domain} offsite-brand-presence`;
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch { /* ignore */ }
  };
  return (
    <Tooltip text={`Copies: ${cmd}`}>
      <button type="button" className="rerun-btn" onClick={handle}>
        {copied
          ? <><Check size={11} aria-hidden="true" /> Copied!</>
          : <><Clipboard size={11} aria-hidden="true" /> Copy @spacecat command</>
        }
      </button>
    </Tooltip>
  );
}

export function ExpandedSitePanel({
  row, weeks, enabledSourceKeys, onToggleStatus, onDeleteOpportunity,
}: ExpandedSitePanelProps) {
  return (
    <div className="expanded-site-panel">
      {SOURCE_ORDER.filter((k) => enabledSourceKeys.includes(k)).map((key) => (
        <SourceSubTable
          key={key}
          row={row}
          sourceKey={key}
          weeks={weeks}
          onToggleStatus={onToggleStatus}
          onDeleteOpportunity={onDeleteOpportunity}
        />
      ))}
      <div className="expanded-site__footer">
        <CopyAuditButton baseURL={row.baseURL} />
      </div>
    </div>
  );
}
