import { Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { OPPORTUNITY_SOURCES, type SiteOpportunityRow, type SourceKey } from '../types';
import { computeFilteredIndicator, extractLlmUsage, extractQaVerdict } from '../utils/dashboard';
import { opportunityTouchedInWeeks } from '../utils/weekFilter';
import { SourceSummaryCard } from './SourceSummaryCard';
import { TotalsBar } from './TotalsBar';

// Hoisted to module level — stable reference, no need to include in dep arrays
const sourceEntries = Object.entries(OPPORTUNITY_SOURCES) as Array<
  [SourceKey, (typeof OPPORTUNITY_SOURCES)[SourceKey]]
>;

interface HealthSummaryProps {
  rows: SiteOpportunityRow[];
  weeks: string[];
  enabledSourceKeys: SourceKey[];
  filterLabel: string;
}

function CountingRulesBox({ onClose, wrapRef }: { onClose: () => void; wrapRef: React.RefObject<HTMLSpanElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useOutsideClick([boxRef, wrapRef], onClose);

  return (
    <div ref={boxRef} className="counting-rules-box" role="dialog" aria-label="How numbers are computed">
      <button type="button" className="counting-rules-box__close" onClick={onClose} aria-label="Close">✕</button>
      <h3 className="counting-rules-box__title">How numbers are computed</h3>

      <section className="counting-rules-box__section">
        <h4>One count per site, per audit type</h4>
        <p>The dashboard counts <strong>coverage</strong>, not individual records. For each combination of site and audit type, you get exactly <strong>one</strong> count — whether the system produced one opportunity or ten, the tally only moves by 1.</p>
        <div className="counting-rules-box__example">
          <span className="counting-rules-box__example-label">Example</span>
          adobe.com produced 3 Reddit opportunities in W34 → counts as <strong>+1 Visible</strong>, not +3
        </div>
      </section>

      <section className="counting-rules-box__section">
        <h4>What decides the status?</h4>
        <p>Within the selected week range, the system checks all opportunities for that site + audit type and picks the best outcome:</p>
        <ol>
          <li>If any opportunity is <strong>Visible</strong> (customer-facing) → the slot is <strong>Visible</strong></li>
          <li>Otherwise, if any is <strong>Hidden</strong> (operator-suppressed) → the slot is <strong>Hidden</strong></li>
          <li>If nothing was produced at all → <strong>Not Produced</strong></li>
        </ol>
        <div className="counting-rules-box__example">
          <span className="counting-rules-box__example-label">Example</span>
          adobe.com has 1 Visible + 1 Hidden Reddit opp in the range → the slot counts as <strong>Visible</strong>
        </div>
      </section>

      <section className="counting-rules-box__section">
        <h4>Costs work differently</h4>
        <p>Unlike counts, costs add up every individual opportunity in the selected range — so a site with 3 opportunities contributes 3× the cost even though it adds only 1 to the count.</p>
        <div className="counting-rules-box__example">
          <span className="counting-rules-box__example-label">Example</span>
          3 Reddit opps at $0.10 each → Visible Cost = <strong>$0.30</strong>, Visible count = 1
        </div>
      </section>

      <section className="counting-rules-box__section">
        <h4>Hallucination rate</h4>
        <p>Read directly from the quality gate verdict: <code>flagged items ÷ items evaluated</code> per opportunity (URLs for Cited, videos for YouTube, threads for Reddit). The summary aggregates as a weighted average by items evaluated across the filtered range. Undetermined runs and Wikipedia (no gate) are excluded.</p>
        <div className="counting-rules-box__example">
          <span className="counting-rules-box__example-label">Thresholds</span>
          <span className="hallucination-threshold hallucination-threshold--ok">● &lt; 10% — healthy</span>
          &nbsp;
          <span className="hallucination-threshold hallucination-threshold--warn">● 10–25% — elevated</span>
          &nbsp;
          <span className="hallucination-threshold hallucination-threshold--high">● &gt; 25% — high</span>
        </div>
      </section>
    </div>
  );
}

export function HealthSummary({ rows, weeks, enabledSourceKeys, filterLabel }: HealthSummaryProps) {
  const [showRules, setShowRules] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const cardData = useMemo(
    () =>
      sourceEntries.map(([key, source]) => {
        let visible = 0;
        let ignored = 0;
        let qaHallucinatedCount = 0;
        let qaAnalyzedCount = 0;
        let costUsd = 0;
        let costNewUsd = 0;
        let costIgnoredUsd = 0;
        rows.forEach((row) => {
          const allOpps = row.allOpportunitiesBySource[key] ?? [];
          const result = computeFilteredIndicator(allOpps, source.opportunityType, weeks);
          if (result.indicator === 'visible') visible++;
          else if (result.indicator === 'ignored') ignored++;

          const filteredOpps = weeks.length === 0
            ? allOpps
            : allOpps.filter((o) => opportunityTouchedInWeeks(o, weeks));
          filteredOpps.forEach((opp) => {
            const oppCost = extractLlmUsage(opp)?.totalCostUsd ?? 0;
            costUsd += oppCost;
            if (opp.status?.toUpperCase() === 'NEW') costNewUsd += oppCost;
            else if (opp.status?.toUpperCase() === 'IGNORED') costIgnoredUsd += oppCost;
            const qa = extractQaVerdict(opp);
            if (qa?.rateDetermined) {
              qaHallucinatedCount += qa.hallucinatedCount;
              qaAnalyzedCount += qa.analyzedCount;
            }
          });
        });
        return {
          key,
          counts: {
            visible,
            ignored,
            notProduced: rows.length - visible - ignored,
            total: rows.length,
            qaHallucinatedCount,
            qaAnalyzedCount,
            costUsd: source.cadence === 'monthly' ? NaN : costUsd,
            costNewUsd: source.cadence === 'monthly' ? 0 : costNewUsd,
            costIgnoredUsd: source.cadence === 'monthly' ? 0 : costIgnoredUsd,
          },
        };
      }),
    [rows, weeks],
  );

  const totals = useMemo(() => {
    const enabled = cardData.filter(({ key }) => enabledSourceKeys.includes(key));
    return enabled.reduce(
      (acc, { counts }) => ({
        newCount: acc.newCount + counts.visible,
        ignoredCount: acc.ignoredCount + counts.ignored,
        notProducedCount: acc.notProducedCount + counts.notProduced,
        totalCostUsd: acc.totalCostUsd + (Number.isNaN(counts.costUsd) ? 0 : counts.costUsd),
        qaHallucinatedCount: acc.qaHallucinatedCount + counts.qaHallucinatedCount,
        qaAnalyzedCount: acc.qaAnalyzedCount + counts.qaAnalyzedCount,
      }),
      { newCount: 0, ignoredCount: 0, notProducedCount: 0, totalCostUsd: 0, qaHallucinatedCount: 0, qaAnalyzedCount: 0 },
    );
  }, [cardData, enabledSourceKeys]);

  return (
    <section className="health-summary" aria-label="Health summary">
      <p className="health-summary__label">
        <span ref={wrapRef} className="health-summary__info-wrap">
          <button
            type="button"
            className={`health-summary__info-btn${showRules ? ' health-summary__info-btn--active' : ''}`}
            aria-label="How numbers are computed"
            onClick={() => setShowRules((v) => !v)}
          >
            <Info size={13} aria-hidden="true" />
          </button>
          {showRules && <CountingRulesBox onClose={() => setShowRules(false)} wrapRef={wrapRef} />}
        </span>
        OPERATIONAL BRIEF &nbsp;·&nbsp; {filterLabel}
      </p>
      <div className="health-summary__cards">
        {cardData
          .filter(({ key }) => enabledSourceKeys.includes(key))
          .map(({ key, counts }) => (
            <SourceSummaryCard key={key} sourceKey={key} counts={counts} />
          ))}
      </div>
      <TotalsBar {...totals} />
    </section>
  );
}
