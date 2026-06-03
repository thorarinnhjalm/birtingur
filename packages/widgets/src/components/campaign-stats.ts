const API_BASE = process.env.API_BASE || 'http://localhost:3001';

interface HourStat {
  hour: string;
  impressions: number;
  clicks: number;
}

export class AdplatformCampaignStats extends HTMLElement {
  private campaignId: string | null = null;
  private viewerKey: string | null = null;
  private loading = true;
  private stats: { impressions: number; clicks: number; hours: HourStat[] } | null = null;

  static get observedAttributes() {
    return ['campaign-id', 'viewer-key', 'theme'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.campaignId = this.getAttribute('campaign-id');
    this.viewerKey = this.getAttribute('viewer-key');
    this.render();
    this.fetchData();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'campaign-id') this.campaignId = newValue;
    if (name === 'viewer-key') this.viewerKey = newValue;

    if (this.isConnected) {
      this.render();
      this.fetchData();
    }
  }

  private getActiveTheme(): 'light' | 'dark' {
    const theme = this.getAttribute('theme') || 'auto';
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';

    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  private async fetchData() {
    if (!this.campaignId || !this.viewerKey) {
      this.showError('Vantar campaign-id eða viewer-key.');
      return;
    }

    this.loading = true;
    this.render();

    try {
      const response = await fetch(`${API_BASE}/v1/widgets/campaign/stats`, {
        headers: {
          Authorization: `Bearer ${this.viewerKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API skilaði villu: ${response.status}`);
      }

      const data = await response.json();
      this.stats = data.stats;
      this.loading = false;
      this.render();
    } catch (err) {
      console.error('Error fetching campaign stats widget:', err);
      this.showError('Ekki tókst að sækja herferðarupplýsingar.');
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
        padding: 20px;
        box-shadow: ${isDark ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.05)'};
        color: ${isDark ? '#f8fafc' : '#0f172a'};
      }
      .title {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: ${isDark ? '#94a3b8' : '#475569'};
        display: flex;
        justify-content: space-between;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 16px;
      }
      .metric-card {
        background-color: ${isDark ? '#1e293b/40' : '#f8fafc'};
        border: 1px solid ${isDark ? '#334155/30' : '#f1f5f9'};
        border-radius: 8px;
        padding: 12px;
      }
      .metric-label {
        font-size: 11px;
        font-weight: 500;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin-bottom: 2px;
      }
      .metric-value {
        font-size: 18px;
        font-weight: 700;
      }
      .sparkline-container {
        border-top: 1px solid ${isDark ? '#1e293b' : '#f1f5f9'};
        padding-top: 12px;
      }
      .sparkline-label {
        font-size: 11px;
        font-weight: 500;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin-bottom: 6px;
      }
      .sparkline-svg {
        width: 100%;
        height: 40px;
        overflow: visible;
      }
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 120px;
        font-size: 13px;
        color: ${isDark ? '#94a3b8' : '#64748b'};
      }
      .spinner {
        border: 2px solid ${isDark ? '#334155' : '#e2e8f0'};
        border-top: 2px solid #2563eb;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        animation: spin 0.8s linear infinite;
        margin-right: 6px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .error-card {
        border: 1px solid ${isDark ? '#7f1d1d' : '#fee2e2'};
        background-color: ${isDark ? '#450a0a/40' : '#fef2f2'};
        color: ${isDark ? '#fca5a5' : '#b91c1c'};
        border-radius: 8px;
        padding: 16px;
        font-size: 13px;
        text-align: center;
      }
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

  private render() {
    if (this.loading) {
      this.shadowRoot!.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="loading">
          <div class="spinner"></div>
          Sæki herferðarupplýsingar...
        </div>
      `;
      return;
    }

    if (!this.stats) {
      this.showError('Engin tölfræðigögn fundust.');
      return;
    }

    const isDark = this.getActiveTheme() === 'dark';
    const ctr = this.stats.impressions > 0 ? (this.stats.clicks / this.stats.impressions) * 100 : 0;
    const ctrStr = `${ctr.toFixed(2)}%`;
    const formatNum = (n: number) => new Intl.NumberFormat('is-IS').format(n);

    // Sparkline SVG path generation from hourly stats (or aggregate to daily/step points)
    // To make a clean chart, we can select a subset of hours or plot all points if <= 30
    const rawHours = this.stats.hours || [];
    // reverse to chronological order
    const hours = [...rawHours].reverse();
    let sparklineHtml = '';

    if (hours.length > 1) {
      const maxVal = Math.max(...hours.map((h) => h.impressions), 1);
      const points = hours.map((h, idx) => {
        const x = (idx / (hours.length - 1)) * 100;
        const y = 35 - (h.impressions / maxVal) * 28; // height is 40
        return `${x},${y}`;
      });
      const pathD = `M ${points.join(' L ')}`;
      const areaPathD = `${pathD} L 100,40 L 0,40 Z`;

      sparklineHtml = `
        <div class="sparkline-container">
          <div class="sparkline-label">Birtingarflæði herferðar (síðustu dagar/tímar)</div>
          <svg viewBox="0 0 100 40" class="sparkline-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="campaignSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="${isDark ? '0.4' : '0.2'}"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${areaPathD}" fill="url(#campaignSparklineGrad)" />
            <path d="${pathD}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `;
    }

    this.shadowRoot!.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="card">
        <div class="title">
          <span>Árangur herferðar (${this.campaignId})</span>
        </div>
        
        <div class="grid">
          <div class="metric-card">
            <div class="metric-label">Birtingar</div>
            <div class="metric-value">${formatNum(this.stats.impressions)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Smellir</div>
            <div class="metric-value">${formatNum(this.stats.clicks)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Smellihlutfall</div>
            <div class="metric-value">${ctrStr}</div>
          </div>
        </div>
        
        ${sparklineHtml}
      </div>
    `;
  }
}
