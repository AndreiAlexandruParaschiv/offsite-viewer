import { useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SpacecatClient } from './api/spacecat';
import { ConnectionBar } from './components/ConnectionBar';
import { FilterBar } from './components/FilterBar';
import { Toast } from './components/Toast';
import { HealthSummary } from './components/HealthSummary';
import { CustomerSection } from './components/CustomerSection';
import {
  API_DEFAULT_BASE_URL,
  DEFAULT_FILTER_STATE,
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type FetchStatus,
  type FilterState,
  type SiteOpportunityRow,
  type SourceKey,
  type SpacecatEntitlement,
  type SpacecatSite,
} from './types';
import { mapWithConcurrency } from './utils/concurrency';
import {
  buildSiteRow,
  countCurrentSuggestions,
  findLlmoEntitlement,
  groupRows,
  isInternalTestCustomer,
  isLlmoSite,
  resolveCustomerGroup,
  toCsvExportBrief,
} from './utils/dashboard';

const TOKEN_STORAGE_KEY = 'offsite-viewer.token';
const BASE_URL_STORAGE_KEY = 'offsite-viewer.baseUrl';

// Entitlement lookups are one lightweight call per org (fewer orgs than
// sites), so a higher concurrency is safe. Opportunity lookups return more
// data per site; keep that pool smaller to avoid tripping API rate limits.
const ENTITLEMENT_FETCH_CONCURRENCY = 20;
const OPPORTUNITY_FETCH_CONCURRENCY = 12;

// One extra API call per opportunity — the opportunity object itself carries
// no suggestion count. Returns a map keyed by opportunity ID. Failures are
// left absent from the result rather than surfaced, since a missing count is
// much less disruptive here than a failed site load.
const fetchSuggestionCountsByOppId = async (
  client: SpacecatClient,
  siteId: string,
  row: SiteOpportunityRow,
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  // Collect all opportunity IDs from allOpportunitiesBySource
  const allOpps = Object.values(row.allOpportunitiesBySource).flat();
  await Promise.all(
    allOpps.map(async (opp) => {
      try {
        const suggestions = await client.getOpportunitySuggestions(siteId, opp.id);
        counts[opp.id] = countCurrentSuggestions(suggestions);
      } catch {
        // leave absent on failure
      }
    }),
  );
  return counts;
};

const fetchRow = async (
  client: SpacecatClient,
  site: SpacecatSite,
  entitlements: SpacecatEntitlement[],
  hasSemrush: boolean,
): Promise<SiteOpportunityRow> => {
  try {
    const opportunities = await client.getSiteOpportunities(site.id);
    return buildSiteRow({ site, opportunities, entitlements, hasSemrush });
  } catch (siteError) {
    return buildSiteRow({
      site,
      opportunities: [],
      entitlements,
      hasSemrush,
      loadError: siteError instanceof Error ? siteError.message : 'Opportunity load failed',
    });
  }
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
  // Trial isn't loaded on initial Load (see loadDashboard) — it's opt-in via
  // its own button. Drives that button's label (Load vs Refresh).
  const [trialLoaded, setTrialLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [csvWarning, setCsvWarning] = useState<{ message: string; rows: { siteId: string; baseUrl: string }[] } | null>(null);

  // Snapshot from the last full Load, kept around so "Refresh paid
  // customers" can re-fetch just paid sites' opportunities without
  // re-listing sites or re-fetching every org's entitlements.
  const loadContextRef = useRef<{
    client: SpacecatClient;
    sites: SpacecatSite[];
    entitlementsByOrg: Map<string, SpacecatEntitlement[]>;
    semrushByOrg: Map<string, boolean>;
  } | null>(null);

  // Track which site IDs have already had suggestion counts fetched so we
  // don't re-fetch on every expand toggle.
  const fetchedSiteIds = useRef<Set<string>>(new Set());

  const groupedRows = useMemo(() => groupRows(dataset.rows), [dataset.rows]);
  const visibleRows = useMemo(
    () => [...groupedRows.paid, ...groupedRows.trial],
    [groupedRows.paid, groupedRows.trial],
  );
  const availableDomains = useMemo(() => visibleRows.map((r) => r.baseURL), [visibleRows]);
  const siteIdMap = useMemo(
    () => new Map(visibleRows.map((r) => [r.siteId, r.baseURL])),
    [visibleRows],
  );

  // Rows after applying the filter bar selections (tiers + site allowlist).
  // Used for HealthSummary so the stats cards reflect the same subset as the tables.
  const filteredVisibleRows = useMemo(() => {
    return visibleRows.filter((row) => {
      if (!filter.tiers.includes(row.customerGroup)) return false;
      if (filter.selectedSites !== null && !filter.selectedSites.includes(row.baseURL)) return false;
      return true;
    });
  }, [visibleRows, filter.tiers, filter.selectedSites]);

  const filterLabel = useMemo(() => {
    const sourceCount = Object.keys(OPPORTUNITY_SOURCES).length;
    const parts: string[] = [];
    if (filter.weeks.length === 1) parts.push(filter.weeks[0]);
    else parts.push(`${filter.weeks.length} weeks`);
    if (filter.sourceKeys.length === sourceCount) parts.push('All audit types');
    else parts.push(filter.sourceKeys.map((k) => OPPORTUNITY_SOURCES[k].label).join(' · '));
    parts.push(filter.selectedSites === null ? 'All sites' : filter.selectedSites.length === 0 ? 'No sites' : `${filter.selectedSites.length} sites`);
    if (filter.tiers.length >= 2) parts.push('All tiers');
    else if (filter.tiers.length === 0) parts.push('No tiers');
    else parts.push(filter.tiers.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' · '));
    return parts.join(' · ');
  }, [filter]);

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
      // Semrush integration is an org-level flag (org.semrushWorkspaceId
      // non-null) fetched once per org, in parallel with entitlements.
      const semrushByOrg = new Map<string, boolean>();

      setProgress(`Loading entitlements for ${organizationIds.length} organizations`);

      await mapWithConcurrency(organizationIds, ENTITLEMENT_FETCH_CONCURRENCY, async (organizationId) => {
        const [entitlements, hasSemrush] = await Promise.all([
          client.getEntitlements(organizationId).catch(() => [] as SpacecatEntitlement[]),
          client
            .getOrganization(organizationId)
            .then((organization) => Boolean(organization?.semrushWorkspaceId))
            .catch(() => false),
        ]);
        entitlementsByOrg.set(organizationId, entitlements);
        semrushByOrg.set(organizationId, hasSemrush);
      });

      loadContextRef.current = { client, sites: llmoSites, entitlementsByOrg, semrushByOrg };
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

      // Initial Load fetches Paid sites only. Trial (which can be thousands of
      // rows) is loaded on demand via its own button — rendering that many
      // rows at once is what pushes the tab into an "Aw, Snap!" crash.
      setTrialLoaded(false);
      const paidSites = llmoSites.filter((site) => customerGroupBySite.get(site.id) === 'paid');

      setProgress(`Loading opportunities for ${paidSites.length} paid sites`);

      const rowsById = new Map<string, SiteOpportunityRow>();
      const publishDataset = createDatasetPublisher(rowsById, setDataset);

      await mapWithConcurrency(paidSites, OPPORTUNITY_FETCH_CONCURRENCY, async (site, index) => {
        const percent = Math.round(((index + 1) / paidSites.length) * 100);
        setProgress(
          `Loading paid site ${index + 1} of ${paidSites.length} (${percent}%): ${site.baseURL}`,
        );

        const entitlements = entitlementsByOrg.get(site.organizationId) ?? [];
        const hasSemrush = semrushByOrg.get(site.organizationId) ?? false;
        const row = await fetchRow(client, site, entitlements, hasSemrush);

        rowsById.set(row.siteId, row);
        publishDataset();
      });

      publishDataset(true);
      setStatus('success');
      setProgress(`Loaded ${rowsById.size} paid sites — load Trial customers separately below`);
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
        const hasSemrush = context.semrushByOrg.get(site.organizationId) ?? false;
        const row = await fetchRow(context.client, site, entitlements, hasSemrush);

        rowsById.set(row.siteId, row);
        publishDataset();
      });

      publishDataset(true);
      if (group === 'trial') {
        setTrialLoaded(true);
      }
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

  // Flips a single opportunity's status in production via PATCH — NEW <->
  // IGNORED. Called only after ConfirmationModal confirms in SourceSubTable;
  // no second window.confirm() here.
  const onToggleStatus = async (
    row: SiteOpportunityRow,
    sourceKey: SourceKey,
    opportunityId: string,
    newStatus: 'NEW' | 'IGNORED',
  ): Promise<void> => {
    const context = loadContextRef.current;
    if (!context) return;
    // Safety: this is called only after ConfirmationModal confirmation in SourceSubTable
    await context.client.updateOpportunityStatus(row.siteId, opportunityId, newStatus);
    setDataset((current) => ({
      ...current,
      rows: current.rows.map((r) => {
        if (r.siteId !== row.siteId) return r;
        const newIndicator = newStatus === 'NEW' ? 'visible' : 'ignored';
        const updatedOpps = (r.allOpportunitiesBySource[sourceKey] ?? []).map((opp) =>
          opp.id === opportunityId ? { ...opp, status: newStatus, updatedAt: new Date().toISOString() } : opp,
        );
        return {
          ...r,
          allOpportunitiesBySource: { ...r.allOpportunitiesBySource, [sourceKey]: updatedOpps },
          indicators: { ...r.indicators, [sourceKey]: newIndicator },
          opportunityDates: { ...r.opportunityDates, [sourceKey]: new Date().toISOString() },
        };
      }),
    }));
  };

  // Deletes an opportunity in production. Called only after ConfirmationModal
  // confirms in SourceSubTable; no second window.confirm() here.
  const onDeleteOpportunity = async (
    row: SiteOpportunityRow,
    opportunityId: string,
  ): Promise<void> => {
    const context = loadContextRef.current;
    if (!context) return;
    // Safety: called only after ConfirmationModal confirmation in SourceSubTable
    await context.client.deleteOpportunity(row.siteId, opportunityId);
    setDataset((current) => ({
      ...current,
      rows: current.rows.map((r) => {
        if (r.siteId !== row.siteId) return r;
        // Remove the deleted opportunity from whichever source it belongs to
        const updatedAllOpps = {} as typeof r.allOpportunitiesBySource;
        for (const [k, opps] of Object.entries(r.allOpportunitiesBySource)) {
          updatedAllOpps[k as SourceKey] = opps.filter((o) => o.id !== opportunityId);
        }
        return { ...r, allOpportunitiesBySource: updatedAllOpps };
      }),
    }));
  };

  // Lazily fetches suggestion counts when a row is first expanded.
  const onExpandRow = async (siteId: string): Promise<void> => {
    const context = loadContextRef.current;
    if (!context || fetchedSiteIds.current.has(siteId)) return;
    fetchedSiteIds.current.add(siteId);
    const row = dataset.rows.find((r) => r.siteId === siteId);
    if (!row) return;
    const suggestionCountsByOpportunityId = await fetchSuggestionCountsByOppId(
      context.client,
      siteId,
      row,
    );
    setDataset((current) => ({
      ...current,
      rows: current.rows.map((r) =>
        r.siteId === siteId ? { ...r, suggestionCountsByOpportunityId } : r,
      ),
    }));
  };

  const downloadBlob = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleExportSites = () => {
    if (!filteredVisibleRows.length) return;

    const now = new Date();
    // Filename timestamp: YYYY-MM-DD-HH-MM-SS-mmm
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
      String(now.getMilliseconds()).padStart(3, '0'),
    ].join('-');

    downloadBlob(
      toCsvExportBrief(filteredVisibleRows, filter.weeks, filter.sourceKeys, filter.tiers),
      `abv-offsite-operational-brief-${ts}.csv`,
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Adobe Brand Visibility</p>
          <h1>Offsite Opportunities</h1>
        </div>
        <div className="header-status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span title={__APP_BUILD_DATE__ ? `Built from commit dated ${__APP_BUILD_DATE__}` : undefined}>
            Production {__APP_VERSION__}
          </span>
        </div>
      </header>
      <ConnectionBar
        baseUrl={baseUrl}
        token={token}
        status={status}
        statusText={progress}
        onBaseUrlChange={setBaseUrl}
        onTokenChange={setToken}
        onLoad={loadDashboard}
      />
      {error ? <div className="load-error">{error}</div> : null}
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        availableDomains={availableDomains}
        siteIdMap={siteIdMap}
        onExport={handleExportSites}
        exportDisabled={filteredVisibleRows.length === 0}
        onCsvWarning={(w) => setCsvWarning(w)}
      />
      {csvWarning ? (
        <Toast
          message={csvWarning.message}
          rows={csvWarning.rows}
          onDismiss={() => setCsvWarning(null)}
        />
      ) : null}
      <HealthSummary
        rows={filteredVisibleRows}
        weeks={filter.weeks}
        enabledSourceKeys={filter.sourceKeys}
        filterLabel={filterLabel}
      />
      <hr className="section-divider" />
      <section className="legend-section" aria-label="Status legend">
        <p className="legend-line">
          <span className="legend--new">● Visible</span> — produced & visible to customer &nbsp;&nbsp;
          <span className="legend--ign">● Hidden</span> — produced, but suppressed &nbsp;&nbsp;
          <span className="legend--not">○ Not Produced</span> — no opportunity produced in selected week(s), audit types, sites, and tiers
        </p>
      </section>
      <hr className="section-divider" />
      <CustomerSection
        title="Paid customers"
        rows={groupedRows.paid}
        filter={filter}
        onRefresh={() => { void refreshCustomerGroup('paid'); }}
        refreshDisabled={status === 'loading' || !hasLoadContext || groupedRows.paid.length === 0}
        refreshedAt={dataset.generatedAt || undefined}
        refreshedCount={groupedRows.paid.length || undefined}
        onToggleStatus={onToggleStatus}
        onDeleteOpportunity={onDeleteOpportunity}
        onExpandRow={onExpandRow}
      />
      <CustomerSection
        title="Trial customers"
        rows={groupedRows.trial}
        filter={filter}
        onRefresh={() => { void refreshCustomerGroup('trial'); }}
        refreshLabel={trialLoaded ? 'Refresh' : 'Load'}
        refreshDisabled={status === 'loading' || !hasLoadContext}
        onToggleStatus={onToggleStatus}
        onDeleteOpportunity={onDeleteOpportunity}
        onExpandRow={onExpandRow}
      />
    </div>
  );
}

export default App;
