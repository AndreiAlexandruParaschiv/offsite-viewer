import { formatUsd, hallucinationLevel } from '../utils/dashboard';

interface TotalsBarProps {
  newCount: number;
  ignoredCount: number;
  notProducedCount: number;
  totalCostUsd: number;
  qaHallucinatedCount: number;
  qaAnalyzedCount: number;
}

export function TotalsBar({ newCount, ignoredCount, notProducedCount, totalCostUsd, qaHallucinatedCount, qaAnalyzedCount }: TotalsBarProps) {
  const produced = newCount + ignoredCount;
  const total = produced + notProducedCount;

  const newPct = total === 0 ? 0 : Math.round((newCount / total) * 100);
  const ignPct = total === 0 ? 0 : Math.round((ignoredCount / total) * 100);
  const notPct = total === 0 ? 0 : 100 - newPct - ignPct;
  const prodPct = newPct + ignPct;

  const hallRate = qaAnalyzedCount === 0 ? null : qaHallucinatedCount / qaAnalyzedCount;
  const hallPct = hallRate === null ? 'N/A' : `${Math.round(hallRate * 100)}%`;
  const hallLevel = hallRate === null ? 'na' : hallucinationLevel(hallRate);

  return (
    <div className="totals-bar">
      <div className="totals-bar__progress">
        <div className="totals-bar__progress-new" style={{ width: `${newPct}%` }} />
        <div className="totals-bar__progress-ign" style={{ width: `${ignPct}%` }} />
        <div className="totals-bar__progress-not" style={{ width: `${notPct}%` }} />
      </div>
      <div className="totals-bar__metrics">
        <TotalsMetric label="Visible" count={newCount} pct={newPct} colorClass="metric--new" />
        <TotalsMetric label="Hidden" count={ignoredCount} pct={ignPct} colorClass="metric--ign" />
        <TotalsMetric label="Produced" count={produced} pct={prodPct} colorClass="metric--produced" />
        <TotalsMetric label="Not Produced" count={notProducedCount} pct={notPct} colorClass="metric--not" />
        <TotalsMetric label="Total Opportunities Target" count={total} colorClass="" />
        <div className={`totals-metric totals-metric--hallucination hallucination--${hallLevel}`}>
          <span className="totals-metric__count">{hallPct}</span>
          <span className="totals-metric__label">Hallucination Rate</span>
        </div>
        <div className="totals-metric totals-metric--cost">
          <span className="totals-metric__count">{formatUsd(totalCostUsd)}</span>
          <span className="totals-metric__label">Total Cost</span>
        </div>
      </div>
    </div>
  );
}

function TotalsMetric({
  label,
  count,
  pct,
  colorClass,
}: {
  label: string;
  count: number;
  pct?: number;
  colorClass: string;
}) {
  return (
    <div className={`totals-metric${colorClass ? ` ${colorClass}` : ''}`}>
      <div className="totals-metric__top">
        <span className="totals-metric__count">{count}</span>
        {pct !== undefined && pct > 0 ? (
          <span className={`totals-metric__pct-pill${colorClass ? ` ${colorClass}` : ''}`}>{pct}%</span>
        ) : null}
      </div>
      <span className="totals-metric__label">{label}</span>
    </div>
  );
}
