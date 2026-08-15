import { formatNumberIs } from '../format.js';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

export class AdplatformStats extends HTMLElement {
  private publisherKey: string | null = null;
  private period: string = '30d';
  private theme: string = 'auto';

  static get observedAttributes() {
    return ['publisher-key', 'period', 'theme'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.publisherKey = this.getAttribute('publisher-key');
    this.period = this.getAttribute('period') || '30d';
    this.theme = this.getAttribute('theme') || 'auto';
    this.render();
    this.fetchData();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'publisher-key') this.publisherKey = newValue;
    if (name === 'period') this.period = newValue;
    if (name === 'theme') this.theme = newValue;

    if (this.isConnected) {
      this.render();
      this.fetchData();
    }
  }

  private getActiveTheme(): 'light' | 'dark' {
    if (this.theme === 'dark') return 'dark';
    if (this.theme === 'light') return 'light';

    // Auto-detect using media query
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  private async fetchData() {
    if (!this.publisherKey) {
      this.showError('Enginn publisher-key gefinn upp.');
      return;
    }

    try {
      const timeframe = this.period === '30d' ? '30' : '7';
      const response = await fetch(
        `${API_BASE}/v1/widgets/publisher/stats?timeframe=${timeframe}`,
        {
          headers: {
            Authorization: `Bearer ${this.publisherKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`API skilaði villu: ${response.status}`);
      }

      const data = await response.json();
      this.showData(data);
    } catch (err) {
      console.error('Error fetching publisher stats widget:', err);
      this.showError('Ekki tókst að sækja tölfræði. Athugaðu lykilinn þinn.');
    }
  }

  private getStyles(): string {
    const isDark = this.getActiveTheme() === 'dark';

    return `
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .card {
        background-color: ${isDark ? '#0f172a' : '#ffffff'};
        border: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
        border-radius: 12px;
        padding: 24px;
        box-shadow: ${isDark ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)'};
        color: ${isDark ? '#f8fafc' : '#0f172a'};
      }
      .title {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: ${isDark ? '#94a3b8' : '#475569'};
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .period-badge {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 9999px;
        background-color: ${isDark ? '#1e293b' : '#f1f5f9'};
        color: ${isDark ? '#cbd5e1' : '#64748b'};
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 20px;
      }
      @media (max-width: 800px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (max-width: 600px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
      .metric-card {
        background-color: ${isDark ? '#1e293b/40' : '#f8fafc'};
        border: 1px solid ${isDark ? '#334155/30' : '#f1f5f9'};
        border-radius: 8px;
        padding: 16px;
      }
      .metric-label {
        font-size: 12px;
        font-weight: 500;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin-bottom: 4px;
      }
      .metric-value {
        font-size: 20px;
        font-weight: 700;
        color: ${isDark ? '#f8fafc' : '#0f172a'};
      }
      .sparkline-container {
        border-top: 1px solid ${isDark ? '#1e293b' : '#f1f5f9'};
        padding-top: 16px;
      }
      .sparkline-label {
        font-size: 12px;
        font-weight: 500;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin-bottom: 8px;
      }
      .sparkline-svg {
        width: 100%;
        height: 60px;
        overflow: visible;
      }
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 150px;
        font-size: 14px;
        color: ${isDark ? '#94a3b8' : '#64748b'};
      }
      .error-card {
        border: 1px solid ${isDark ? '#7f1d1d' : '#fee2e2'};
        background-color: ${isDark ? '#450a0a/40' : '#fef2f2'};
        color: ${isDark ? '#fca5a5' : '#b91c1c'};
        border-radius: 12px;
        padding: 24px;
        font-size: 14px;
        text-align: center;
      }
      .spinner {
        border: 2px solid ${isDark ? '#334155' : '#e2e8f0'};
        border-top: 2px solid #2563eb;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        animation: spin 0.8s linear infinite;
        margin-right: 8px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="card" id="card">
        <div class="loading">
          <div class="spinner"></div>
          Sæki tölfræði...
        </div>
      </div>
    `;
  }

  private showError(message: string) {
    this.shadowRoot!.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="error-card">
        <div>⚠️ ${message}</div>
      </div>
    `;
  }

  private formatNum(n: number): string {
    return formatNumberIs(n);
  }

  private formatIsk(n: number): string {
    return `${this.formatNum(n)} kr.`;
  }

  private showData(data: {
    impressions: number;
    clicks: number;
    spendIsk: number;
    // Real page views (one per page load) — NOT `pageviews`, which counts
    // ad-slot loads (one per slot per page) and overstates traffic by the
    // site's slots-per-page ratio. Absent for a period that predates the
    // 2026-08-09 traffic-measurement-integrity switch date, where no accurate
    // figure was ever measured; render an em dash then, never a false 0 —
    // same honesty rule as the publisher dashboard
    // (apps/dashboard/src/pages/publisher/Dashboard.tsx).
    pageViewsTrue?: number;
    // What the publisher actually earns, net of the platform fee. Computed
    // server-side because this bundle has no dependency on @ada/shared and
    // therefore no access to the fee — which is why it used to render the gross
    // `spendIsk` under "Áætlaðar tekjur", 25% high, on a page the publisher
    // embeds on their own site while the dashboard showed the real figure.
    netEarningsIsk?: number;
    history: { date: string; impressions: number; clicks: number; spendIsk: number }[];
  }) {
    const isDark = this.getActiveTheme() === 'dark';
    // Fall back to the gross only if the API is older than this bundle; both
    // figures then at least come from one place rather than two definitions.
    const netEarnings = data.netEarningsIsk ?? data.spendIsk;
    const eCPM = data.impressions > 0 ? (netEarnings / data.impressions) * 1000 : 0;

    // Sparkline path generation
    const history = data.history || [];
    let sparklineHtml = '';

    if (history.length > 1) {
      const maxVal = Math.max(...history.map((h) => h.impressions), 1);
      const points = history.map((h, idx) => {
        const x = (idx / (history.length - 1)) * 100; // svg viewBox width is 100
        const y = 45 - (h.impressions / maxVal) * 35; // svg viewBox height is 50, leave top/bottom padding
        return `${x},${y}`;
      });
      const pathD = `M ${points.join(' L ')}`;

      // Area path for gradient fill
      const areaPathD = `${pathD} L 100,50 L 0,50 Z`;

      sparklineHtml = `
        <div class="sparkline-container">
          <div class="sparkline-label">Birtingarflæði yfir tímabilið</div>
          <svg viewBox="0 0 100 50" class="sparkline-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2563eb" stop-opacity="${isDark ? '0.4' : '0.2'}"/>
                <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${areaPathD}" fill="url(#sparklineGrad)" />
            <path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `;
    }

    this.shadowRoot!.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="card">
        <div class="title">
          <span>Árangursyfirlit</span>
          <span class="period-badge">${this.period === '30d' ? 'Síðustu 30 dagar' : 'Síðustu 7 dagar'}</span>
        </div>
        
        <div class="grid">
          <div class="metric-card">
            <div class="metric-label">Vefumferð</div>
            <div class="metric-value">${data.pageViewsTrue !== undefined ? this.formatNum(data.pageViewsTrue) : '—'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Heildarbirtingar</div>
            <div class="metric-value">${this.formatNum(data.impressions)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Áætlaðar tekjur</div>
            <div class="metric-value">${this.formatIsk(netEarnings)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Meðal eCPM</div>
            <div class="metric-value">${this.formatIsk(Math.round(eCPM))}</div>
          </div>
        </div>
        
        ${sparklineHtml}
      </div>
    `;
  }
}
