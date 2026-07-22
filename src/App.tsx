import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { SpacecatClient } from './api/spacecat';
import { CustomerTable } from './components/CustomerTable';
import {
  API_DEFAULT_BASE_URL,
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type FetchStatus,
  type MissingOpportunityInfo,
  type OpportunityIndicator,
  type SiteOpportunityRow,
  type SourceKey,
  type SpacecatEntitlement,
  type SpacecatSite,
} from './types';
import { mapWithConcurrency } from './utils/concurrency';
import {
  buildSiteRow,
  explainMissingOpportunity,
  findLlmoEntitlement,
  formatIsoWeek,
  getAuditCoverage,
  getOverviewCounts,
  groupRows,
  isInternalTestCustomer,
  isLlmoSite,
  resolveCustomerGroup,
  toCsv,
} from './utils/dashboard';

const TOKEN_STORAGE_KEY = 'offsite-viewer.token';
const BASE_URL_STORAGE_KEY = 'offsite-viewer.baseUrl';

// Paid sites load first so the Paid customers table fills in before trial/free
// sites (which can outnumber paid ones considerably) finish loading.
const CUSTOMER_GROUP_LOAD_PRIORITY: Record<CustomerGroup, number> = {
  paid: 0,
  trial: 1,
  free: 2,
};

// Entitlement lookups are one lightweight call per org (fewer orgs than
// sites), so a higher concurrency is safe. Opportunity lookups return more
// data per site; keep that pool smaller to avoid tripping API rate limits.
const ENTITLEMENT_FETCH_CONCURRENCY = 20;
const OPPORTUNITY_FETCH_CONCURRENCY = 12;

const sourceKeysList = Object.keys(OPPORTUNITY_SOURCES) as SourceKey[];

const formatTimestamp = (value?: string) => {
  if (!value) {
    return 'Not loaded';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

// One extra API call per visible/ignored opportunity — the opportunity
// object itself carries no suggestion count. Failures are left absent from
// the result rather than surfaced, since a missing count is much less
// disruptive here than a failed site load.
const fetchSuggestionCounts = async (
  client: SpacecatClient,
  siteId: string,
  row: SiteOpportunityRow,
): Promise<Partial<Record<SourceKey, number>>> => {
  const counts: Partial<Record<SourceKey, number>> = {};

  await Promise.all(
    sourceKeysList.map(async (sourceKey) => {
      const opportunityId = row.opportunityIds[sourceKey];
      if (!opportunityId) {
        return;
      }

      try {
        const suggestions = await client.getOpportunitySuggestions(siteId, opportunityId);
        counts[sourceKey] = suggestions.length;
      } catch {
        // leave this source absent from counts on failure
      }
    }),
  );

  return counts;
};

// One extra API call per missing source — each source's own latest audit
// (GET /sites/{siteId}/latest-audit/{opportunityType}) explains whether it
// genuinely failed vs ran fine with nothing to report. Failures are left
// absent from the result rather than surfaced, same reasoning as suggestion
// counts.
const fetchMissingInfo = async (
  client: SpacecatClient,
  siteId: string,
  row: SiteOpportunityRow,
): Promise<Partial<Record<SourceKey, MissingOpportunityInfo>>> => {
  const info: Partial<Record<SourceKey, MissingOpportunityInfo>> = {};

  await Promise.all(
    sourceKeysList.map(async (sourceKey) => {
      if (row.indicators[sourceKey] !== 'missing') {
        return;
      }

      try {
        const audit = await client.getLatestAudit(siteId, OPPORTUNITY_SOURCES[sourceKey].opportunityType);
        const explanation = explainMissingOpportunity(row.indicators[sourceKey], audit);
        if (explanation) {
          info[sourceKey] = explanation;
        }
      } catch {
        // leave this source absent from info on failure
      }
    }),
  );

  return info;
};

const fetchRow = async (
  client: SpacecatClient,
  site: SpacecatSite,
  entitlements: SpacecatEntitlement[],
  includePaidExtras: boolean,
): Promise<SiteOpportunityRow> => {
  let row: SiteOpportunityRow;

  try {
    const opportunities = await client.getSiteOpportunities(site.id);
    row = buildSiteRow({ site, opportunities, entitlements });
  } catch (siteError) {
    row = buildSiteRow({
      site,
      opportunities: [],
      entitlements,
      loadError: siteError instanceof Error ? siteError.message : 'Opportunity load failed',
    });
  }

  if (includePaidExtras) {
    const [suggestionCounts, missingInfo] = await Promise.all([
      fetchSuggestionCounts(client, site.id, row),
      fetchMissingInfo(client, site.id, row),
    ]);
    row.suggestionCounts = suggestionCounts;
    row.missingInfo = missingInfo;
  }

  return row;
};

// Publishing the dataset re-sorts every row (localeCompare) and re-renders the
// full, non-virtualized tables. Doing that on every single site completion is
// O(n^2) sorting plus n table reconciliations, which on large accounts (12k+
// sites) thrashes memory hard enough to crash the tab ("Aw, Snap!"). Throttle
// to at most one publish per interval so the UI still fills in live, with a
// forced final flush so the last rows always land.
const createDatasetPublisher = (
  rowsById: Map<string, SiteOpportunityRow>,
  publish: (dataset: DashboardDataset) => void,
  intervalMs = 500,
) => {
  let lastPublish = 0;

  return (force = false) => {
    const now = Date.now();
    if (!force && now - lastPublish < intervalMs) {
      return;
    }

    lastPublish = now;
    const sortedRows = [...rowsById.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
    publish({ rows: sortedRows, generatedAt: new Date().toISOString() });
  };
};

const downloadCsv = (dataset: DashboardDataset, filenamePrefix: string) => {
  const csv = toCsv(dataset);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

function App() {
  const [baseUrl, setBaseUrl] = useState(
    () => sessionStorage.getItem(BASE_URL_STORAGE_KEY) ?? API_DEFAULT_BASE_URL,
  );
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [dataset, setDataset] = useState<DashboardDataset>({ rows: [], generatedAt: '' });
  const [hasLoadContext, setHasLoadContext] = useState(false);

  // Snapshot from the last full Load, kept around so "Refresh paid
  // customers" can re-fetch just paid sites' opportunities without
  // re-listing sites or re-fetching every org's entitlements.
  const loadContextRef = useRef<{
    client: SpacecatClient;
    sites: SpacecatSite[];
    entitlementsByOrg: Map<string, SpacecatEntitlement[]>;
  } | null>(null);

  const groupedRows = useMemo(() => groupRows(dataset.rows), [dataset.rows]);
  const visibleRows = useMemo(
    () => [...groupedRows.paid, ...groupedRows.trial],
    [groupedRows.paid, groupedRows.trial],
  );
  const visibleDataset = useMemo(
    () => ({ rows: visibleRows, generatedAt: dataset.generatedAt }),
    [dataset.generatedAt, visibleRows],
  );
  const paidDataset = useMemo(
    () => ({ rows: groupedRows.paid, generatedAt: dataset.generatedAt }),
    [dataset.generatedAt, groupedRows.paid],
  );
  const overviewCounts = useMemo(() => getOverviewCounts(visibleRows), [visibleRows]);
  const paidOverviewCounts = useMemo(() => getOverviewCounts(groupedRows.paid), [groupedRows.paid]);
  const trialOverviewCounts = useMemo(
    () => getOverviewCounts(groupedRows.trial),
    [groupedRows.trial],
  );
  // Audit-run coverage (did the underlying audit actually run?) is only ever
  // fetched for Paid rows — see fetchMissingInfo in fetchRow — so this is
  // scoped to Paid only, not visibleRows. Split by cadence (reddit/youtube/
  // cited run weekly, wikipedia runs monthly) so the two aren't averaged
  // together into one misleading number.
  const paidWeeklyAuditCoverage = useMemo(
    () => getAuditCoverage(groupedRows.paid, 'weekly'),
    [groupedRows.paid],
  );
  const paidMonthlyAuditCoverage = useMemo(
    () => getAuditCoverage(groupedRows.paid, 'monthly'),
    [groupedRows.paid],
  );

  const loadDashboard = async () => {
    setStatus('loading');
    setError('');
    setProgress('Loading sites');
    sessionStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);

    try {
      const client = new SpacecatClient({ baseUrl, token });
      const allSites = await client.getAllSites();
      const llmoSites = allSites.filter(isLlmoSite);
      const organizationIds = [...new Set(llmoSites.map((site) => site.organizationId))];
      const entitlementsByOrg = new Map<string, SpacecatEntitlement[]>();

      setProgress(`Loading entitlements for ${organizationIds.length} organizations`);

      await mapWithConcurrency(organizationIds, ENTITLEMENT_FETCH_CONCURRENCY, async (organizationId) => {
        try {
          entitlementsByOrg.set(organizationId, await client.getEntitlements(organizationId));
        } catch {
          entitlementsByOrg.set(organizationId, []);
        }
      });

      loadContextRef.current = { client, sites: llmoSites, entitlementsByOrg };
      setHasLoadContext(true);

      const customerGroupBySite = new Map(
        llmoSites.map((site) => [
          site.id,
          resolveCustomerGroup(
            findLlmoEntitlement(entitlementsByOrg.get(site.organizationId) ?? [])?.tier,
            site.id,
          ),
        ]),
      );

      const orderedSites = [...llmoSites].sort(
        (a, b) =>
          CUSTOMER_GROUP_LOAD_PRIORITY[customerGroupBySite.get(a.id) ?? 'free'] -
          CUSTOMER_GROUP_LOAD_PRIORITY[customerGroupBySite.get(b.id) ?? 'free'],
      );

      setProgress(`Loading opportunities for ${orderedSites.length} LLMO sites`);

      const rowsById = new Map<string, SiteOpportunityRow>();
      const publishDataset = createDatasetPublisher(rowsById, setDataset);

      await mapWithConcurrency(orderedSites, OPPORTUNITY_FETCH_CONCURRENCY, async (site, index) => {
        const percent = Math.round(((index + 1) / orderedSites.length) * 100);
        setProgress(
          `Loading site ${index + 1} of ${orderedSites.length} (${percent}%): ${site.baseURL}`,
        );

        const entitlements = entitlementsByOrg.get(site.organizationId) ?? [];
        const row = await fetchRow(
          client,
          site,
          entitlements,
          customerGroupBySite.get(site.id) === 'paid',
        );

        rowsById.set(row.siteId, row);
        publishDataset();
      });

      publishDataset(true);
      setStatus('success');
      setProgress(`Loaded ${rowsById.size} LLMO sites`);
    } catch (loadError) {
      setStatus('error');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data');
      setProgress('');
    }
  };

  // Suggestion counts stay paid-only (bounded API cost — see fetchRow), so a
  // trial refresh skips that extra per-opportunity call entirely.
  const refreshCustomerGroup = async (group: CustomerGroup) => {
    const context = loadContextRef.current;
    if (!context) {
      return;
    }

    const groupSites = context.sites.filter((site) => {
      const isInGroup =
        resolveCustomerGroup(
          findLlmoEntitlement(context.entitlementsByOrg.get(site.organizationId) ?? [])?.tier,
          site.id,
        ) === group;

      return (
        isInGroup &&
        !isInternalTestCustomer({
          siteName: site.name || site.baseURL,
          baseURL: site.baseURL,
          organizationId: site.organizationId,
        })
      );
    });

    if (groupSites.length === 0) {
      return;
    }

    setStatus('loading');
    setError('');
    setProgress(`Refreshing ${groupSites.length} ${group} sites`);

    const rowsById = new Map(dataset.rows.map((row) => [row.siteId, row]));
    const publishDataset = createDatasetPublisher(rowsById, setDataset);

    try {
      await mapWithConcurrency(groupSites, OPPORTUNITY_FETCH_CONCURRENCY, async (site, index) => {
        const percent = Math.round(((index + 1) / groupSites.length) * 100);
        setProgress(
          `Refreshing ${group} site ${index + 1} of ${groupSites.length} (${percent}%): ${site.baseURL}`,
        );

        const entitlements = context.entitlementsByOrg.get(site.organizationId) ?? [];
        const row = await fetchRow(context.client, site, entitlements, group === 'paid');

        rowsById.set(row.siteId, row);
        publishDataset();
      });

      publishDataset(true);
      setStatus('success');
      setProgress(`Refreshed ${groupSites.length} ${group} sites`);
    } catch (refreshError) {
      setStatus('error');
      setError(
        refreshError instanceof Error ? refreshError.message : `Failed to refresh ${group} customers`,
      );
      setProgress('');
    }
  };

  // Flips a single opportunity's status in production via PATCH — visible
  // (NEW) <-> ignored (IGNORED). Confirms first since this is a real write
  // other tools/teams may also read, not just a display toggle.
  const toggleOpportunityStatus = async (row: SiteOpportunityRow, sourceKey: SourceKey) => {
    const context = loadContextRef.current;
    const currentStatus = row.indicators[sourceKey];
    const opportunityId = row.opportunityIds[sourceKey];

    if (!context || !opportunityId || currentStatus === 'missing') {
      return;
    }

    const nextStatus: OpportunityIndicator = currentStatus === 'visible' ? 'ignored' : 'visible';
    const sourceLabel = OPPORTUNITY_SOURCES[sourceKey].label;

    const confirmed = window.confirm(
      `Set the ${sourceLabel} opportunity for "${row.siteName}" to ${nextStatus === 'visible' ? 'visible (NEW)' : 'ignored'}?\n\nThis updates live production data.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await context.client.updateOpportunityStatus(
        row.siteId,
        opportunityId,
        nextStatus === 'visible' ? 'NEW' : 'IGNORED',
      );
    } catch (toggleError) {
      window.alert(
        `Failed to update ${sourceLabel} status: ${
          toggleError instanceof Error ? toggleError.message : 'unknown error'
        }`,
      );
      return;
    }

    setDataset((current) => ({
      ...current,
      rows: current.rows.map((currentRow) =>
        currentRow.siteId === row.siteId
          ? {
              ...currentRow,
              indicators: { ...currentRow.indicators, [sourceKey]: nextStatus },
              opportunityDates: { ...currentRow.opportunityDates, [sourceKey]: new Date().toISOString() },
            }
          : currentRow,
      ),
    }));
  };

  const canLoad = status !== 'loading' && token.trim().length > 0 && baseUrl.trim().length > 0;
  const canRefreshPaid = status !== 'loading' && hasLoadContext && groupedRows.paid.length > 0;
  const canRefreshTrial = status !== 'loading' && hasLoadContext && groupedRows.trial.length > 0;
  const canExport = visibleRows.length > 0;

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">LLMO coverage</p>
          <h1>Offsite Opportunities Viewer</h1>
          <p className="header-copy">
            Visible offsite opportunities across paid and trial LLMO sites.
          </p>
        </div>
        <div className="header-status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span title={__APP_BUILD_DATE__ ? `Built from commit dated ${__APP_BUILD_DATE__}` : undefined}>
            Production {__APP_VERSION__}
          </span>
        </div>
      </header>

      <section className="control-bar" aria-label="API controls">
        <label>
          API base URL
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={API_DEFAULT_BASE_URL}
          />
        </label>
        <label>
          IMS or session token
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="Bearer token"
          />
        </label>
        <div className="actions">
          <button type="button" onClick={loadDashboard} disabled={!canLoad}>
            <RefreshCw size={16} className={status === 'loading' ? 'spin' : ''} />
            Load
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => downloadCsv(visibleDataset, `offsite-opportunities-${dataset.generatedAt.slice(0, 10)}`)}
            disabled={!canExport}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </section>

      <section className="overview" aria-label="Opportunity overview">
        {(Object.keys(OPPORTUNITY_SOURCES) as Array<keyof typeof OPPORTUNITY_SOURCES>).map(
          (sourceKey) => (
            <div className="metric" key={sourceKey}>
              <span>{OPPORTUNITY_SOURCES[sourceKey].label}</span>
              <strong>{overviewCounts[sourceKey] ?? 0}</strong>
              <small>sites shown with yes</small>
              <small className="metric__breakdown">
                Paid {paidOverviewCounts[sourceKey] ?? 0} &middot; Trial {trialOverviewCounts[sourceKey] ?? 0}
              </small>
            </div>
          ),
        )}
      </section>

      {paidWeeklyAuditCoverage.totalSlots > 0 ? (
        <section className="audit-coverage" aria-label="Paid weekly audit run coverage">
          <span className="audit-coverage__label">
            Paid weekly audit runs (Reddit/YouTube/Cited) &mdash; {paidWeeklyAuditCoverage.totalSlots} total (
            {groupedRows.paid.length} sites &times; 3 sources)
          </span>
          <span className="audit-coverage__stat">
            {paidWeeklyAuditCoverage.ranWithOpportunity} ran &rarr; opportunity created
          </span>
          <span className="audit-coverage__stat audit-coverage__stat--error">
            {paidWeeklyAuditCoverage.ranErrored} ran &rarr; errored out
          </span>
          <span className="audit-coverage__stat">
            {paidWeeklyAuditCoverage.ranNoOpportunity} ran &rarr; no opportunity created
          </span>
          <span className="audit-coverage__stat audit-coverage__stat--unknown">
            {paidWeeklyAuditCoverage.neverRanOrUnknown} never ran / unknown
          </span>
        </section>
      ) : null}

      {paidMonthlyAuditCoverage.totalSlots > 0 ? (
        <section className="audit-coverage" aria-label="Paid monthly audit run coverage">
          <span className="audit-coverage__label">
            Paid monthly audit runs (Wikipedia) &mdash; {paidMonthlyAuditCoverage.totalSlots} total (
            {groupedRows.paid.length} sites &times; 1 source)
          </span>
          <span className="audit-coverage__stat">
            {paidMonthlyAuditCoverage.ranWithOpportunity} ran &rarr; opportunity created
          </span>
          <span className="audit-coverage__stat audit-coverage__stat--error">
            {paidMonthlyAuditCoverage.ranErrored} ran &rarr; errored out
          </span>
          <span className="audit-coverage__stat">
            {paidMonthlyAuditCoverage.ranNoOpportunity} ran &rarr; no opportunity created
          </span>
          <span className="audit-coverage__stat audit-coverage__stat--unknown">
            {paidMonthlyAuditCoverage.neverRanOrUnknown} never ran / unknown
          </span>
        </section>
      ) : null}

      <section className="load-state" aria-live="polite">
        <span className={`load-state__dot load-state__dot--${status}`} />
        <span>{progress || (error ? 'Load failed' : `Last loaded ${formatTimestamp(dataset.generatedAt)}`)}</span>
        {status === 'success' ? <span className="shown-count">{visibleRows.length} sites shown</span> : null}
        {error ? <strong>{error}</strong> : null}
      </section>

      <CustomerTable
        title="Paid customers"
        rows={groupedRows.paid}
        defaultOpen
        onExport={() =>
          downloadCsv(paidDataset, `offsite-opportunities-paid-${formatIsoWeek(dataset.generatedAt)}`)
        }
        onRefresh={() => refreshCustomerGroup('paid')}
        refreshDisabled={!canRefreshPaid}
        onToggleStatus={toggleOpportunityStatus}
        enableAuditCommand
      />
      <CustomerTable
        title="Trial customers"
        rows={groupedRows.trial}
        defaultOpen
        onRefresh={() => refreshCustomerGroup('trial')}
        refreshDisabled={!canRefreshTrial}
        onToggleStatus={toggleOpportunityStatus}
      />
    </main>
  );
}

export default App;
