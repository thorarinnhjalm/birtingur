"use strict";(()=>{var $=Object.defineProperty;var j=(o,r,e)=>r in o?$(o,r,{enumerable:!0,configurable:!0,writable:!0,value:e}):o[r]=e;var a=(o,r,e)=>j(o,typeof r!="symbol"?r+"":r,e);function h(o){if(!Number.isFinite(o))return String(o);let r=Math.round(o*1e3)/1e3,e=r<0||Object.is(r,-0),[i,t]=Math.abs(r).toString().split("."),n=i.replace(/\B(?=(\d{3})+(?!\d))/g,"."),d=t?`,${t}`:"";return`${e?"-":""}${n}${d}`}var E="https://api.birtingur.app",f=class extends HTMLElement{constructor(){super();a(this,"publisherKey",null);a(this,"period","30d");a(this,"theme","auto");this.attachShadow({mode:"open"})}static get observedAttributes(){return["publisher-key","period","theme"]}connectedCallback(){this.publisherKey=this.getAttribute("publisher-key"),this.period=this.getAttribute("period")||"30d",this.theme=this.getAttribute("theme")||"auto",this.render(),this.fetchData()}attributeChangedCallback(e,i,t){i!==t&&(e==="publisher-key"&&(this.publisherKey=t),e==="period"&&(this.period=t),e==="theme"&&(this.theme=t),this.isConnected&&(this.render(),this.fetchData()))}getActiveTheme(){return this.theme==="dark"?"dark":this.theme==="light"?"light":typeof window!="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}async fetchData(){if(!this.publisherKey){this.showError("Enginn publisher-key gefinn upp.");return}try{let e=this.period==="30d"?"30":"7",i=await fetch(`${E}/v1/widgets/publisher/stats?timeframe=${e}`,{headers:{Authorization:`Bearer ${this.publisherKey}`,"Content-Type":"application/json"}});if(!i.ok)throw new Error(`API skila\xF0i villu: ${i.status}`);let t=await i.json();this.showData(t)}catch(e){console.error("Error fetching publisher stats widget:",e),this.showError("Ekki t\xF3kst a\xF0 s\xE6kja t\xF6lfr\xE6\xF0i. Athuga\xF0u lykilinn \xFEinn.")}}getStyles(){let e=this.getActiveTheme()==="dark";return`
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .card {
        background-color: ${e?"#0f172a":"#ffffff"};
        border: 1px solid ${e?"#1e293b":"#e2e8f0"};
        border-radius: 12px;
        padding: 24px;
        box-shadow: ${e?"none":"0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)"};
        color: ${e?"#f8fafc":"#0f172a"};
      }
      .title {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: ${e?"#94a3b8":"#475569"};
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .period-badge {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 9999px;
        background-color: ${e?"#1e293b":"#f1f5f9"};
        color: ${e?"#cbd5e1":"#64748b"};
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
        background-color: ${e?"#1e293b/40":"#f8fafc"};
        border: 1px solid ${e?"#334155/30":"#f1f5f9"};
        border-radius: 8px;
        padding: 16px;
      }
      .metric-label {
        font-size: 12px;
        font-weight: 500;
        color: ${e?"#94a3b8":"#64748b"};
        margin-bottom: 4px;
      }
      .metric-value {
        font-size: 20px;
        font-weight: 700;
        color: ${e?"#f8fafc":"#0f172a"};
      }
      .sparkline-container {
        border-top: 1px solid ${e?"#1e293b":"#f1f5f9"};
        padding-top: 16px;
      }
      .sparkline-label {
        font-size: 12px;
        font-weight: 500;
        color: ${e?"#94a3b8":"#64748b"};
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
        color: ${e?"#94a3b8":"#64748b"};
      }
      .error-card {
        border: 1px solid ${e?"#7f1d1d":"#fee2e2"};
        background-color: ${e?"#450a0a/40":"#fef2f2"};
        color: ${e?"#fca5a5":"#b91c1c"};
        border-radius: 12px;
        padding: 24px;
        font-size: 14px;
        text-align: center;
      }
      .spinner {
        border: 2px solid ${e?"#334155":"#e2e8f0"};
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
    `}render(){this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="card" id="card">
        <div class="loading">
          <div class="spinner"></div>
          S\xE6ki t\xF6lfr\xE6\xF0i...
        </div>
      </div>
    `}showError(e){this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="error-card">
        <div>\u26A0\uFE0F ${e}</div>
      </div>
    `}formatNum(e){return h(e)}formatIsk(e){return`${this.formatNum(e)} kr.`}showData(e){var l;let i=this.getActiveTheme()==="dark",t=(l=e.netEarningsIsk)!=null?l:e.spendIsk,n=e.impressions>0?t/e.impressions*1e3:0,d=e.history||[],s="";if(d.length>1){let c=Math.max(...d.map(p=>p.impressions),1),g=`M ${d.map((p,x)=>{let y=x/(d.length-1)*100,k=45-p.impressions/c*35;return`${y},${k}`}).join(" L ")}`,v=`${g} L 100,50 L 0,50 Z`;s=`
        <div class="sparkline-container">
          <div class="sparkline-label">Birtingarfl\xE6\xF0i yfir t\xEDmabili\xF0</div>
          <svg viewBox="0 0 100 50" class="sparkline-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2563eb" stop-opacity="${i?"0.4":"0.2"}"/>
                <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${v}" fill="url(#sparklineGrad)" />
            <path d="${g}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `}this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="card">
        <div class="title">
          <span>\xC1rangursyfirlit</span>
          <span class="period-badge">${this.period==="30d"?"S\xED\xF0ustu 30 dagar":"S\xED\xF0ustu 7 dagar"}</span>
        </div>
        
        <div class="grid">
          <div class="metric-card">
            <div class="metric-label">Vefumfer\xF0</div>
            <div class="metric-value">${e.pageViewsTrue!==void 0?this.formatNum(e.pageViewsTrue):"\u2014"}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Heildarbirtingar</div>
            <div class="metric-value">${this.formatNum(e.impressions)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">\xC1\xE6tla\xF0ar tekjur</div>
            <div class="metric-value">${this.formatIsk(t)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Me\xF0al eCPM</div>
            <div class="metric-value">${this.formatIsk(Math.round(n))}</div>
          </div>
        </div>
        
        ${s}
      </div>
    `}};var w="https://api.birtingur.app",m=class extends HTMLElement{constructor(){super();a(this,"publisherKey",null);a(this,"items",[]);a(this,"loading",!0);a(this,"rejectingCampaignId",null);this.attachShadow({mode:"open"})}static get observedAttributes(){return["publisher-key"]}connectedCallback(){this.publisherKey=this.getAttribute("publisher-key"),this.render(),this.fetchData()}attributeChangedCallback(e,i,t){i!==t&&e==="publisher-key"&&(this.publisherKey=t,this.isConnected&&(this.render(),this.fetchData()))}async fetchData(){if(!this.publisherKey){this.showError("Enginn publisher-key gefinn upp.");return}this.loading=!0,this.render();try{let e=await fetch(`${w}/v1/widgets/publisher/pending-approvals`,{headers:{Authorization:`Bearer ${this.publisherKey}`,"Content-Type":"application/json"}});if(!e.ok)throw new Error(`API skila\xF0i villu: ${e.status}`);let i=await e.json();this.items=i.items||[],this.loading=!1,this.render()}catch(e){console.error("Error fetching publisher approval queue widget:",e),this.showError("Ekki t\xF3kst a\xF0 s\xE6kja ums\xF3knir. Athuga\xF0u lykilinn \xFEinn.")}}async handleApprove(e){if(!this.publisherKey)return;let i=this.shadowRoot.getElementById(`card-${e}`);i&&(i.style.opacity="0.5");try{if(!(await fetch(`${w}/v1/widgets/publisher/approvals/${e}`,{method:"POST",headers:{Authorization:`Bearer ${this.publisherKey}`,"Content-Type":"application/json"},body:JSON.stringify({action:"approve"})})).ok)throw new Error("Approve action failed");this.dispatchEvent(new CustomEvent("approve",{detail:{campaignId:e},bubbles:!0,composed:!0})),this.animateRemove(e)}catch(t){alert("Ekki t\xF3kst a\xF0 sam\xFEykkja herfer\xF0."),i&&(i.style.opacity="1")}}async handleRejectSubmit(e,i){if(!this.publisherKey)return;let t=this.shadowRoot.getElementById(`card-${e}`);t&&(t.style.opacity="0.5");try{if(!(await fetch(`${w}/v1/widgets/publisher/approvals/${e}`,{method:"POST",headers:{Authorization:`Bearer ${this.publisherKey}`,"Content-Type":"application/json"},body:JSON.stringify({action:"reject",reason:i})})).ok)throw new Error("Reject action failed");this.dispatchEvent(new CustomEvent("reject",{detail:{campaignId:e,reason:i},bubbles:!0,composed:!0})),this.rejectingCampaignId=null,this.animateRemove(e)}catch(n){alert("Ekki t\xF3kst a\xF0 hafna herfer\xF0."),t&&(t.style.opacity="1")}}animateRemove(e){let i=this.shadowRoot.getElementById(`card-${e}`);i?(i.style.transition="all 0.4s ease-out",i.style.opacity="0",i.style.transform="translateX(50px)",setTimeout(()=>{i.style.maxHeight="0px",i.style.padding="0px",i.style.margin="0px",i.style.borderWidth="0px",setTimeout(()=>{this.items=this.items.filter(t=>t.campaignId!==e),this.render()},300)},400)):(this.items=this.items.filter(t=>t.campaignId!==e),this.render())}toggleRejectForm(e){this.rejectingCampaignId=e,this.render()}getStyles(){let e=this.getAttribute("theme")==="dark"||this.getAttribute("theme")!=="light"&&typeof window!="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;return`
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .container {
        color: ${e?"#f8fafc":"#0f172a"};
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
        background-color: ${e?"#0f172a":"#ffffff"};
        border: 1px solid ${e?"#1e293b":"#e2e8f0"};
        border-radius: 12px;
        padding: 20px;
        box-shadow: ${e?"none":"0 1px 3px 0 rgba(0, 0, 0, 0.05)"};
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
        background-color: ${e?"#1e293b":"#f8fafc"};
        border: 1px dashed ${e?"#334155":"#cbd5e1"};
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
        color: ${e?"#94a3b8":"#64748b"};
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
        color: ${e?"#cbd5e1":"#475569"};
      }
      .meta-label {
        font-weight: 500;
        color: ${e?"#64748b":"#94a3b8"};
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
        background-color: ${e?"#1e293b":"#f1f5f9"};
        color: ${e?"#cbd5e1":"#475569"};
        border: 1px solid ${e?"#334155":"#cbd5e1"};
      }
      .btn-reject:hover {
        background-color: ${e?"#334155":"#e2e8f0"};
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
        color: ${e?"#94a3b8":"#64748b"};
      }
      .reject-form {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed ${e?"#334155":"#e2e8f0"};
      }
      .reject-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid ${e?"#334155":"#cbd5e1"};
        background-color: ${e?"#0f172a":"#ffffff"};
        color: ${e?"#f8fafc":"#0f172a"};
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
        border: 1px solid ${e?"#1e293b":"#e2e8f0"};
        background-color: ${e?"#0f172a":"#ffffff"};
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        color: ${e?"#94a3b8":"#64748b"};
        font-size: 14px;
      }
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 150px;
        font-size: 14px;
        color: ${e?"#94a3b8":"#64748b"};
      }
      .spinner {
        border: 2px solid ${e?"#334155":"#e2e8f0"};
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
        border: 1px solid ${e?"#7f1d1d":"#fee2e2"};
        background-color: ${e?"#450a0a/40":"#fef2f2"};
        color: ${e?"#fca5a5":"#b91c1c"};
        border-radius: 12px;
        padding: 24px;
        font-size: 14px;
        text-align: center;
      }
    `}showError(e){this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="error-card">
        <div>\u26A0\uFE0F ${e}</div>
      </div>
    `}render(){let e=this.getAttribute("theme")==="dark"||this.getAttribute("theme")!=="light"&&typeof window!="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;if(this.loading){this.shadowRoot.innerHTML=`
        <style>${this.getStyles()}</style>
        <div class="loading">
          <div class="spinner"></div>
          S\xE6ki ums\xF3knir \xED bi\xF0...
        </div>
      `;return}if(this.items.length===0){this.shadowRoot.innerHTML=`
        <style>${this.getStyles()}</style>
        <div class="empty-state">
          <p>\u{1F389} Engar augl\xFDsingar b\xED\xF0a sam\xFEykktar. Fr\xE1b\xE6rt!</p>
        </div>
      `;return}let i=this.items.map(t=>{let n=this.rejectingCampaignId===t.campaignId,d=`${t.creative.width}x${t.creative.height}px`,s="";return t.budget.mode==="cpm_capped"?s="Birtingarherfer\xF0 (CPM)":s=`Fastakaup pl\xE1ss (${h(t.budget.totalIsk)} kr.)`,`
        <div class="item-card" id="card-${t.campaignId}">
          <div class="preview-container">
            <img class="preview-img" src="${t.creative.imageUrl}" alt="Augl\xFDsinga creative" />
          </div>
          <div class="details">
            <div>
              <h3 class="campaign-name">Herfer\xF0: ${t.campaignId.substring(0,8)}</h3>
              <p class="advertiser-name">Augl\xFDsandi: ${t.advertiserName}</p>
              
              <div class="meta-grid">
                <div class="meta-item">
                  <span class="meta-label">St\xE6r\xF0:</span>${d}
                </div>
                <div class="meta-item">
                  <span class="meta-label">Grei\xF0sla:</span>${s}
                </div>
              </div>
            </div>
            
            ${n?`
              <div class="reject-form">
                <textarea class="reject-input" id="reason-${t.campaignId}" placeholder="Hvers vegna er augl\xFDsingunni hafna\xF0? (valkv\xE6tt)" rows="2"></textarea>
                <div class="reject-actions">
                  <button class="btn btn-cancel" id="cancel-rej-${t.campaignId}">H\xE6tta vi\xF0</button>
                  <button class="btn btn-submit-reject" id="submit-rej-${t.campaignId}">Sta\xF0festa h\xF6fnun</button>
                </div>
              </div>
            `:`
              <div class="actions">
                <button class="btn btn-approve" id="approve-${t.campaignId}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Sam\xFEykkja
                </button>
                <button class="btn btn-reject" id="reject-trigger-${t.campaignId}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  Hafna
                </button>
              </div>
            `}
          </div>
        </div>
      `}).join("");this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="container">
        <h2 class="title">
          <span>Ums\xF3knir til sam\xFEykktar</span>
          <span class="badge">${this.items.length}</span>
        </h2>
        <div class="list">
          ${i}
        </div>
      </div>
    `,this.items.forEach(t=>{let n=this.shadowRoot.getElementById(`approve-${t.campaignId}`);n&&n.addEventListener("click",()=>this.handleApprove(t.campaignId));let d=this.shadowRoot.getElementById(`reject-trigger-${t.campaignId}`);d&&d.addEventListener("click",()=>this.toggleRejectForm(t.campaignId));let s=this.shadowRoot.getElementById(`cancel-rej-${t.campaignId}`);s&&s.addEventListener("click",()=>this.toggleRejectForm(null));let l=this.shadowRoot.getElementById(`submit-rej-${t.campaignId}`);l&&l.addEventListener("click",()=>{let c=this.shadowRoot.getElementById(`reason-${t.campaignId}`),b=c?c.value.trim():"";this.handleRejectSubmit(t.campaignId,b)})})}};var I="https://api.birtingur.app",u=class extends HTMLElement{constructor(){super();a(this,"campaignId",null);a(this,"viewerKey",null);a(this,"loading",!0);a(this,"stats",null);this.attachShadow({mode:"open"})}static get observedAttributes(){return["campaign-id","viewer-key","theme"]}connectedCallback(){this.campaignId=this.getAttribute("campaign-id"),this.viewerKey=this.getAttribute("viewer-key"),this.render(),this.fetchData()}attributeChangedCallback(e,i,t){i!==t&&(e==="campaign-id"&&(this.campaignId=t),e==="viewer-key"&&(this.viewerKey=t),this.isConnected&&(this.render(),this.fetchData()))}getActiveTheme(){let e=this.getAttribute("theme")||"auto";return e==="dark"?"dark":e==="light"?"light":typeof window!="undefined"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}async fetchData(){if(!this.campaignId||!this.viewerKey){this.showError("Vantar campaign-id e\xF0a viewer-key.");return}this.loading=!0,this.render();try{let e=await fetch(`${I}/v1/widgets/campaign/stats`,{headers:{Authorization:`Bearer ${this.viewerKey}`,"Content-Type":"application/json"}});if(!e.ok)throw new Error(`API skila\xF0i villu: ${e.status}`);let i=await e.json();this.stats=i.stats,this.loading=!1,this.render()}catch(e){console.error("Error fetching campaign stats widget:",e),this.showError("Ekki t\xF3kst a\xF0 s\xE6kja herfer\xF0aruppl\xFDsingar.")}}getStyles(){let e=this.getActiveTheme()==="dark";return`
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .card {
        background-color: ${e?"#0f172a":"#ffffff"};
        border: 1px solid ${e?"#1e293b":"#e2e8f0"};
        border-radius: 12px;
        padding: 20px;
        box-shadow: ${e?"none":"0 1px 3px 0 rgba(0, 0, 0, 0.05)"};
        color: ${e?"#f8fafc":"#0f172a"};
      }
      .title {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: ${e?"#94a3b8":"#475569"};
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
        background-color: ${e?"#1e293b/40":"#f8fafc"};
        border: 1px solid ${e?"#334155/30":"#f1f5f9"};
        border-radius: 8px;
        padding: 12px;
      }
      .metric-label {
        font-size: 11px;
        font-weight: 500;
        color: ${e?"#94a3b8":"#64748b"};
        margin-bottom: 2px;
      }
      .metric-value {
        font-size: 18px;
        font-weight: 700;
      }
      .sparkline-container {
        border-top: 1px solid ${e?"#1e293b":"#f1f5f9"};
        padding-top: 12px;
      }
      .sparkline-label {
        font-size: 11px;
        font-weight: 500;
        color: ${e?"#94a3b8":"#64748b"};
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
        color: ${e?"#94a3b8":"#64748b"};
      }
      .spinner {
        border: 2px solid ${e?"#334155":"#e2e8f0"};
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
        border: 1px solid ${e?"#7f1d1d":"#fee2e2"};
        background-color: ${e?"#450a0a/40":"#fef2f2"};
        color: ${e?"#fca5a5":"#b91c1c"};
        border-radius: 8px;
        padding: 16px;
        font-size: 13px;
        text-align: center;
      }
    `}showError(e){this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="error-card">
        <div>\u26A0\uFE0F ${e}</div>
      </div>
    `}render(){if(this.loading){this.shadowRoot.innerHTML=`
        <style>${this.getStyles()}</style>
        <div class="loading">
          <div class="spinner"></div>
          S\xE6ki herfer\xF0aruppl\xFDsingar...
        </div>
      `;return}if(!this.stats){this.showError("Engin t\xF6lfr\xE6\xF0ig\xF6gn fundust.");return}let e=this.getActiveTheme()==="dark",t=`${(this.stats.impressions>0?Math.min(100,this.stats.clicks/this.stats.impressions*100):0).toFixed(2)}%`,n=c=>h(c),s=[...this.stats.hours||[]].reverse(),l="";if(s.length>1){let c=Math.max(...s.map(p=>p.impressions),1),g=`M ${s.map((p,x)=>{let y=x/(s.length-1)*100,k=35-p.impressions/c*28;return`${y},${k}`}).join(" L ")}`,v=`${g} L 100,40 L 0,40 Z`;l=`
        <div class="sparkline-container">
          <div class="sparkline-label">Birtingarfl\xE6\xF0i herfer\xF0ar (s\xED\xF0ustu dagar/t\xEDmar)</div>
          <svg viewBox="0 0 100 40" class="sparkline-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="campaignSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="${e?"0.4":"0.2"}"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${v}" fill="url(#campaignSparklineGrad)" />
            <path d="${g}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `}this.shadowRoot.innerHTML=`
      <style>${this.getStyles()}</style>
      <div class="card">
        <div class="title">
          <span>\xC1rangur herfer\xF0ar (${this.campaignId})</span>
        </div>
        
        <div class="grid">
          <div class="metric-card">
            <div class="metric-label">Birtingar</div>
            <div class="metric-value">${n(this.stats.impressions)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Smellir</div>
            <div class="metric-value">${n(this.stats.clicks)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Smellihlutfall</div>
            <div class="metric-value">${t}</div>
          </div>
        </div>
        
        ${l}
      </div>
    `}};typeof window!="undefined"&&(customElements.get("adplatform-stats")||customElements.define("adplatform-stats",f),customElements.get("adplatform-approval-queue")||customElements.define("adplatform-approval-queue",m),customElements.get("adplatform-campaign-stats")||customElements.define("adplatform-campaign-stats",u));})();
