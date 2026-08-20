import { Download } from 'lucide-react';
import { useMemo } from 'react';
import {
  DEFAULT_FILTER_STATE,
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type FilterState,
  type SourceKey,
} from '../types';
import { availableWeeks } from '../utils/weekFilter';
import { CsvImportButton } from './CsvImportButton';
import { SiteMultiSelect } from './SiteMultiSelect';
import { WeekMultiSelect } from './WeekMultiSelect';

const WEEK_COUNT = 52;

// Hoisted to module level so the reference is stable across renders
const SOURCE_KEYS = Object.keys(OPPORTUNITY_SOURCES) as SourceKey[];

interface FilterBarProps {
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
  availableDomains: string[];
  siteIdMap: Map<string, string>;
  onExport: () => void;
  exportDisabled: boolean;
  onCsvWarning: (warning: { message: string; rows: { siteId: string; baseUrl: string }[] }) => void;
}

export function FilterBar({
  filter,
  onFilterChange,
  availableDomains,
  siteIdMap,
  onExport,
  exportDisabled,
  onCsvWarning,
}: FilterBarProps) {
  // availableWeeks already returns most-recent-first chronologically
  const weekOptions = useMemo(() => availableWeeks(WEEK_COUNT), []);

  const toggleSource = (key: SourceKey) => {
    const next = filter.sourceKeys.includes(key)
      ? filter.sourceKeys.filter((k) => k !== key)
      : [...filter.sourceKeys, key];
    onFilterChange({ ...filter, sourceKeys: next });
  };

  const toggleTier = (tier: CustomerGroup) => {
    const next = filter.tiers.includes(tier)
      ? filter.tiers.filter((t) => t !== tier)
      : [...filter.tiers, tier];
    onFilterChange({ ...filter, tiers: next });
  };

  return (
    <div className="filter-bar" role="toolbar" aria-orientation="horizontal" aria-label="Dashboard filters">
      <span className="filter-bar__label">FILTER</span>

      {/* Week selector */}
      <WeekMultiSelect
        availableWeeks={weekOptions}
        selectedWeeks={filter.weeks}
        onChange={(next) => onFilterChange({ ...filter, weeks: next })}
      />

      <span className="filter-bar__sep" aria-hidden="true">|</span>

      {/* Audit type toggles */}
      <div className="filter-bar__group">
        {SOURCE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter.sourceKeys.includes(key)}
            className={`filter-bar__toggle${filter.sourceKeys.includes(key) ? ' filter-bar__toggle--on' : ''}`}
            onClick={() => toggleSource(key)}
          >
            {OPPORTUNITY_SOURCES[key].label}
          </button>
        ))}
      </div>

      <span className="filter-bar__sep" aria-hidden="true">|</span>

      {/* Site multi-select + CSV import */}
      <SiteMultiSelect
        availableDomains={availableDomains}
        selectedSites={filter.selectedSites}
        onChange={(next) => onFilterChange({ ...filter, selectedSites: next })}
      />
      <CsvImportButton
        siteIdMap={siteIdMap}
        onChange={(next) => onFilterChange({ ...filter, selectedSites: next })}
        onWarning={(w) => onCsvWarning(w)}
      />

      <span className="filter-bar__sep" aria-hidden="true">|</span>

      {/* Tier toggles */}
      <div className="filter-bar__group">
        {(['paid', 'trial'] as CustomerGroup[]).map((tier) => (
          <button
            key={tier}
            type="button"
            aria-pressed={filter.tiers.includes(tier)}
            className={`filter-bar__toggle${filter.tiers.includes(tier) ? ' filter-bar__toggle--on' : ''}`}
            onClick={() => toggleTier(tier)}
          >
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </button>
        ))}
      </div>

      <span className="filter-bar__sep" aria-hidden="true">|</span>

      {/* Clear all filters */}
      <button
        type="button"
        className="filter-bar__clear-all"
        aria-label="Clear all filters — reset to current week, all sources, all tiers"
        onClick={() => onFilterChange(DEFAULT_FILTER_STATE)}
      >
        ✕ Clear
      </button>

      <span className="filter-bar__spacer" />

      <button
        type="button"
        className="filter-bar__action-btn"
        onClick={onExport}
        disabled={exportDisabled}
      >
        <Download size={14} aria-hidden="true" />
        Export CSV
      </button>
    </div>
  );
}
