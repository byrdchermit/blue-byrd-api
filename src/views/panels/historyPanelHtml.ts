import { AppState, RecentRequest } from '../../types';

export function getHistoryPanelHtml(
  state: AppState,
  selectedId?: string
): string {
  const history = state.history || [];
  const selectedItem = history.find((h) => h.id === selectedId) || history[0];

  // Helper for escaping HTML
  const escapeHtml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Serialize history and collections for client-side instant responsiveness
  const historyJson = JSON.stringify(history).replace(/</g, '\\u003c');
  const collectionsJson = JSON.stringify(state.collections).replace(/</g, '\\u003c');
  const initialSelectedId = selectedItem ? selectedItem.id : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>History Inspector — byrdsnest api client</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --panel: var(--vscode-sideBar-background, #252526);
      --surface: var(--vscode-input-background, #2d2d2d);
      --border: var(--vscode-panel-border, var(--vscode-input-border, #3c3c3c));
      --text: var(--vscode-editor-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #8c8c8c);
      --primary: var(--vscode-button-background, #0e639c);
      --primary-hover: var(--vscode-button-hoverBackground, #1177bb);
      --primary-fg: var(--vscode-button-foreground, #ffffff);
      --success: var(--vscode-testing-iconPassed, #4ec9b0);
      --danger: var(--vscode-testing-iconFailed, #f14c4c);
      --warning: #cca700;
      --badge-bg: var(--vscode-badge-background, rgba(255,255,255,0.08));
      --badge-fg: var(--vscode-badge-foreground, var(--text));
      --active-item-bg: var(--vscode-list-activeSelectionBackground, #04395e);
      --hover-item-bg: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
    }

    .app {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Navigation Bar */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .top-bar-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .top-bar-left svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
      opacity: 0.8;
    }
    .top-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .top-badge {
      font-size: 11px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Workspace Master-Detail Grid */
    .workspace {
      display: flex;
      flex: 1;
      height: calc(100vh - 45px);
      overflow: hidden;
    }

    /* Left Master Pane */
    .master-pane {
      width: 380px;
      min-width: 300px;
      max-width: 480px;
      background: var(--panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .feed-controls {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--panel);
    }
    .search-box {
      width: 100%;
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }
    .search-box:focus {
      border-color: var(--primary);
    }

    .filter-chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .chip {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      border-radius: 12px;
      padding: 3px 10px;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }
    .chip:hover {
      color: var(--text);
      border-color: var(--text);
    }
    .chip.active {
      background: var(--primary);
      color: var(--primary-fg);
      border-color: var(--primary);
    }

    .feed-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 0;
    }

    /* Feed Card */
    .feed-card {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 9px 14px;
      cursor: pointer;
      border-left: 3px solid transparent;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      position: relative;
      transition: background 0.1s ease;
    }
    .feed-card:hover {
      background: var(--hover-item-bg);
    }
    .feed-card.selected {
      background: var(--active-item-bg);
      border-left-color: var(--primary-fg);
    }
    .feed-card.new-arrival {
      animation: flashNew 1.2s ease-out;
    }
    @keyframes flashNew {
      0% { background: rgba(78, 201, 176, 0.25); }
      100% { background: transparent; }
    }

    .feed-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .method-and-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .method-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      letter-spacing: 0.5px;
    }
    .method-get { color: #4ec9b0; background: rgba(78, 201, 176, 0.12); }
    .method-post { color: #ce9178; background: rgba(206, 145, 120, 0.12); }
    .method-put { color: #4fc1ff; background: rgba(79, 193, 255, 0.12); }
    .method-delete { color: #f14c4c; background: rgba(241, 76, 76, 0.12); }
    .method-patch { color: #dcdcaa; background: rgba(220, 220, 170, 0.12); }

    .status-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .status-success { color: var(--success); }
    .status-error { color: var(--danger); }
    .status-warning { color: var(--warning); }

    .card-url {
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
    }

    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    .card-metrics {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-delete-card {
      display: none;
      position: absolute;
      right: 8px;
      top: 8px;
      background: transparent;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 3px 6px;
      font-size: 14px;
      border-radius: 3px;
      line-height: 1;
    }
    .feed-card:hover .btn-delete-card {
      display: block;
    }
    .btn-delete-card:hover {
      color: var(--danger);
      background: rgba(241, 76, 76, 0.15);
    }

    /* Right Detail Pane */
    .detail-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      overflow-y: auto;
      padding: 16px 20px;
      gap: 16px;
    }

    .empty-detail {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 14px;
      color: var(--muted);
      text-align: center;
    }
    .empty-detail svg {
      width: 48px;
      height: 48px;
      opacity: 0.4;
      fill: currentColor;
    }

    /* Detail Hero Banner */
    .detail-hero {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .detail-url-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .detail-url {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 14px;
      font-weight: 500;
      word-break: break-all;
      flex: 1;
      color: var(--text);
    }

    .detail-stats-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }
    .detail-badges {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .pill-success {
      color: var(--success);
      border-color: rgba(78, 201, 176, 0.3);
    }
    .pill-error {
      color: var(--danger);
      border-color: rgba(241, 76, 76, 0.3);
    }

    .hero-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn:hover {
      background: var(--hover-item-bg);
      border-color: var(--text);
    }
    .btn-primary {
      background: var(--primary);
      color: var(--primary-fg);
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-danger {
      color: var(--danger);
    }
    .btn-danger:hover {
      background: rgba(241, 76, 76, 0.15);
      border-color: var(--danger);
    }

    /* Section Cards */
    .section-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border);
    }
    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
    }

    .tab-nav {
      display: flex;
      gap: 4px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .tab-btn.active {
      color: var(--text);
      background: var(--surface);
      font-weight: 600;
    }

    .section-body {
      padding: 12px 14px;
    }

    /* Tables */
    .table-view {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .table-view th {
      text-align: left;
      color: var(--muted);
      padding: 6px 8px;
      font-weight: 500;
      border-bottom: 1px solid var(--border);
    }
    .table-view td {
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      word-break: break-all;
    }
    .table-key {
      font-family: var(--vscode-editor-font-family, monospace);
      color: #9cdcfe;
      width: 32%;
    }
    .table-val {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--text);
    }

    /* Monospace Code View */
    .code-box {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 360px;
      overflow-y: auto;
    }

    /* Modal for Save to Collection */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-backdrop.open {
      display: flex;
    }
    .modal-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 440px;
      max-width: 90vw;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .modal-title {
      font-size: 15px;
      font-weight: 600;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-label {
      font-size: 12px;
      color: var(--muted);
    }
    .form-input, .form-select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
      outline: none;
    }
    .form-input:focus, .form-select:focus {
      border-color: var(--primary);
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Top Bar -->
    <header class="top-bar">
      <div class="top-bar-left">
        <svg viewBox="0 0 16 16">
          <path d="M8 0a8 8 0 1 0 8 8A8.01 8.01 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 6.5-6.5 6.51 6.51 0 0 1-6.5 6.5z"/>
          <path d="M7.5 3v5.25l4.5 2.67.75-1.23-3.75-2.22V3z"/>
        </svg>
        <span class="top-title">History Inspector</span>
        <span id="history-total-badge" class="top-badge">${history.length} runs</span>
      </div>
      <div class="top-actions">
        <button class="btn btn-danger" onclick="confirmClearHistory()">
          Clear All History
        </button>
      </div>
    </header>

    <!-- Workspace Master-Detail Split -->
    <main class="workspace">
      <!-- Master Left Pane -->
      <aside class="master-pane">
        <div class="feed-controls">
          <input
            type="text"
            id="history-search"
            class="search-box"
            placeholder="Search by URL, method, status..."
            oninput="applyFilters()"
          />
          <div class="filter-chips">
            <span class="chip active" data-filter="all" onclick="setFilter('all')">All</span>
            <span class="chip" data-filter="2xx" onclick="setFilter('2xx')">2xx Success</span>
            <span class="chip" data-filter="errors" onclick="setFilter('errors')">4xx/5xx Errors</span>
          </div>
        </div>

        <div id="history-list" class="feed-list">
          <!-- Cards rendered by client-side renderFeed() -->
        </div>
      </aside>

      <!-- Detail Right Pane -->
      <section id="detail-pane" class="detail-pane">
        <!-- Rendered by client-side renderDetail() -->
      </section>
    </main>
  </div>

  <!-- Save to Collection Modal -->
  <div id="save-modal" class="modal-backdrop">
    <div class="modal-box">
      <h3 class="modal-title">Save to Collection</h3>
      <div class="form-group">
        <label class="form-label">Request Name</label>
        <input type="text" id="save-request-name" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Target Collection</label>
        <select id="save-collection-select" class="form-select" onchange="populateFolderSelect()">
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Folder (Optional)</label>
        <select id="save-folder-select" class="form-select">
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeSaveModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitSaveToCollection()">Save Request</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let historyEntries = ${historyJson};
    let collections = ${collectionsJson};
    let currentSelectedId = '${initialSelectedId}';
    let currentFilter = 'all';
    let activeReqTab = 'headers';
    let activeResTab = 'body';
    let prettyResponse = true;

    // --- Helpers ---
    function formatSize(bytes) {
      if (bytes == null || isNaN(bytes)) return '--';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatTime(isoString) {
      if (!isoString) return '--';
      try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return isoString;
      }
    }

    function formatDate(isoString) {
      if (!isoString) return '';
      try {
        const d = new Date(isoString);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } catch {
        return '';
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // --- Filtering & Rendering Feed ---
    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-chips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === filter);
      });
      applyFilters();
    }

    function applyFilters() {
      const query = (document.getElementById('history-search').value || '').trim().toLowerCase();
      renderFeed(query);
    }

    function renderFeed(searchQuery = '') {
      const list = document.getElementById('history-list');
      const badge = document.getElementById('history-total-badge');
      badge.textContent = historyEntries.length + ' runs';

      if (!historyEntries.length) {
        list.innerHTML = \`
          <div style="padding: 24px 16px; text-align: center; color: var(--muted); font-size: 12px;">
            No requests executed yet.<br />Send a request to see it appear here!
          </div>
        \`;
        renderDetail();
        return;
      }

      const filtered = historyEntries.filter(item => {
        // Status chip filter
        const status = item.responseStatus || 0;
        if (currentFilter === '2xx' && (status < 200 || status >= 300)) return false;
        if (currentFilter === 'errors' && (status >= 200 && status < 400 && status !== 0)) return false;

        // Search text
        if (searchQuery) {
          const hay = [
            item.method,
            item.url,
            item.resolvedUrl,
            item.name,
            item.responseStatus,
            item.responseStatusText
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(searchQuery)) return false;
        }

        return true;
      });

      if (!filtered.length) {
        list.innerHTML = \`
          <div style="padding: 24px 16px; text-align: center; color: var(--muted); font-size: 12px;">
            No runs matching criteria.
          </div>
        \`;
        return;
      }

      // Ensure a valid selection exists among visible items
      if (!filtered.some(f => f.id === currentSelectedId) && filtered.length > 0) {
        currentSelectedId = filtered[0].id;
      }

      let html = '';
      filtered.forEach(item => {
        const isSelected = item.id === currentSelectedId;
        const method = (item.method || 'GET').toUpperCase();
        const status = item.responseStatus;
        const statusText = item.responseStatusText || '';
        const statusClass = !status ? 'status-error' : (status >= 200 && status < 300 ? 'status-success' : (status >= 400 ? 'status-error' : 'status-warning'));
        const displayUrl = item.resolvedUrl || item.url || '/';

        html += \`
          <div class="feed-card \${isSelected ? 'selected' : ''}" data-id="\${item.id}" onclick="selectItem('\${item.id}')">
            <button class="btn-delete-card" title="Delete run" onclick="deleteHistoryRun(event, '\${item.id}')">×</button>
            <div class="feed-card-header">
              <div class="method-and-status">
                <span class="method-tag method-\${method.toLowerCase()}">\${method}</span>
                <span class="status-tag \${statusClass}">\${status ? status + ' ' + statusText : 'Network Error'}</span>
              </div>
            </div>
            <div class="card-url" title="\${escapeHtml(displayUrl)}">\${escapeHtml(displayUrl)}</div>
            <div class="card-meta">
              <div class="card-metrics">
                <span>⚡ \${item.elapsedMs != null ? item.elapsedMs + 'ms' : '--'}</span>
                <span>💾 \${formatSize(item.responseSizeBytes)}</span>
              </div>
              <span>\${formatTime(item.timestamp)}</span>
            </div>
          </div>
        \`;
      });

      list.innerHTML = html;
      renderDetail();
    }

    // --- Item Selection ---
    function selectItem(id) {
      currentSelectedId = id;
      document.querySelectorAll('.feed-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.id === id);
      });
      renderDetail();
    }

    // --- Detail Pane Rendering ---
    function renderDetail() {
      const container = document.getElementById('detail-pane');
      const item = historyEntries.find(h => h.id === currentSelectedId);

      if (!item) {
        container.innerHTML = \`
          <div class="empty-detail">
            <svg viewBox="0 0 16 16">
              <path d="M8 0a8 8 0 1 0 8 8A8.01 8.01 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 6.5-6.5 6.51 6.51 0 0 1-6.5 6.5z"/>
              <path d="M7.5 3v5.25l4.5 2.67.75-1.23-3.75-2.22V3z"/>
            </svg>
            <div style="font-size: 14px; font-weight: 500;">No history run selected</div>
            <div style="font-size: 12px;">Choose an execution from the left feed to inspect details</div>
          </div>
        \`;
        return;
      }

      const method = (item.method || 'GET').toUpperCase();
      const status = item.responseStatus;
      const statusText = item.responseStatusText || '';
      const isSuccess = status && status >= 200 && status < 300;
      const pillClass = !status || status >= 400 ? 'pill-error' : (isSuccess ? 'pill-success' : '');
      const finalUrl = item.resolvedUrl || item.url || '';

      // Format response body (pretty JSON if possible)
      let formattedBody = item.responseBody || '';
      if (prettyResponse && formattedBody) {
        try {
          const parsed = JSON.parse(formattedBody);
          formattedBody = JSON.stringify(parsed, null, 2);
        } catch {
          // Keep raw
        }
      }

      // Headers entries
      const reqHeaders = item.headers || {};
      const resHeaders = item.responseHeaders || {};
      const reqHeaderKeys = Object.keys(reqHeaders);
      const resHeaderKeys = Object.keys(resHeaders);

      container.innerHTML = \`
        <!-- Hero Header -->
        <div class="detail-hero">
          <div class="detail-url-row">
            <span class="method-tag method-\${method.toLowerCase()}" style="font-size: 13px; padding: 3px 8px;">\${method}</span>
            <span class="detail-url">\${escapeHtml(finalUrl)}</span>
          </div>
          <div class="detail-stats-row">
            <div class="detail-badges">
              <span class="pill \${pillClass}">
                \${status ? status + ' ' + statusText : '⚠️ Network Error'}
              </span>
              <span class="pill">⚡ \${item.elapsedMs != null ? item.elapsedMs + ' ms' : '--'}</span>
              <span class="pill">💾 \${formatSize(item.responseSizeBytes)}</span>
              <span class="pill">🕒 \${formatDate(item.timestamp)} \${formatTime(item.timestamp)}</span>
            </div>
            <div class="hero-actions">
              <button class="btn btn-primary" onclick="openInRequestEditor('\${item.id}')">
                🚀 Open in Request Editor
              </button>
              <button class="btn" onclick="openSaveModal('\${item.id}')">
                💾 Save to Collection
              </button>
              <button class="btn" onclick="copyCurl('\${item.id}')">
                📋 Copy cURL
              </button>
              <button class="btn" onclick="copyResponse('\${item.id}')">
                📋 Copy Response
              </button>
            </div>
          </div>
        </div>

        <!-- Section 1: Request Details -->
        <div class="section-box">
          <div class="section-header">
            <div class="section-title">Request Dispatched</div>
            <div class="tab-nav">
              <button class="tab-btn \${activeReqTab === 'headers' ? 'active' : ''}" onclick="switchReqTab('headers')">
                Headers (\${reqHeaderKeys.length})
              </button>
              <button class="tab-btn \${activeReqTab === 'body' ? 'active' : ''}" onclick="switchReqTab('body')">
                Body
              </button>
              <button class="tab-btn \${activeReqTab === 'variables' ? 'active' : ''}" onclick="switchReqTab('variables')">
                Context & Variables
              </button>
            </div>
          </div>
          <div class="section-body">
            \${renderRequestTabContent(item, reqHeaders, reqHeaderKeys)}
          </div>
        </div>

        <!-- Section 2: Response Inspector -->
        <div class="section-box">
          <div class="section-header">
            <div class="section-title">Response Received</div>
            <div class="tab-nav">
              <button class="tab-btn \${activeResTab === 'body' ? 'active' : ''}" onclick="switchResTab('body')">
                Body (\${formatSize(item.responseSizeBytes)})
              </button>
              <button class="tab-btn \${activeResTab === 'headers' ? 'active' : ''}" onclick="switchResTab('headers')">
                Headers (\${resHeaderKeys.length})
              </button>
            </div>
          </div>
          <div class="section-body">
            \${renderResponseTabContent(item, formattedBody, resHeaders, resHeaderKeys)}
          </div>
        </div>
      \`;
    }

    function switchReqTab(tab) {
      activeReqTab = tab;
      renderDetail();
    }

    function switchResTab(tab) {
      activeResTab = tab;
      renderDetail();
    }

    function togglePrettyResponse() {
      prettyResponse = !prettyResponse;
      renderDetail();
    }

    function renderRequestTabContent(item, reqHeaders, keys) {
      if (activeReqTab === 'headers') {
        if (!keys.length) {
          return '<div style="color: var(--muted); font-size: 12px;">No request headers sent.</div>';
        }
        let rows = keys.map(k => \`
          <tr>
            <td class="table-key">\${escapeHtml(k)}</td>
            <td class="table-val">\${escapeHtml(reqHeaders[k])}</td>
          </tr>
        \`).join('');
        return \`<table class="table-view"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>\${rows}</tbody></table>\`;
      }

      if (activeReqTab === 'body') {
        if (!item.body) {
          return '<div style="color: var(--muted); font-size: 12px;">No request body payload.</div>';
        }
        let formatted = item.body;
        try {
          formatted = JSON.stringify(JSON.parse(item.body), null, 2);
        } catch {}
        return \`<div class="code-box">\${escapeHtml(formatted)}</div>\`;
      }

      if (activeReqTab === 'variables') {
        const profile = item.profile || 'None';
        const environment = item.environment || 'None';
        const collection = item.collection || 'None';
        const folder = item.folder || 'Root';
        return \`
          <table class="table-view">
            <thead><tr><th>Property</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td class="table-key">Profile</td><td class="table-val">\${escapeHtml(profile)}</td></tr>
              <tr><td class="table-key">Environment</td><td class="table-val">\${escapeHtml(environment)}</td></tr>
              <tr><td class="table-key">Collection</td><td class="table-val">\${escapeHtml(collection)}</td></tr>
              <tr><td class="table-key">Folder</td><td class="table-val">\${escapeHtml(folder)}</td></tr>
              <tr><td class="table-key">Original URL</td><td class="table-val">\${escapeHtml(item.url)}</td></tr>
            </tbody>
          </table>
        \`;
      }

      return '';
    }

    function renderResponseTabContent(item, formattedBody, resHeaders, keys) {
      if (activeResTab === 'body') {
        if (!item.responseBody) {
          return '<div style="color: var(--muted); font-size: 12px;">No response body returned.</div>';
        }
        return \`
          <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
            <button class="btn" style="font-size: 11px; padding: 2px 8px;" onclick="togglePrettyResponse()">
              \${prettyResponse ? 'View Raw' : 'Pretty JSON'}
            </button>
          </div>
          <div class="code-box">\${escapeHtml(formattedBody)}</div>
        \`;
      }

      if (activeResTab === 'headers') {
        if (!keys.length) {
          return '<div style="color: var(--muted); font-size: 12px;">No response headers received.</div>';
        }
        let rows = keys.map(k => \`
          <tr>
            <td class="table-key">\${escapeHtml(k)}</td>
            <td class="table-val">\${escapeHtml(resHeaders[k])}</td>
          </tr>
        \`).join('');
        return \`<table class="table-view"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>\${rows}</tbody></table>\`;
      }

      return '';
    }

    // --- Action Handlers ---
    function openInRequestEditor(id) {
      const item = historyEntries.find(h => h.id === id);
      if (!item) return;
      vscode.postMessage({
        type: 'openInEditor',
        historyId: id,
        item
      });
    }

    function copyCurl(id) {
      const item = historyEntries.find(h => h.id === id);
      if (!item) return;

      const method = (item.method || 'GET').toUpperCase();
      const url = item.resolvedUrl || item.url || '';

      // Shell-safe escaping: wrap in single-quotes and escape internal single quotes
      function shellEscape(str) {
        if (!str) return "''";
        return "'" + String(str).replace(/'/g, "'\\\\''") + "'";
      }

      let cmd = 'curl -X ' + method + ' ' + shellEscape(url);

      if (item.headers) {
        Object.entries(item.headers).forEach(([k, v]) => {
          if (k && v !== undefined) {
            cmd += ' -H ' + shellEscape(k + ': ' + v);
          }
        });
      }

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (item.bodyType === 'form-data' && Array.isArray(item.bodyFormData)) {
          item.bodyFormData.forEach(f => {
            if (f.enabled && f.key) {
              if (f.type === 'file') {
                cmd += ' -F ' + shellEscape(f.key + '=@' + (f.value || ''));
              } else {
                cmd += ' -F ' + shellEscape(f.key + '=' + (f.value || ''));
              }
            }
          });
        } else if (item.body) {
          cmd += ' -d ' + shellEscape(item.body);
        }
      }

      vscode.postMessage({ type: 'copyCurl', curl: cmd });
    }

    function copyResponse(id) {
      const item = historyEntries.find(h => h.id === id);
      if (!item || !item.responseBody) return;
      vscode.postMessage({ type: 'copyResponse', body: item.responseBody });
    }

    function deleteHistoryRun(event, id) {
      event.stopPropagation();
      vscode.postMessage({ type: 'deleteItem', historyId: id });
    }

    function confirmClearHistory() {
      vscode.postMessage({ type: 'clearAll' });
    }

    // --- Modal: Save to Collection ---
    let pendingSaveItem = null;

    function openSaveModal(id) {
      const item = historyEntries.find(h => h.id === id);
      if (!item) return;
      pendingSaveItem = item;

      const nameInput = document.getElementById('save-request-name');
      nameInput.value = item.name || \`\${item.method} \${item.url}\`;

      const colSelect = document.getElementById('save-collection-select');
      colSelect.innerHTML = collections.map(c => \`<option value="\${c.id}">\${escapeHtml(c.name)}</option>\`).join('');

      populateFolderSelect();
      document.getElementById('save-modal').classList.add('open');
    }

    function populateFolderSelect() {
      const colSelect = document.getElementById('save-collection-select');
      const folderSelect = document.getElementById('save-folder-select');
      const colId = colSelect.value;
      const col = collections.find(c => c.id === colId);

      let options = '<option value="">(Root - No Folder)</option>';
      if (col && Array.isArray(col.folders)) {
        options += col.folders.map(f => \`<option value="\${f.id}">\${escapeHtml(f.name)}</option>\`).join('');
      }
      folderSelect.innerHTML = options;
    }

    function closeSaveModal() {
      document.getElementById('save-modal').classList.remove('open');
      pendingSaveItem = null;
    }

    function submitSaveToCollection() {
      if (!pendingSaveItem) return;
      const name = (document.getElementById('save-request-name').value || '').trim();
      const colSelect = document.getElementById('save-collection-select');
      const folderSelect = document.getElementById('save-folder-select');
      const colId = colSelect.value;
      const folderId = folderSelect.value || undefined;

      vscode.postMessage({
        type: 'saveToCollection',
        historyId: pendingSaveItem.id,
        requestName: name,
        collectionId: colId,
        folderId: folderId,
        item: pendingSaveItem
      });

      closeSaveModal();
    }

    // --- Message Listener from Extension Host ---
    window.addEventListener('message', event => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'historyAdded') {
        // Prepend new entry
        historyEntries = [msg.entry, ...historyEntries.filter(h => h.id !== msg.entry.id)].slice(0, 50);
        currentSelectedId = msg.entry.id;
        applyFilters();

        // Flash animation
        setTimeout(() => {
          const card = document.querySelector(\`.feed-card[data-id="\${msg.entry.id}"]\`);
          if (card) card.classList.add('new-arrival');
        }, 50);
      } else if (msg.type === 'historyCleared') {
        historyEntries = [];
        currentSelectedId = '';
        renderFeed();
      } else if (msg.type === 'itemDeleted') {
        historyEntries = historyEntries.filter(h => h.id !== msg.historyId);
        if (currentSelectedId === msg.historyId) {
          currentSelectedId = historyEntries[0]?.id || '';
        }
        applyFilters();
      } else if (msg.type === 'selectItem') {
        if (msg.historyId) {
          selectItem(msg.historyId);
        }
      } else if (msg.type === 'stateUpdated') {
        if (msg.history) historyEntries = msg.history;
        if (msg.collections) collections = msg.collections;
        applyFilters();
      }
    });

    // Initial render
    renderFeed();
  </script>
</body>
</html>`;
}

