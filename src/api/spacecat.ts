import type { SpacecatEntitlement, SpacecatOpportunity, SpacecatSite, SpacecatSuggestion } from '../types';

interface SitesPagedResponse {
  sites: SpacecatSite[];
  pagination?: {
    cursor?: string | null;
    hasMore?: boolean;
  };
}

interface SpacecatClientOptions {
  baseUrl: string;
  token: string;
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const readErrorBody = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return response.statusText;
  }

  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message ?? json.error ?? text;
  } catch {
    return text;
  }
};

export class SpacecatClient {
  private readonly baseUrl: string;

  private readonly token: string;

  constructor({ baseUrl, token }: SpacecatClientOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token.trim().replace(/^Bearer\s+/i, '');
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const message = await readErrorBody(response);
      throw new Error(`${response.status} ${message}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async getAllSites(): Promise<SpacecatSite[]> {
    const allSites: SpacecatSite[] = [];
    let cursor: string | null | undefined;

    do {
      const searchParams = new URLSearchParams({ limit: '500' });
      if (cursor) {
        searchParams.set('cursor', cursor);
      }

      const response = await this.request<SitesPagedResponse | SpacecatSite[]>(
        `/sites?${searchParams.toString()}`,
      );

      if (Array.isArray(response)) {
        allSites.push(...response);
        cursor = null;
      } else {
        allSites.push(...response.sites);
        cursor = response.pagination?.hasMore ? response.pagination?.cursor : null;
      }
    } while (cursor);

    return allSites;
  }

  async getSiteOpportunities(siteId: string): Promise<SpacecatOpportunity[]> {
    return this.request<SpacecatOpportunity[]>(`/sites/${encodeURIComponent(siteId)}/opportunities`);
  }

  async getEntitlements(organizationId: string): Promise<SpacecatEntitlement[]> {
    return this.request<SpacecatEntitlement[]>(
      `/organizations/${encodeURIComponent(organizationId)}/entitlements`,
    );
  }

  async getOpportunitySuggestions(siteId: string, opportunityId: string): Promise<SpacecatSuggestion[]> {
    return this.request<SpacecatSuggestion[]>(
      `/sites/${encodeURIComponent(siteId)}/opportunities/${encodeURIComponent(opportunityId)}/suggestions?view=minimal`,
    );
  }

  async updateOpportunityStatus(
    siteId: string,
    opportunityId: string,
    status: 'NEW' | 'IGNORED',
  ): Promise<SpacecatOpportunity> {
    return this.request<SpacecatOpportunity>(
      `/sites/${encodeURIComponent(siteId)}/opportunities/${encodeURIComponent(opportunityId)}`,
      { method: 'PATCH', body: { status } },
    );
  }
}
