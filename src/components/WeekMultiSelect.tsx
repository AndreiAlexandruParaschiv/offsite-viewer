import { useMemo, useRef, useState } from 'react';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { formatWeekLabel, weekSuffix } from '../utils/weekFilter';

interface WeekMultiSelectProps {
  availableWeeks: string[];
  selectedWeeks: string[];  // never empty — at least one week must be selected
  onChange: (next: string[]) => void;
}

export function WeekMultiSelect({ availableWeeks, selectedWeeks, onChange }: WeekMultiSelectProps) {
  const [search, setSearch] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const allSelected = selectedWeeks.length === availableWeeks.length;

  useOutsideClick([detailsRef], () => { if (detailsRef.current) detailsRef.current.open = false; });

  const filteredWeeks = useMemo(
    () =>
      search.trim()
        ? availableWeeks.filter((w) => w.toLowerCase().includes(search.trim().toLowerCase()))
        : availableWeeks,
    [availableWeeks, search],
  );

  const summaryLabel = allSelected
    ? 'All weeks'
    : selectedWeeks.length === 1
      ? selectedWeeks[0]
      : `${selectedWeeks.length} / ${availableWeeks.length} weeks`;

  const currentWeek = formatWeekLabel(new Date().toISOString());

  const toggleAll = () => {
    if (allSelected) {
      // Collapse to current week — never allow empty
      onChange([currentWeek]);
    } else {
      onChange([...availableWeeks]);
    }
  };

  const toggleWeek = (week: string) => {
    if (selectedWeeks.includes(week)) {
      // Never deselect the last remaining week
      if (selectedWeeks.length === 1) return;
      onChange(selectedWeeks.filter((w) => w !== week));
    } else {
      const next = [...selectedWeeks, week];
      onChange(next.length === availableWeeks.length ? [...availableWeeks] : next);
    }
  };

  return (
    <details ref={detailsRef} className="site-multiselect">
      <summary className="filter-bar__toggle site-multiselect__summary">
        {summaryLabel} ▾
      </summary>
      <div className="site-multiselect__panel">
        <input
          className="site-multiselect__search"
          type="search"
          placeholder="Search weeks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search weeks"
        />
        <label className="site-multiselect__item site-multiselect__item--all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
          />
          All weeks
        </label>
        <div className="site-multiselect__list">
          {filteredWeeks.length === 0 ? (
            <span className="site-multiselect__empty">No weeks match</span>
          ) : (
            filteredWeeks.map((week) => (
              <label key={week} className="site-multiselect__item">
                <input
                  type="checkbox"
                  checked={selectedWeeks.includes(week)}
                  onChange={() => toggleWeek(week)}
                />
                {week}{weekSuffix(week)}
              </label>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
