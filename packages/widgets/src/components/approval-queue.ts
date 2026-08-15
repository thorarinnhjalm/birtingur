import { formatNumberIs } from '../format.js';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

interface QueueItem {
  campaignId: string;
  advertiserName: string;
  creative: {
    creativeId: string;
    imageUrl: string;
    width: number;
    height: number;
    clickUrl: string;
  };
  budget: {
    mode: 'cpm_capped' | 'slot_purchased';
    totalIsk: number;
  };
}

export class AdplatformApprovalQueue extends HTMLElement {
  private publisherKey: string | null = null;
  private items: QueueItem[] = [];
  private loading = true;
  private rejectingCampaignId: string | null = null;

  static get observedAttributes() {
    return ['publisher-key'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.publisherKey = this.getAttribute('publisher-key');
    this.render();
    this.fetchData();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'publisher-key') {
      this.publisherKey = newValue;
      if (this.isConnected) {
        this.render();
        this.fetchData();
      }
    }
  }

  private async fetchData() {
    if (!this.publisherKey) {
      this.showError('Enginn publisher-key gefinn upp.');
      return;
    }

    this.loading = true;
    this.render();

    try {
      const response = await fetch(`${API_BASE}/v1/widgets/publisher/pending-approvals`, {
        headers: {
          Authorization: `Bearer ${this.publisherKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API skilaði villu: ${response.status}`);
      }

      const data = await response.json();
      this.items = data.items || [];
      this.loading = false;
      this.render();
    } catch (err) {
      console.error('Error fetching publisher approval queue widget:', err);
      this.showError('Ekki tókst að sækja umsóknir. Athugaðu lykilinn þinn.');
    }
  }

  private async handleApprove(campaignId: string) {
    if (!this.publisherKey) return;

    // Set item loading state in UI
    const cardEl = this.shadowRoot!.getElementById(`card-${campaignId}`);
    if (cardEl) cardEl.style.opacity = '0.5';

    try {
      const response = await fetch(`${API_BASE}/v1/widgets/publisher/approvals/${campaignId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.publisherKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (!response.ok) throw new Error('Approve action failed');

      // Dispatch custom DOM event
      this.dispatchEvent(
        new CustomEvent('approve', {
          detail: { campaignId },
          bubbles: true,
          composed: true,
        }),
      );

      // Slide item out of list
      this.animateRemove(campaignId);
    } catch (err) {
      alert('Ekki tókst að samþykkja herferð.');
      if (cardEl) cardEl.style.opacity = '1';
    }
  }

  private async handleRejectSubmit(campaignId: string, reason: string) {
    if (!this.publisherKey) return;

    const cardEl = this.shadowRoot!.getElementById(`card-${campaignId}`);
    if (cardEl) cardEl.style.opacity = '0.5';

    try {
      const response = await fetch(`${API_BASE}/v1/widgets/publisher/approvals/${campaignId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.publisherKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject', reason }),
      });

      if (!response.ok) throw new Error('Reject action failed');

      // Dispatch custom DOM event
      this.dispatchEvent(
        new CustomEvent('reject', {
          detail: { campaignId, reason },
          bubbles: true,
          composed: true,
        }),
      );

      this.rejectingCampaignId = null;
      this.animateRemove(campaignId);
    } catch (err) {
      alert('Ekki tókst að hafna herferð.');
      if (cardEl) cardEl.style.opacity = '1';
    }
  }

  private animateRemove(campaignId: string) {
    const cardEl = this.shadowRoot!.getElementById(`card-${campaignId}`);
    if (cardEl) {
      cardEl.style.transition = 'all 0.4s ease-out';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'translateX(50px)';

      setTimeout(() => {
        cardEl.style.maxHeight = '0px';
        cardEl.style.padding = '0px';
        cardEl.style.margin = '0px';
        cardEl.style.borderWidth = '0px';

        setTimeout(() => {
          this.items = this.items.filter((item) => item.campaignId !== campaignId);
          this.render();
        }, 300);
      }, 400);
    } else {
      this.items = this.items.filter((item) => item.campaignId !== campaignId);
      this.render();
    }
  }

  private toggleRejectForm(campaignId: string | null) {
    this.rejectingCampaignId = campaignId;
    this.render();
  }

  private getStyles(): string {
    const isDark =
      this.getAttribute('theme') === 'dark' ||
      (this.getAttribute('theme') !== 'light' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    return `
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .container {
        color: ${isDark ? '#f8fafc' : '#0f172a'};
      }
      .title {
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 16px 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .badge {
        font-size: 12px;
        font-weight: 600;
        background-color: #3b82f6;
        color: white;
        padding: 2px 6px;
        border-radius: 9999px;
      }
      .list {
        display: flex;
        flex-col: column;
        flex-direction: column;
        gap: 16px;
      }
      .item-card {
        background-color: ${isDark ? '#0f172a' : '#ffffff'};
        border: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
        border-radius: 12px;
        padding: 20px;
        box-shadow: ${isDark ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.05)'};
        display: flex;
        flex-direction: row;
        gap: 20px;
        overflow: hidden;
        max-height: 500px;
      }
      @media (max-width: 640px) {
        .item-card {
          flex-direction: column;
        }
      }
      .preview-container {
        flex-shrink: 0;
        width: 180px;
        height: 120px;
        border-radius: 8px;
        background-color: ${isDark ? '#1e293b' : '#f8fafc'};
        border: 1px dashed ${isDark ? '#334155' : '#cbd5e1'};
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      @media (max-width: 640px) {
        .preview-container {
          width: 100%;
          height: 150px;
        }
      }
      .preview-img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .details {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .campaign-name {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 4px 0;
      }
      .advertiser-name {
        font-size: 13px;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        margin: 0 0 12px 0;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        font-size: 13px;
        margin-bottom: 12px;
      }
      .meta-item {
        color: ${isDark ? '#cbd5e1' : '#475569'};
      }
      .meta-label {
        font-weight: 500;
        color: ${isDark ? '#64748b' : '#94a3b8'};
        margin-right: 4px;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        gap: 6px;
      }
      .btn-approve {
        background-color: #10b981;
        color: white;
      }
      .btn-approve:hover {
        background-color: #059669;
      }
      .btn-reject {
        background-color: ${isDark ? '#1e293b' : '#f1f5f9'};
        color: ${isDark ? '#cbd5e1' : '#475569'};
        border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
      }
      .btn-reject:hover {
        background-color: ${isDark ? '#334155' : '#e2e8f0'};
      }
      .btn-submit-reject {
        background-color: #ef4444;
        color: white;
      }
      .btn-submit-reject:hover {
        background-color: #dc2626;
      }
      .btn-cancel {
        background-color: transparent;
        color: ${isDark ? '#94a3b8' : '#64748b'};
      }
      .reject-form {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed ${isDark ? '#334155' : '#e2e8f0'};
      }
      .reject-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
        background-color: ${isDark ? '#0f172a' : '#ffffff'};
        color: ${isDark ? '#f8fafc' : '#0f172a'};
        padding: 8px 12px;
        font-size: 13px;
        border-radius: 6px;
        margin-bottom: 8px;
        font-family: inherit;
        resize: vertical;
      }
      .reject-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .empty-state {
        border: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
        background-color: ${isDark ? '#0f172a' : '#ffffff'};
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        color: ${isDark ? '#94a3b8' : '#64748b'};
        font-size: 14px;
      }
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 150px;
        font-size: 14px;
        color: ${isDark ? '#94a3b8' : '#64748b'};
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
      .error-card {
        border: 1px solid ${isDark ? '#7f1d1d' : '#fee2e2'};
        background-color: ${isDark ? '#450a0a/40' : '#fef2f2'};
        color: ${isDark ? '#fca5a5' : '#b91c1c'};
        border-radius: 12px;
        padding: 24px;
        font-size: 14px;
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
    const isDark =
      this.getAttribute('theme') === 'dark' ||
      (this.getAttribute('theme') !== 'light' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (this.loading) {
      this.shadowRoot!.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="loading">
          <div class="spinner"></div>
          Sæki umsóknir í bið...
        </div>
      `;
      return;
    }

    if (this.items.length === 0) {
      this.shadowRoot!.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="empty-state">
          <p>🎉 Engar auglýsingar bíða samþykktar. Frábært!</p>
        </div>
      `;
      return;
    }

    const listHtml = this.items
      .map((item) => {
        const isRejecting = this.rejectingCampaignId === item.campaignId;
        const sizeStr = `${item.creative.width}x${item.creative.height}px`;

        let priceStr = '';
        if (item.budget.mode === 'cpm_capped') {
          priceStr = 'Birtingarherferð (CPM)';
        } else {
          priceStr = `Fastakaup pláss (${formatNumberIs(item.budget.totalIsk)} kr.)`;
        }

        return `
        <div class="item-card" id="card-${item.campaignId}">
          <div class="preview-container">
            <img class="preview-img" src="${item.creative.imageUrl}" alt="Auglýsinga creative" />
          </div>
          <div class="details">
            <div>
              <h3 class="campaign-name">Herferð: ${item.campaignId.substring(0, 8)}</h3>
              <p class="advertiser-name">Auglýsandi: ${item.advertiserName}</p>
              
              <div class="meta-grid">
                <div class="meta-item">
                  <span class="meta-label">Stærð:</span>${sizeStr}
                </div>
                <div class="meta-item">
                  <span class="meta-label">Greiðsla:</span>${priceStr}
                </div>
              </div>
            </div>
            
            ${
              isRejecting
                ? `
              <div class="reject-form">
                <textarea class="reject-input" id="reason-${item.campaignId}" placeholder="Hvers vegna er auglýsingunni hafnað? (valkvætt)" rows="2"></textarea>
                <div class="reject-actions">
                  <button class="btn btn-cancel" id="cancel-rej-${item.campaignId}">Hætta við</button>
                  <button class="btn btn-submit-reject" id="submit-rej-${item.campaignId}">Staðfesta höfnun</button>
                </div>
              </div>
            `
                : `
              <div class="actions">
                <button class="btn btn-approve" id="approve-${item.campaignId}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Samþykkja
                </button>
                <button class="btn btn-reject" id="reject-trigger-${item.campaignId}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  Hafna
                </button>
              </div>
            `
            }
          </div>
        </div>
      `;
      })
      .join('');

    this.shadowRoot!.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="container">
        <h2 class="title">
          <span>Umsóknir til samþykktar</span>
          <span class="badge">${this.items.length}</span>
        </h2>
        <div class="list">
          ${listHtml}
        </div>
      </div>
    `;

    // Attach Event Listeners
    this.items.forEach((item) => {
      const approveBtn = this.shadowRoot!.getElementById(`approve-${item.campaignId}`);
      if (approveBtn) {
        approveBtn.addEventListener('click', () => this.handleApprove(item.campaignId));
      }

      const rejectTrigger = this.shadowRoot!.getElementById(`reject-trigger-${item.campaignId}`);
      if (rejectTrigger) {
        rejectTrigger.addEventListener('click', () => this.toggleRejectForm(item.campaignId));
      }

      const cancelRej = this.shadowRoot!.getElementById(`cancel-rej-${item.campaignId}`);
      if (cancelRej) {
        cancelRej.addEventListener('click', () => this.toggleRejectForm(null));
      }

      const submitRej = this.shadowRoot!.getElementById(`submit-rej-${item.campaignId}`);
      if (submitRej) {
        submitRej.addEventListener('click', () => {
          const textarea = this.shadowRoot!.getElementById(
            `reason-${item.campaignId}`,
          ) as HTMLTextAreaElement;
          const reason = textarea ? textarea.value.trim() : '';
          this.handleRejectSubmit(item.campaignId, reason);
        });
      }
    });
  }
}
