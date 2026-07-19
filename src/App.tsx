import { Download, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { exchangeImsAccessToken, SpacecatClient } from './api/spacecat';
import { getImsAccessToken, isImsSignedIn, signInWithIms } from './auth/ims';
import { CustomerTable } from './components/CustomerTable';
import {
  API_DEFAULT_BASE_URL,
  OPPORTUNITY_SOURCES,
  type DashboardDataset,
  type FetchStatus,
  type SpacecatEntitlement,
} from './types';
import { mapWithConcurrency } from './utils/concurrency';
import {
  buildSiteRow,
  getOverviewCounts,
  groupRows,
  isLlmoSite,
  toCsv,
} from './utils/dashboard';

const BASE_URL_STORAGE_KEY = 'offsite-viewer.baseUrl';

type ImsStatus = 'checking' | 'signed-out' | 'signed-in' | 'error';

const formatTimestamp = (value?: string) => {
  if (!value) {
    return 'Not loaded';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const downloadCsv = (dataset: DashboardDataset) => {
  const csv = toCsv(dataset);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `offsite-opportunities-${dataset.generatedAt.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

function App() {
  const [baseUrl, setBaseUrl] = useState(
    () => sessionStorage.getItem(BASE_URL_STORAGE_KEY) ?? API_DEFAULT_BASE_URL,
  );
  const [imsStatus, setImsStatus] = useState<ImsStatus>('checking');
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [dataset, setDataset] = useState<DashboardDataset>({ rows: [], generatedAt: '' });

  useEffect(() => {
    isImsSignedIn()
      .then((signedIn) => setImsStatus(signedIn ? 'signed-in' : 'signed-out'))
      .catch(() => setImsStatus('error'));
  }, []);

  const handleSignIn = () => {
    signInWithIms().catch(() => setImsStatus('error'));
  };

  const groupedRows = useMemo(() => groupRows(dataset.rows), [dataset.rows]);
  const visibleRows = useMemo(
    () => [...groupedRows.paid, ...groupedRows.trial],
    [groupedRows.paid, groupedRows.trial],
  );
  const visibleDataset = useMemo(
    () => ({ rows: visibleRows, generatedAt: dataset.generatedAt }),
    [dataset.generatedAt, visibleRows],
  );
  const overviewCounts = useMemo(() => getOverviewCounts(visibleRows), [visibleRows]);

  const loadDashboard = async () => {
    setStatus('loading');
    setError('');
    setProgress('Signing in with Adobe');
    sessionStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);

    try {
      const imsAccessToken = await getImsAccessToken();
      const sessionToken = await exchangeImsAccessToken(baseUrl, imsAccessToken);

      setProgress('Loading sites');
      const client = new SpacecatClient({ baseUrl, token: sessionToken });
      const allSites = await client.getAllSites();
      const llmoSites = allSites.filter(isLlmoSite);
      const entitlementsByOrg = new Map<string, SpacecatEntitlement[]>();

      setProgress(`Loading opportunities for ${llmoSites.length} LLMO sites`);

      const rows = await mapWithConcurrency(llmoSites, 8, async (site, index) => {
        const percent = Math.round(((index + 1) / llmoSites.length) * 100);
        setProgress(
          `Loading site ${index + 1} of ${llmoSites.length} (${percent}%): ${site.baseURL}`,
        );

        let entitlements = entitlementsByOrg.get(site.organizationId);
        if (!entitlements) {
          try {
            entitlements = await client.getEntitlements(site.organizationId);
          } catch {
            entitlements = [];
          }
          entitlementsByOrg.set(site.organizationId, entitlements);
        }

        try {
          const opportunities = await client.getSiteOpportunities(site.id);
          return buildSiteRow({ site, opportunities, entitlements });
        } catch (siteError) {
          return buildSiteRow({
            site,
            opportunities: [],
            entitlements,
            loadError: siteError instanceof Error ? siteError.message : 'Opportunity load failed',
          });
        }
      });

      const sortedRows = [...rows].sort((a, b) => a.siteName.localeCompare(b.siteName));
      setDataset({ rows: sortedRows, generatedAt: new Date().toISOString() });
      setStatus('success');
      setProgress(`Loaded ${sortedRows.length} LLMO sites`);
    } catch (loadError) {
      setStatus('error');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data');
      setProgress('');
    }
  };

  const canLoad = status !== 'loading' && imsStatus === 'signed-in' && baseUrl.trim().length > 0;
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
        <div className="ims-status">
          {imsStatus === 'checking' ? <span>Checking Adobe sign-in&hellip;</span> : null}
          {imsStatus === 'signed-in' ? <span>Signed in with Adobe</span> : null}
          {imsStatus === 'error' ? <strong>Adobe sign-in failed</strong> : null}
          {imsStatus === 'signed-out' || imsStatus === 'error' ? (
            <button type="button" className="secondary" onClick={handleSignIn}>
              <LogIn size={16} />
              Sign in with Adobe
            </button>
          ) : null}
        </div>
        <div className="actions">
          <button type="button" onClick={loadDashboard} disabled={!canLoad}>
            <RefreshCw size={16} className={status === 'loading' ? 'spin' : ''} />
            Load
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => downloadCsv(visibleDataset)}
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

      <CustomerTable title="Paid customers" rows={groupedRows.paid} defaultOpen />
      <CustomerTable title="Trial customers" rows={groupedRows.trial} defaultOpen />
    </main>
  );
}

export default App;
