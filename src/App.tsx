import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SpacecatClient } from './api/spacecat';
import { CustomerTable } from './components/CustomerTable';
import {
  API_DEFAULT_BASE_URL,
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type FetchStatus,
  type SiteOpportunityRow,
  type SpacecatEntitlement,
} from './types';
import { mapWithConcurrency } from './utils/concurrency';
import {
  buildSiteRow,
  customerGroupFromTier,
  findLlmoEntitlement,
  formatIsoWeek,
  getOverviewCounts,
  groupRows,
  isLlmoSite,
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

const formatTimestamp = (value?: string) => {
  if (!value) {
    return 'Not loaded';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

      const customerGroupBySite = new Map(
        llmoSites.map((site) => [
          site.id,
          customerGroupFromTier(
            findLlmoEntitlement(entitlementsByOrg.get(site.organizationId) ?? [])?.tier,
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
      const publishDataset = () => {
        const sortedRows = [...rowsById.values()].sort((a, b) =>
          a.siteName.localeCompare(b.siteName),
        );
        setDataset({ rows: sortedRows, generatedAt: new Date().toISOString() });
      };

      await mapWithConcurrency(orderedSites, OPPORTUNITY_FETCH_CONCURRENCY, async (site, index) => {
        const percent = Math.round(((index + 1) / orderedSites.length) * 100);
        setProgress(
          `Loading site ${index + 1} of ${orderedSites.length} (${percent}%): ${site.baseURL}`,
        );

        const entitlements = entitlementsByOrg.get(site.organizationId) ?? [];

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

        rowsById.set(row.siteId, row);
        publishDataset();
      });

      setStatus('success');
      setProgress(`Loaded ${rowsById.size} LLMO sites`);
    } catch (loadError) {
      setStatus('error');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data');
      setProgress('');
    }
  };

  const canLoad = status !== 'loading' && token.trim().length > 0 && baseUrl.trim().length > 0;
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
          <span>Production v1</span>
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
      />
      <CustomerTable title="Trial customers" rows={groupedRows.trial} defaultOpen />
    </main>
  );
}

export default App;
