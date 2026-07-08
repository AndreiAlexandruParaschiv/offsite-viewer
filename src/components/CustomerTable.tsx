import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { OPPORTUNITY_SOURCES, type SiteOpportunityRow } from '../types';
import { StatusPill } from './StatusPill';

interface CustomerTableProps {
  title: string;
  rows: SiteOpportunityRow[];
  defaultOpen?: boolean;
}

const sourceKeys = Object.keys(OPPORTUNITY_SOURCES) as Array<keyof typeof OPPORTUNITY_SOURCES>;

export function CustomerTable({ title, rows, defaultOpen = true }: CustomerTableProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="customer-section">
      <button
        type="button"
        className="customer-section__toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <ChevronDown className={isOpen ? 'chevron chevron--open' : 'chevron'} size={18} />
        <span>{title}</span>
        <strong>{rows.length}</strong>
      </button>

      {isOpen ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                {sourceKeys.map((sourceKey) => (
                  <th key={sourceKey}>{OPPORTUNITY_SOURCES[sourceKey].label}</th>
                ))}
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No sites in this group.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.siteId}>
                    <td>
                      <div className="site-cell">
                        <strong>{row.siteName}</strong>
                        <a href={row.baseURL} target="_blank" rel="noreferrer">
                          {row.baseURL}
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </div>
                    </td>
                    {sourceKeys.map((sourceKey) => (
                      <td key={sourceKey}>
                        <StatusPill
                          status={row.indicators[sourceKey]}
                          date={row.opportunityDates[sourceKey]}
                        />
                      </td>
                    ))}
                    <td>
                      <span className="tier-label">{row.entitlementTier}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
