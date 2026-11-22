import fetch from 'node-fetch';

const DEFAULT_API_VERSION = 'wc/v3';
const DEFAULT_PER_PAGE = 100;

export class WooCommerceClient {
  private storeUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private apiVersion: string;

  constructor(storeUrl: string, consumerKey: string, consumerSecret: string, apiVersion = DEFAULT_API_VERSION) {
    // Normalize store URL: strip trailing slash, ensure https
    this.storeUrl = storeUrl.replace(/\/$/, '');
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.apiVersion = apiVersion;
  }

  private baseUrl(): string {
    return `${this.storeUrl}/wp-json/${this.apiVersion}`;
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    return `Basic ${token}`;
  }

  private async request<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T & { _meta: { totalPages: number; total: number } }> {
    const url = new URL(`${this.baseUrl()}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.authHeader(),
        'User-Agent': 'Star AI Platform /1.0',
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WooCommerce API error ${resp.status}: ${body}`);
    }

    const totalPages = resp.headers.get('X-WP-TotalPages');
    const total = resp.headers.get('X-WP-Total');

    const data = (await resp.json()) as T;
    return {
      ...(data as object),
      _meta: { totalPages: totalPages ? parseInt(totalPages, 10) : 1, total: total ? parseInt(total, 10) : 0 },
    } as T & { _meta: { totalPages: number; total: number } };
  }

  async getProducts(params: { page?: number; per_page?: number; after?: string; status?: string; category?: number } = {}): Promise<{ data: any[]; totalPages: number; total: number }> {
    const resp: any = await this.request<any[]>('/products', {
      page: params.page ?? 1,
      per_page: params.per_page ?? DEFAULT_PER_PAGE,
      ...(params.after ? { after: params.after } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.category ? { category: params.category } : {}),
    });
    return {
      data: resp,
      totalPages: resp._meta?.totalPages ?? 1,
      total: resp._meta?.total ?? 0,
    };
  }

  async testConnection(): Promise<{ ok: boolean; storeName?: string; error?: string }> {
    try {
      const resp = await this.request<any[]>('/products', { per_page: 1 });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
