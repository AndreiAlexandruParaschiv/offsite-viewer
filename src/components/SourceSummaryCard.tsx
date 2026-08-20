import { formatUsd, hallucinationLevel } from '../utils/dashboard';
import { OPPORTUNITY_SOURCES, type SourceKey } from '../types';

interface SourceCardCounts {
  visible: number;
  ignored: number;
  notProduced: number;
  total: number;
  qaHallucinatedCount: number;
  qaAnalyzedCount: number;
  costUsd: number;      // total (NaN for wikipedia)
  costNewUsd: number;   // cost of NEW (visible) opps only
  costIgnoredUsd: number; // cost of IGNORED opps only
}

interface SourceSummaryCardProps {
  sourceKey: SourceKey;
  counts: SourceCardCounts;
}

export function SourceSummaryCard({ sourceKey, counts }: SourceSummaryCardProps) {
  const source = OPPORTUNITY_SOURCES[sourceKey];
  const isMonthly = source.cadence === 'monthly';
  const hallRate = hallucinationRate(counts.qaHallucinatedCount, counts.qaAnalyzedCount);

  return (
    <div className={`source-card${isMonthly ? ' source-card--monthly' : ''}`}>
      <div className="source-card__title">
        {source.label} Analysis
        {isMonthly ? <span className="source-card__cadence">(monthly)</span> : null}
      </div>
      <ul className="source-card__counts">
        <li className="source-card__count source-card__count--new">
          <span className="dot">●</span> {counts.visible} <strong>Visible</strong>
          <span className="pct">{pct(counts.visible, counts.total)}</span>
        </li>
        <li className="source-card__count source-card__count--ignored">
          <span className="dot">●</span> {counts.ignored} <strong>Hidden</strong>
          <span className="pct">{pct(counts.ignored, counts.total)}</span>
        </li>
        <li className="source-card__count source-card__count--not-produced">
          <span className="dot">○</span> {counts.notProduced} <strong>Not Produced</strong>
          <span className="pct">{pct(counts.notProduced, counts.total)}</span>
        </li>
      </ul>
      <div className="source-card__cost">
        {isMonthly || Number.isNaN(counts.costUsd)
          ? 'Cost not tracked'
          : `Visible ${formatUsd(counts.costNewUsd)} · Hidden ${formatUsd(counts.costIgnoredUsd)} · ${formatUsd(counts.costUsd)}`}
      </div>
      <div className={`source-card__hallucination source-card__hallucination--${hallRate.level}`}>
        Hallucination rate: <strong>{hallRate.label}</strong>
      </div>
    </div>
  );
}

const pct = (n: number, total: number) =>
  total === 0 ? '' : `${Math.round((n / total) * 100)}%`;

const hallucinationRate = (hallucinatedCount: number, analyzedCount: number) => {
  if (analyzedCount === 0) return { label: 'N/A', level: 'na' };
  const rate = hallucinatedCount / analyzedCount;
  return { label: `${Math.round(rate * 100)}%`, level: hallucinationLevel(rate) };
};
