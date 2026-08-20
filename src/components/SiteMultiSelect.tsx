import { useMemo, useRef, useState } from 'react';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { stripProtocol } from '../utils/url';

interface SiteMultiSelectProps {
  availableDomains: string[];
  selectedSites: string[] | null;  // null = all; [] = none; string[] = explicit list
  onChange: (next: string[] | null) => void;
}

export function SiteMultiSelect({ availableDomains, selectedSites, onChange }: SiteMultiSelectProps) {
  const [search, setSearch] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const allSelected = selectedSites === null;
  const selectedCount = allSelected ? availableDomains.length : selectedSites.length;

  useOutsideClick([detailsRef], () => { if (detailsRef.current) detailsRef.current.open = false; });

  const filteredDomains = useMemo(
    () =>
      search.trim()
        ? availableDomains.filter((d) => d.toLowerCase().includes(search.trim().toLowerCase()))
        : availableDomains,
    [availableDomains, search],
  );

  const summaryLabel = allSelected
    ? 'All sites'
    : selectedCount === 0
      ? `0 / ${availableDomains.length} sites`
      : `${selectedCount} / ${availableDomains.length} sites`;

  const toggleAllSites = () => {
    if (allSelected) {
      // Deselect all — explicit empty list
      onChange([]);
    } else {
      // Select all
      onChange(null);
    }
  };

  const toggleDomain = (domain: string) => {
    if (allSelected) {
      // Going from all → exclude this one domain
      onChange(availableDomains.filter((d) => d !== domain));
    } else {
      const current = selectedSites ?? [];
      const next = current.includes(domain)
        ? current.filter((d) => d !== domain)
        : [...current, domain];
      // If all individual domains are now checked, collapse to null (= all)
      onChange(next.length === availableDomains.length ? null : next);
    }
  };

  const isChecked = (domain: string) => allSelected || (selectedSites ?? []).includes(domain);

  return (
    <details ref={detailsRef} className="site-multiselect">
      <summary className="filter-bar__toggle site-multiselect__summary">
        {summaryLabel} ▾
      </summary>
      <div className="site-multiselect__panel">
        <input
          className="site-multiselect__search"
          type="search"
          placeholder="Search domains…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search domains"
        />
        <label className="site-multiselect__item site-multiselect__item--all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAllSites}
          />
          All sites
        </label>
        <div className="site-multiselect__list">
          {filteredDomains.length === 0 ? (
            <span className="site-multiselect__empty">No domains match</span>
          ) : (
            filteredDomains.map((domain) => (
              <label key={domain} className="site-multiselect__item">
                <input
                  type="checkbox"
                  checked={isChecked(domain)}
                  onChange={() => toggleDomain(domain)}
                />
                {stripProtocol(domain)}
              </label>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
