import { AppState, InheritedHeaderInfo, InheritedVariableInfo, RequestContext } from '../../types';
import { renderAuthCss, renderAuthFieldsHtml, getSharedAuthClientScript } from './sharedAuthHtml';

export function getRequestPanelHtml(
  context: RequestContext,
  state: AppState,
  initialInheritedVars: InheritedVariableInfo[] = [],
  initialInheritedHeaders: InheritedHeaderInfo[] = []
): string {
  const profileOptions = state.profiles
    .map((p) => {
      const isDuplicate = state.profiles.filter((o) => o.name === p.name).length > 1;
      const label = isDuplicate ? `${p.name} (${p.id.replace(/^profile-/, '')})` : p.name;
      const isSelected = p.id === context.profileId || p.name === context.profile || p.id === context.profile;
      return `<option value="${p.name}" data-id="${p.id}" ${isSelected ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  const envKeys = Object.keys(state.environments);
  const environmentOptions = envKeys
    .map(
      (key) =>
        `<option value="${key}" ${key === (context.environment || envKeys[0]) ? 'selected' : ''}>${key}</option>`
    )
    .join('');

  const collectionName = context.collection || state.collections[0]?.name || 'Demo Collection';
  const displayFolder = context.folder && context.folder !== 'Root' ? context.folder : 'Root';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>bluebyrd Request</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-sideBar-background);
      --surface: var(--vscode-input-background, #252526);
      --border: var(--vscode-panel-border, var(--vscode-input-border, #3c3c3c));
      --text: var(--vscode-editor-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #8c8c8c);
      --primary: var(--vscode-button-background, #0e639c);
      --primary-fg: var(--vscode-button-foreground, #ffffff);
      --success: var(--vscode-testing-iconPassed, #4ec9b0);
      --danger: var(--vscode-testing-iconFailed, #f14c4c);
      --warning: #cca700;
      --badge-bg: var(--vscode-badge-background, rgba(255,255,255,0.08));
      --badge-fg: var(--vscode-badge-foreground, var(--text));
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
    }
    body { padding: 14px; }

    .app {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: calc(100vh - 28px);
    }

    /* Top Context Bar */
    .context-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
    }
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    .crumb-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--badge-bg);
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 500;
    }
    .crumb-separator { color: var(--muted); }

    .selectors {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .selector-group {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    .select-control {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      outline: none;
    }

    /* URL / Action Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
    }
    .method-select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 6px 10px;
      font-weight: 600;
      min-width: 100px;
      outline: none;
    }
    .url-input {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 7px 12px;
      font-family: monospace;
      font-size: 13px;
      outline: none;
    }
    .url-input:focus { border-color: var(--primary); }

    /* Button styles */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 14px;
      border-radius: 4px;
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      outline: none;
      user-select: none;
    }
    .btn-primary {
      background: var(--primary);
      color: var(--primary-fg);
    }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-secondary {
      background: var(--surface);
      border-color: var(--border);
      color: var(--text);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.06); }

    .btn-group {
      display: inline-flex;
      position: relative;
    }
    .btn-split-main {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    .btn-split-toggle {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      border-left: 1px solid rgba(255,255,255,0.18);
      padding: 7px 8px;
    }

    .dropdown-menu {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 100;
      min-width: 140px;
    }
    .dropdown-menu.show { display: flex; flex-direction: column; }
    .dropdown-item {
      padding: 8px 12px;
      background: transparent;
      border: none;
      color: var(--text);
      text-align: left;
      cursor: pointer;
      font-size: 12px;
    }
    .dropdown-item:hover { background: rgba(255,255,255,0.08); }

    /* Main Grid: Request on left, Response on right */
    .main-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr);
      gap: 12px;
      flex: 1;
      min-height: 0;
    }
    @media (max-width: 960px) {
      .main-grid { grid-template-columns: 1fr; }
    }

    .panel-box {
      display: flex;
      flex-direction: column;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      min-height: 380px;
    }

    /* Tabs */
    .tab-header {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: rgba(0,0,0,0.15);
      overflow-x: auto;
    }
    .tab-btn {
      padding: 8px 14px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    .tab-btn.active {
      color: var(--text);
      border-bottom-color: var(--primary);
      background: rgba(255,255,255,0.03);
    }
    .tab-content {
      padding: 12px;
      flex: 1;
      display: none;
      overflow: auto;
    }
    .tab-content.active { display: block; }
    #tab-resp-body {
      padding: 0;
    }
    #tab-resp-body.active {
      display: flex;
      flex-direction: column;
    }
    #tab-resp-headers {
      padding: 0;
    }

    /* Tables & Rows */
    .param-table {
      width: 100%;
      border-collapse: collapse;
    }
    .param-row {
      display: grid;
      grid-template-columns: 32px 1fr 1fr 70px 36px;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .param-input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }
    .param-input:focus { border-color: var(--primary); }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover { color: var(--danger); background: rgba(255,255,255,0.05); }

    /* Inherited Sections & Tables */
    .inherited-section {
      margin-top: 14px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }
    .inherited-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .inherited-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .inherited-table {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .inherited-row {
      display: grid;
      grid-template-columns: 1fr 1.2fr auto auto;
      gap: 8px;
      align-items: center;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 12px;
      transition: background 0.15s ease;
    }
    .inherited-row:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .inherited-row.is-overridden {
      opacity: 0.55;
    }
    .inherited-row.is-overridden .inherited-key,
    .inherited-row.is-overridden .inherited-val {
      text-decoration: line-through;
    }
    .inherited-key {
      font-family: monospace;
      font-weight: 600;
      color: #9cdcfe;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inherited-val {
      font-family: monospace;
      color: #ce9178;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .source-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    .source-dynamic { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; border: 1px solid rgba(78, 201, 176, 0.3); }
    .source-profile { background: rgba(79, 193, 255, 0.15); color: #4fc1ff; border: 1px solid rgba(79, 193, 255, 0.3); }
    .source-parent-environment { background: rgba(197, 134, 192, 0.15); color: #c586c0; border: 1px solid rgba(197, 134, 192, 0.3); }
    .source-environment { background: rgba(206, 145, 120, 0.15); color: #ce9178; border: 1px solid rgba(206, 145, 120, 0.3); }
    .source-collection { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; border: 1px solid rgba(78, 201, 176, 0.3); }
    .source-folder { background: rgba(220, 220, 170, 0.15); color: #dcdcaa; border: 1px solid rgba(220, 220, 170, 0.3); }
    .overridden-pill {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: rgba(241, 76, 76, 0.15);
      color: #f14c4c;
      border: 1px solid rgba(241, 76, 76, 0.3);
      margin-left: 6px;
    }
    .override-btn {
      font-size: 11px;
      padding: 2px 8px;
      height: 24px;
      cursor: pointer;
    }

    .textarea-box {
      width: 100%;
      height: 100%;
      min-height: 240px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      resize: vertical;
      outline: none;
    }

    /* Body Type Selector */
    .body-nav {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      align-items: center;
    }
    .radio-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--muted);
      cursor: pointer;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid transparent;
      user-select: none;
      white-space: nowrap;
    }
    .radio-pill:hover {
      background: rgba(255,255,255,0.04);
      color: var(--text);
    }
    .radio-pill input[type="radio"] {
      cursor: pointer;
      margin: 0;
    }
    .radio-pill.selected {
      color: var(--text);
      font-weight: 600;
      background: rgba(255,255,255,0.06);
      border-color: var(--border);
    }
    .body-subview {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 240px;
    }
    .body-subview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .body-mime-badge {
      font-size: 11px;
      color: var(--muted);
      font-family: monospace;
    }

    /* Auth tab */
    .auth-config {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 480px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-group label {
      font-size: 12px;
      color: var(--muted);
    }

    /* Response Panel */
    .response-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-badges {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      background: #555555;
    }
    .pill.status-2xx { background: #238636; }
    .pill.status-3xx { background: #1f6feb; }
    .pill.status-4xx { background: #d29922; }
    .pill.status-5xx { background: #da3633; }
    .pill.status-err { background: #da3633; }

    .meta-tag {
      font-size: 11px;
      color: var(--muted);
    }

    .response-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .response-body-pre {
      flex: 1;
      margin: 0;
      padding: 12px;
      background: var(--surface);
      color: var(--text);
      font-family: Consolas, Monaco, "Courier New", monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
    }

    .headers-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .headers-table th, .headers-table td {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .headers-table th {
      color: var(--muted);
      position: sticky;
      top: 0;
      background: var(--panel);
      z-index: 1;
      font-weight: 600;
    }
    .headers-table td.header-key { font-weight: 600; width: 35%; word-break: break-all; }
    .headers-table td.header-val { word-break: break-all; }

    ${renderAuthCss()}
  </style>
</head>
<body>
  <div class="app">
    <!-- Top Context Bar -->
    <div class="context-bar">
      <div class="breadcrumbs">
        <span class="crumb-pill" id="crumb-col">${collectionName}</span>
        <span class="crumb-separator">›</span>
        <span class="crumb-pill" id="crumb-folder">${displayFolder}</span>
      </div>
      <div class="selectors">
        <div class="selector-group">
          <span>Profile:</span>
          <select id="select-profile" class="select-control">${profileOptions}</select>
        </div>
        <div class="selector-group">
          <span>Environment:</span>
          <select id="select-env" class="select-control">${environmentOptions}</select>
        </div>
      </div>
    </div>

    <!-- Request Toolbar -->
    <div class="toolbar">
      <select id="method-select" class="method-select">
        <option ${context.method === 'GET' ? 'selected' : ''}>GET</option>
        <option ${context.method === 'POST' ? 'selected' : ''}>POST</option>
        <option ${context.method === 'PUT' ? 'selected' : ''}>PUT</option>
        <option ${context.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
        <option ${context.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
        <option ${context.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
        <option ${context.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
      </select>

      <input
        id="url-input"
        class="url-input"
        type="text"
        placeholder="Enter URL or {{baseUrl}}/endpoint"
        value="${context.url || ''}"
      />

      <div class="btn-group">
        <button id="btn-send" class="btn btn-primary btn-split-main">Send</button>
        <button id="btn-send-toggle" class="btn btn-primary btn-split-toggle">▾</button>
        <div id="send-dropdown" class="dropdown-menu">
          <button class="dropdown-item" data-action="preview">Preview Resolved</button>
          <button class="dropdown-item" data-action="curl">Copy as cURL</button>
        </div>
      </div>

      <button id="btn-save" class="btn btn-secondary">Save</button>
    </div>

    <!-- Main Workspace -->
    <div class="main-grid">
      <!-- Request Builder -->
      <div class="panel-box">
        <div class="tab-header">
          <button class="tab-btn active" data-tab="tab-params">Variables</button>
          <button class="tab-btn" data-tab="tab-headers">Headers</button>
          <button class="tab-btn" data-tab="tab-body">Body</button>
          <button class="tab-btn" data-tab="tab-auth">Auth</button>
          <button class="tab-btn" data-tab="tab-notes">Notes</button>
        </div>

        <!-- Tab: Variables -->
        <div id="tab-params" class="tab-content active">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.5px;">Request Variables</div>
          <div id="var-rows"></div>
          <div style="margin-top: 8px;">
            <button id="btn-add-var" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;">+ Add Variable</button>
          </div>

          <div id="inherited-vars-section" class="inherited-section">
            <div class="inherited-header-bar">
              <span class="inherited-title">
                Inherited Variables
              </span>
              <span class="meta-tag" id="inherited-vars-count">0 available</span>
            </div>
            <div id="inherited-var-rows" class="inherited-table"></div>
          </div>
        </div>

        <!-- Tab: Headers -->
        <div id="tab-headers" class="tab-content">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.5px;">Request Headers</div>
          <div id="header-rows"></div>
          <div style="margin-top: 8px;">
            <button id="btn-add-header" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;">+ Add Header</button>
          </div>

          <div id="inherited-headers-section" class="inherited-section">
            <div class="inherited-header-bar">
              <span class="inherited-title">
                Inherited Headers
              </span>
              <span class="meta-tag" id="inherited-headers-count">0 inherited</span>
            </div>
            <div id="inherited-header-rows" class="inherited-table"></div>
          </div>
        </div>

        <!-- Tab: Body -->
        <div id="tab-body" class="tab-content">
          <div class="body-nav">
            <label class="radio-pill" data-type="none">
              <input type="radio" name="bodyType" value="none" />
              <span>none</span>
            </label>
            <label class="radio-pill" data-type="json">
              <input type="radio" name="bodyType" value="json" />
              <span>JSON</span>
            </label>
            <label class="radio-pill" data-type="form-urlencoded">
              <input type="radio" name="bodyType" value="form-urlencoded" />
              <span>x-www-form-urlencoded</span>
            </label>
            <label class="radio-pill" data-type="form-data">
              <input type="radio" name="bodyType" value="form-data" />
              <span>form-data</span>
            </label>
            <label class="radio-pill" data-type="text">
              <input type="radio" name="bodyType" value="text" />
              <span>text</span>
            </label>
            <label class="radio-pill" data-type="xml">
              <input type="radio" name="bodyType" value="xml" />
              <span>XML</span>
            </label>
            <label class="radio-pill" data-type="raw">
              <input type="radio" name="bodyType" value="raw" />
              <span>raw</span>
            </label>
          </div>

          <!-- None Subview -->
          <div id="body-view-none" class="body-subview" style="display: none; align-items: center; justify-content: center; padding: 40px 16px; text-align: center; color: var(--muted);">
            <div>
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 500;">This request does not have a body.</p>
              <p style="margin: 0; font-size: 11px;">Select a body type above to attach a payload.</p>
            </div>
          </div>

          <!-- JSON Subview -->
          <div id="body-view-json" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">application/json</span>
              <button id="btn-fmt-json" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;">Beautify JSON</button>
            </div>
            <textarea id="req-body-json" class="textarea-box" placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}"></textarea>
          </div>

          <!-- Form URL Encoded Subview -->
          <div id="body-view-form-urlencoded" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">application/x-www-form-urlencoded</span>
              <button id="btn-toggle-urlencoded-mode" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;">Bulk Edit</button>
            </div>
            <div id="urlencoded-table-view">
              <div id="urlencoded-rows"></div>
              <div style="margin-top: 8px;">
                <button id="btn-add-urlencoded" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;">+ Add Field</button>
              </div>
            </div>
            <div id="urlencoded-bulk-view" style="display: none;">
              <textarea id="req-body-urlencoded-bulk" class="textarea-box" placeholder="key1=value1&#10;key2=value2" style="min-height: 200px;"></textarea>
            </div>
          </div>

          <!-- Form Data Subview -->
          <div id="body-view-form-data" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">multipart/form-data</span>
            </div>
            <div id="formdata-rows"></div>
            <div style="margin-top: 8px;">
              <button id="btn-add-formdata" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;">+ Add Field</button>
            </div>
          </div>

          <!-- Text Subview -->
          <div id="body-view-text" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">text/plain</span>
            </div>
            <textarea id="req-body-text" class="textarea-box" placeholder="Plain text request body..."></textarea>
          </div>

          <!-- XML Subview -->
          <div id="body-view-xml" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">application/xml</span>
              <button id="btn-fmt-xml" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;">Format XML</button>
            </div>
            <textarea id="req-body-xml" class="textarea-box" placeholder="&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#10;&lt;root&gt;&#10;&lt;/root&gt;"></textarea>
          </div>

          <!-- Raw Subview -->
          <div id="body-view-raw" class="body-subview" style="display: none;">
            <div class="body-subview-header">
              <span class="body-mime-badge">Raw payload</span>
            </div>
            <textarea id="req-body-raw" class="textarea-box" placeholder="Raw request payload..."></textarea>
          </div>
        </div>

        <!-- Tab: Auth -->
        <div id="tab-auth" class="tab-content">
          <div class="auth-config" style="display: flex; flex-direction: column; gap: 14px; max-width: 580px;">
            <div class="form-group">
              <label class="form-label" for="auth-inheritance">Inheritance</label>
              <select id="auth-inheritance" class="form-control">
                <option value="both" ${context.auth?.inheritFromProfile !== false && context.auth?.inheritFromEnvironment !== false ? 'selected' : ''}>Inherit from Profile + Environment</option>
                <option value="profile" ${context.auth?.inheritFromProfile !== false && context.auth?.inheritFromEnvironment === false ? 'selected' : ''}>Inherit from Profile</option>
                <option value="environment" ${context.auth?.inheritFromProfile === false && context.auth?.inheritFromEnvironment !== false ? 'selected' : ''}>Inherit from Environment</option>
                <option value="none" ${context.auth?.inheritFromProfile === false && context.auth?.inheritFromEnvironment === false ? 'selected' : ''}>No Inheritance (Manual Override)</option>
              </select>
              <span class="help-hint">When set to No Inheritance, the credentials configured below will be sent with this request.</span>
            </div>

            ${renderAuthFieldsHtml(context.auth?.auth, 'this request')}
          </div>
        </div>

        <!-- Tab: Notes -->
        <div id="tab-notes" class="tab-content">
          <textarea id="req-notes" class="textarea-box" placeholder="Documentation or notes for this request...">${context.notes || ''}</textarea>
        </div>
      </div>

      <!-- Response Inspector -->
      <div class="panel-box">
        <div class="response-status-bar">
          <div class="status-badges">
            <span id="resp-status" class="pill">Waiting</span>
            <span id="resp-time" class="meta-tag"></span>
            <span id="resp-size" class="meta-tag"></span>
          </div>
          <div class="response-actions">
            <button id="btn-copy-resp" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;">Copy</button>
          </div>
        </div>

        <div class="tab-header">
          <button class="tab-btn active" data-tab="tab-resp-body">Response Body</button>
          <button class="tab-btn" data-tab="tab-resp-headers">Headers <span id="resp-header-count"></span></button>
        </div>

        <div id="tab-resp-body" class="tab-content active">
          <pre id="resp-body-text" class="response-body-pre">Click 'Send' to dispatch request.</pre>
        </div>

        <div id="tab-resp-headers" class="tab-content">
          <table class="headers-table">
            <thead>
              <tr><th>Header</th><th>Value</th></tr>
            </thead>
            <tbody id="resp-headers-body">
              <tr><td colspan="2" style="color: var(--muted);">No response received.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    ${getSharedAuthClientScript()}

    // Context / ID tracking
    let currentRequestId = "${context.requestId || context.id || ''}";
    let initialHeaders = ${JSON.stringify(context.headers || {})};
    let initialVars = ${JSON.stringify(context.variables || [])};
    let initialInheritedVars = ${JSON.stringify(initialInheritedVars).replace(/</g, '\\u003c')};
    let initialInheritedHeaders = ${JSON.stringify(initialInheritedHeaders).replace(/</g, '\\u003c')};
    let currentInheritedVars = initialInheritedVars;
    let currentInheritedHeaders = initialInheritedHeaders;
    let initialBodyType = "${context.bodyType || ''}";
    let initialBody = ${JSON.stringify(context.body || '')};
    let initialBodyFormData = ${JSON.stringify(context.bodyFormData || [])};

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const header = btn.parentElement;
        const panelBox = header.parentElement;
        header.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetId = btn.getAttribute('data-tab');
        panelBox.querySelectorAll('.tab-content').forEach(content => {
          content.classList.toggle('active', content.id === targetId);
        });
      });
    });

    // Dropdown toggle
    const toggleBtn = document.getElementById('btn-send-toggle');
    const sendDropdown = document.getElementById('send-dropdown');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => sendDropdown.classList.remove('show'));

    // Variables UI Builder
    const varRowsContainer = document.getElementById('var-rows');
    function addVarRow(name = '', value = '', enabled = true, hidden = false) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = \`
        <input type="checkbox" \${enabled ? 'checked' : ''} data-role="enabled" style="cursor: pointer;" />
        <input class="param-input" type="text" placeholder="Key" value="\${name}" data-role="name" />
        <input class="param-input" type="\${hidden ? 'password' : 'text'}" placeholder="Value" value="\${value}" data-role="value" />
        <label style="font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 4px; cursor: pointer;">
          <input type="checkbox" \${hidden ? 'checked' : ''} data-role="hidden" /> Mask
        </label>
        <button class="icon-btn" title="Delete" data-role="delete">✕</button>
      \`;

      const hiddenCheck = row.querySelector('[data-role="hidden"]');
      const valueInput = row.querySelector('[data-role="value"]');
      hiddenCheck.addEventListener('change', () => {
        valueInput.type = hiddenCheck.checked ? 'password' : 'text';
      });

      row.querySelector('[data-role="delete"]').addEventListener('click', () => {
        row.remove();
        renderInheritedVars();
      });

      row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => renderInheritedVars());
        input.addEventListener('change', () => renderInheritedVars());
      });

      varRowsContainer.appendChild(row);
      renderInheritedVars();
      return row;
    }

    document.getElementById('btn-add-var').addEventListener('click', () => addVarRow());

    // Populate initial variables
    if (initialVars.length > 0) {
      initialVars.forEach(v => addVarRow(v.name, v.value, v.enabled !== false, v.hidden === true));
    } else {
      addVarRow();
    }

    // Headers UI Builder
    const headerRowsContainer = document.getElementById('header-rows');
    function addHeaderRow(key = '', value = '', enabled = true) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = \`
        <input type="checkbox" \${enabled ? 'checked' : ''} data-role="enabled" style="cursor: pointer;" />
        <input class="param-input" type="text" placeholder="Header name" value="\${key}" data-role="key" />
        <input class="param-input" type="text" placeholder="Value" value="\${value}" data-role="value" />
        <div></div>
        <button class="icon-btn" title="Delete" data-role="delete">✕</button>
      \`;

      row.querySelector('[data-role="delete"]').addEventListener('click', () => {
        row.remove();
        renderInheritedHeaders();
      });

      row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => renderInheritedHeaders());
        input.addEventListener('change', () => renderInheritedHeaders());
      });

      headerRowsContainer.appendChild(row);
      renderInheritedHeaders();
      return row;
    }

    document.getElementById('btn-add-header').addEventListener('click', () => addHeaderRow());

    // Populate initial headers
    const headerEntries = Object.entries(initialHeaders);
    if (headerEntries.length > 0) {
      headerEntries.forEach(([k, v]) => addHeaderRow(k, v, true));
    } else {
      addHeaderRow('Accept', 'application/json', true);
    }

    // --- Inherited Variables Inspector ---
    const inheritedVarsContainer = document.getElementById('inherited-var-rows');
    const inheritedVarsCount = document.getElementById('inherited-vars-count');

    function renderInheritedVars() {
      if (!inheritedVarsContainer) return;
      inheritedVarsContainer.innerHTML = '';
      if (!currentInheritedVars || currentInheritedVars.length === 0) {
        inheritedVarsContainer.innerHTML = '<div style="font-size: 11px; color: var(--muted); padding: 8px 4px;">No inherited variables for this context.</div>';
        if (inheritedVarsCount) inheritedVarsCount.textContent = '0 available';
        return;
      }

      // Check current request variable keys to know if overridden
      const reqVarKeys = Array.from(varRowsContainer.querySelectorAll('.param-row')).map(row => {
        const en = row.querySelector('[data-role="enabled"]')?.checked;
        const k = (row.querySelector('[data-role="name"]')?.value || '').trim();
        return en && k ? k : null;
      }).filter(Boolean);

      if (inheritedVarsCount) inheritedVarsCount.textContent = currentInheritedVars.length + ' available';

      currentInheritedVars.forEach(item => {
        const isOverridden = item.isOverridden || reqVarKeys.includes(item.key);
        const row = document.createElement('div');
        row.className = 'inherited-row' + (isOverridden ? ' is-overridden' : '');

        const keySpan = document.createElement('span');
        keySpan.className = 'inherited-key';
        keySpan.textContent = '{{' + item.key + '}}';
        keySpan.title = item.key;

        const valSpan = document.createElement('span');
        valSpan.className = 'inherited-val';
        valSpan.textContent = item.value;
        valSpan.title = item.value;

        const badgeContainer = document.createElement('div');
        badgeContainer.style.display = 'flex';
        badgeContainer.style.alignItems = 'center';
        badgeContainer.style.gap = '4px';

        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'source-badge source-' + item.source;
        sourceBadge.textContent = item.sourceName;
        badgeContainer.appendChild(sourceBadge);

        if (isOverridden) {
          const overPill = document.createElement('span');
          overPill.className = 'overridden-pill';
          overPill.textContent = 'Overridden';
          badgeContainer.appendChild(overPill);
        }

        const actionDiv = document.createElement('div');
        if (item.source !== 'dynamic' && !isOverridden) {
          const overrideBtn = document.createElement('button');
          overrideBtn.className = 'btn btn-secondary override-btn';
          overrideBtn.textContent = '+ Override';
          overrideBtn.title = 'Copy to request variables to override';
          overrideBtn.addEventListener('click', () => {
            const newRow = addVarRow(item.key, item.value, true, false);
            const valInp = newRow.querySelector('[data-role="value"]');
            if (valInp) valInp.focus();
          });
          actionDiv.appendChild(overrideBtn);
        }

        row.appendChild(keySpan);
        row.appendChild(valSpan);
        row.appendChild(badgeContainer);
        row.appendChild(actionDiv);

        inheritedVarsContainer.appendChild(row);
      });
    }

    // --- Inherited Headers Inspector ---
    const inheritedHeadersContainer = document.getElementById('inherited-header-rows');
    const inheritedHeadersCount = document.getElementById('inherited-headers-count');

    function renderInheritedHeaders() {
      if (!inheritedHeadersContainer) return;
      inheritedHeadersContainer.innerHTML = '';
      if (!currentInheritedHeaders || currentInheritedHeaders.length === 0) {
        inheritedHeadersContainer.innerHTML = '<div style="font-size: 11px; color: var(--muted); padding: 8px 4px;">No inherited headers for this context.</div>';
        if (inheritedHeadersCount) inheritedHeadersCount.textContent = '0 inherited';
        return;
      }

      // Check current request header keys to know if overridden
      const reqHeaderKeys = Array.from(headerRowsContainer.querySelectorAll('.param-row')).map(row => {
        const en = row.querySelector('[data-role="enabled"]')?.checked;
        const k = (row.querySelector('[data-role="key"]')?.value || '').trim().toLowerCase();
        return en && k ? k : null;
      }).filter(Boolean);

      if (inheritedHeadersCount) inheritedHeadersCount.textContent = currentInheritedHeaders.length + ' inherited';

      currentInheritedHeaders.forEach(item => {
        const isOverridden = item.isOverridden || reqHeaderKeys.includes(item.key.toLowerCase());
        const row = document.createElement('div');
        row.className = 'inherited-row' + (isOverridden ? ' is-overridden' : '');

        const keySpan = document.createElement('span');
        keySpan.className = 'inherited-key';
        keySpan.textContent = item.key;
        keySpan.title = item.key;

        const valSpan = document.createElement('span');
        valSpan.className = 'inherited-val';
        valSpan.textContent = item.value;
        valSpan.title = item.value;

        const badgeContainer = document.createElement('div');
        badgeContainer.style.display = 'flex';
        badgeContainer.style.alignItems = 'center';
        badgeContainer.style.gap = '4px';

        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'source-badge source-' + item.source;
        sourceBadge.textContent = item.sourceName;
        badgeContainer.appendChild(sourceBadge);

        if (isOverridden) {
          const overPill = document.createElement('span');
          overPill.className = 'overridden-pill';
          overPill.textContent = 'Overridden';
          badgeContainer.appendChild(overPill);
        }

        const actionDiv = document.createElement('div');
        if (!isOverridden) {
          const overrideBtn = document.createElement('button');
          overrideBtn.className = 'btn btn-secondary override-btn';
          overrideBtn.textContent = '+ Override';
          overrideBtn.title = 'Copy to request headers to override';
          overrideBtn.addEventListener('click', () => {
            const newRow = addHeaderRow(item.key, item.value, true);
            const valInp = newRow.querySelector('[data-role="value"]');
            if (valInp) valInp.focus();
          });
          actionDiv.appendChild(overrideBtn);
        }

        row.appendChild(keySpan);
        row.appendChild(valSpan);
        row.appendChild(badgeContainer);
        row.appendChild(actionDiv);

        inheritedHeadersContainer.appendChild(row);
      });
    }

    // Helper functions for reading request state
    function getRequestVariables() {
      const vars = [];
      varRowsContainer.querySelectorAll('.param-row').forEach(row => {
        const enabled = row.querySelector('[data-role="enabled"]').checked;
        const name = (row.querySelector('[data-role="name"]').value || '').trim();
        const value = row.querySelector('[data-role="value"]').value;
        const hidden = row.querySelector('[data-role="hidden"]').checked;
        if (name) {
          vars.push({ name, value, enabled, hidden });
        }
      });
      return vars;
    }

    function getRequestHeaders() {
      const headers = {};
      headerRowsContainer.querySelectorAll('.param-row').forEach(row => {
        const enabled = row.querySelector('[data-role="enabled"]').checked;
        const key = (row.querySelector('[data-role="key"]').value || '').trim();
        const value = row.querySelector('[data-role="value"]').value;
        if (enabled && key) {
          headers[key] = value;
        }
      });
      return headers;
    }

    function requestInheritedData() {
      const selectEnv = document.getElementById('select-env');
      const selectProfile = document.getElementById('select-profile');
      vscode.postMessage({
        type: 'getInherited',
        payload: {
          profile: selectProfile ? selectProfile.value : undefined,
          profileId: selectProfile && selectProfile.selectedOptions[0] ? selectProfile.selectedOptions[0].dataset.id : undefined,
          environment: selectEnv ? selectEnv.value : undefined,
          collection: "${context.collection || 'Demo Collection'}",
          folder: "${context.folder || 'Root'}",
          variables: getRequestVariables(),
          headers: getRequestHeaders()
        }
      });
    }

    const selectEnvEl = document.getElementById('select-env');
    if (selectEnvEl) {
      selectEnvEl.addEventListener('change', () => requestInheritedData());
    }
    const selectProfileEl = document.getElementById('select-profile');
    if (selectProfileEl) {
      selectProfileEl.addEventListener('change', () => requestInheritedData());
    }

    // Initial render of inherited tables
    renderInheritedVars();
    renderInheritedHeaders();

    // Form row builder for form-urlencoded
    function addFormRow(container, key = '', value = '', enabled = true) {
      const row = document.createElement('div');
      row.className = 'param-row';
      const checkedAttr = enabled ? 'checked' : '';
      row.innerHTML =
        '<input type="checkbox" ' + checkedAttr + ' data-role="enabled" style="cursor: pointer;" />' +
        '<input class="param-input" type="text" placeholder="Key" value="' + key.replace(/"/g, '&quot;') + '" data-role="key" />' +
        '<input class="param-input" type="text" placeholder="Value" value="' + value.replace(/"/g, '&quot;') + '" data-role="value" />' +
        '<div></div>' +
        '<button class="icon-btn" title="Delete" data-role="delete">✕</button>';
      row.querySelector('[data-role="delete"]').addEventListener('click', () => row.remove());
      container.appendChild(row);
      return row;
    }

    // Multipart Form-Data row builder with file upload support
    let formDataRowCounter = 0;
    function addFormDataRow(key = '', value = '', enabled = true, type = 'text') {
      const row = document.createElement('div');
      row.className = 'param-row formdata-row';
      const rowId = 'fd-' + (++formDataRowCounter) + '-' + Date.now();
      row.setAttribute('data-row-id', rowId);
      const checkedAttr = enabled ? 'checked' : '';
      const isFile = type === 'file';

      row.innerHTML =
        '<input type="checkbox" ' + checkedAttr + ' data-role="enabled" style="cursor: pointer;" />' +
        '<input class="param-input" type="text" placeholder="Key" value="' + key.replace(/"/g, '&quot;') + '" data-role="key" />' +
        '<div style="display: flex; gap: 4px; align-items: center; width: 100%; min-width: 0;">' +
          '<input class="param-input" type="text" placeholder="' + (isFile ? 'Select or enter file path...' : 'Value') + '" value="' + value.replace(/"/g, '&quot;') + '" data-role="value" style="flex: 1; min-width: 0;" />' +
          '<button type="button" class="btn btn-secondary" data-role="browse" style="display: ' + (isFile ? 'inline-block' : 'none') + '; padding: 3px 8px; font-size: 11px; white-space: nowrap; height: 26px;">Browse...</button>' +
        '</div>' +
        '<select class="param-input" data-role="type" style="width: 100%; padding: 4px 2px; font-size: 11px; cursor: pointer;">' +
          '<option value="text"' + (!isFile ? ' selected' : '') + '>Text</option>' +
          '<option value="file"' + (isFile ? ' selected' : '') + '>File</option>' +
        '</select>' +
        '<button class="icon-btn" title="Delete" data-role="delete">✕</button>';

      const typeSelect = row.querySelector('[data-role="type"]');
      const valInput = row.querySelector('[data-role="value"]');
      const browseBtn = row.querySelector('[data-role="browse"]');

      typeSelect.addEventListener('change', () => {
        const fileSelected = typeSelect.value === 'file';
        browseBtn.style.display = fileSelected ? 'inline-block' : 'none';
        valInput.placeholder = fileSelected ? 'Select or enter file path...' : 'Value';
      });

      browseBtn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'selectFile',
          rowId: rowId
        });
      });

      row.querySelector('[data-role="delete"]').addEventListener('click', () => row.remove());
      formdataRows.appendChild(row);
      return row;
    }

    const urlencodedRows = document.getElementById('urlencoded-rows');
    const formdataRows = document.getElementById('formdata-rows');
    document.getElementById('btn-add-urlencoded').addEventListener('click', () => addFormRow(urlencodedRows));
    document.getElementById('btn-add-formdata').addEventListener('click', () => addFormDataRow());

    // Content-Type synchronization
    function syncContentType(type) {
      const typeMap = {
        'json': 'application/json',
        'form-urlencoded': 'application/x-www-form-urlencoded',
        'form-data': 'multipart/form-data',
        'text': 'text/plain',
        'xml': 'application/xml'
      };
      const newCt = typeMap[type];
      const managedTypes = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/xml'];
      const rows = Array.from(headerRowsContainer.querySelectorAll('.param-row'));
      let found = false;
      for (const row of rows) {
        const keyInput = row.querySelector('[data-role="key"]');
        const valInput = row.querySelector('[data-role="value"]');
        const enabledInput = row.querySelector('[data-role="enabled"]');
        if (keyInput && keyInput.value.trim().toLowerCase() === 'content-type') {
          found = true;
          if (newCt) {
            valInput.value = newCt;
            enabledInput.checked = true;
          } else if (type === 'none') {
            if (managedTypes.includes(valInput.value.trim())) {
              enabledInput.checked = false;
            }
          }
          break;
        }
      }
      if (!found && newCt) {
        addHeaderRow('Content-Type', newCt, true);
      }
    }

    // Body subviews
    const bodyViews = {
      'none': document.getElementById('body-view-none'),
      'json': document.getElementById('body-view-json'),
      'form-urlencoded': document.getElementById('body-view-form-urlencoded'),
      'form-data': document.getElementById('body-view-form-data'),
      'text': document.getElementById('body-view-text'),
      'xml': document.getElementById('body-view-xml'),
      'raw': document.getElementById('body-view-raw'),
    };

    function selectBodyType(type, updateHeaders = true) {
      document.querySelectorAll('.radio-pill').forEach(pill => {
        const radio = pill.querySelector('input[type="radio"]');
        const isMatch = radio && radio.value === type;
        if (radio) radio.checked = isMatch;
        pill.classList.toggle('selected', isMatch);
      });
      Object.entries(bodyViews).forEach(([key, el]) => {
        if (el) el.style.display = key === type ? (key === 'none' ? 'flex' : 'block') : 'none';
      });
      if (updateHeaders) {
        syncContentType(type);
      }
    }

    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        selectBodyType(radio.value, true);
      });
    });

    // Toggle Bulk / Key-Value mode for x-www-form-urlencoded
    const urlencodedTable = document.getElementById('urlencoded-table-view');
    const urlencodedBulk = document.getElementById('urlencoded-bulk-view');
    const btnToggleUrlencoded = document.getElementById('btn-toggle-urlencoded-mode');
    const urlencodedRaw = document.getElementById('req-body-urlencoded-bulk');

    btnToggleUrlencoded.addEventListener('click', () => {
      const isTable = urlencodedTable.style.display !== 'none';
      if (isTable) {
        const rows = Array.from(urlencodedRows.querySelectorAll('.param-row'));
        const lines = rows.map(r => {
          const k = r.querySelector('[data-role="key"]').value.trim();
          const v = r.querySelector('[data-role="value"]').value;
          const enabled = r.querySelector('[data-role="enabled"]').checked;
          if (!enabled) return '';
          return k ? (k + '=' + v) : '';
        }).filter(Boolean);
        urlencodedRaw.value = lines.join('\\n');
        urlencodedTable.style.display = 'none';
        urlencodedBulk.style.display = 'block';
        btnToggleUrlencoded.textContent = 'Key-Value Edit';
      } else {
        urlencodedRows.innerHTML = '';
        const lines = urlencodedRaw.value.split('\\n');
        let count = 0;
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const idx = trimmed.indexOf('=') >= 0 ? trimmed.indexOf('=') : trimmed.indexOf(':');
          if (idx >= 0) {
            addFormRow(urlencodedRows, trimmed.substring(0, idx).trim(), trimmed.substring(idx + 1).trim(), true);
            count++;
          } else {
            addFormRow(urlencodedRows, trimmed, '', true);
            count++;
          }
        });
        if (count === 0) addFormRow(urlencodedRows);
        urlencodedBulk.style.display = 'none';
        urlencodedTable.style.display = 'block';
        btnToggleUrlencoded.textContent = 'Bulk Edit';
      }
    });

    // JSON beautify helper
    document.getElementById('btn-fmt-json').addEventListener('click', () => {
      const textarea = document.getElementById('req-body-json');
      try {
        const parsed = JSON.parse(textarea.value);
        textarea.value = JSON.stringify(parsed, null, 2);
      } catch (err) {
        // Not valid JSON
      }
    });

    // XML beautify helper
    document.getElementById('btn-fmt-xml').addEventListener('click', () => {
      const textarea = document.getElementById('req-body-xml');
      try {
        let formatted = '';
        let indent = '';
        const tab = '  ';
        textarea.value.split(/>\\s*</).forEach(node => {
          if (node.match(/^\\/\\w/)) indent = indent.substring(tab.length);
          formatted += indent + '<' + node + '>\\r\\n';
          if (node.match(/^<?\\w[^>]*[^\\/]$/)) indent += tab;
        });
        const res = formatted.trim();
        if (res.startsWith('<') && res.endsWith('>')) {
          textarea.value = res;
        }
      } catch (err) {}
    });

    // Initialize Body Content & State
    function initBodyContent() {
      let type = initialBodyType;
      if (!type) {
        const ctEntry = Object.entries(initialHeaders).find(([k]) => k.toLowerCase() === 'content-type');
        const ctVal = ctEntry ? ctEntry[1].toLowerCase() : '';
        if (ctVal.includes('application/x-www-form-urlencoded')) type = 'form-urlencoded';
        else if (ctVal.includes('multipart/form-data')) type = 'form-data';
        else if (ctVal.includes('xml')) type = 'xml';
        else if (ctVal.includes('text/plain')) type = 'text';
        else if (ctVal.includes('application/json')) type = 'json';
        else if (initialBody) {
          const trimmed = initialBody.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            type = 'json';
          } else if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
            type = 'xml';
          } else if (trimmed.includes('=') && !trimmed.includes('\\n') && !trimmed.includes('{')) {
            type = 'form-urlencoded';
          } else {
            type = 'text';
          }
        } else {
          const method = "${(context.method || 'GET').toUpperCase()}";
          type = ['POST', 'PUT', 'PATCH'].includes(method) ? 'json' : 'none';
        }
      }

      if (initialBody) {
        document.getElementById('req-body-json').value = initialBody;
        document.getElementById('req-body-text').value = initialBody;
        document.getElementById('req-body-xml').value = initialBody;
        document.getElementById('req-body-raw').value = initialBody;
      }

      // Populate form-urlencoded
      if (initialBodyFormData && initialBodyFormData.length > 0 && type === 'form-urlencoded') {
        initialBodyFormData.forEach(item => addFormRow(urlencodedRows, item.key, item.value, item.enabled !== false));
      } else if (initialBody && type === 'form-urlencoded') {
        try {
          const params = new URLSearchParams(initialBody);
          let count = 0;
          params.forEach((v, k) => {
            addFormRow(urlencodedRows, k, v, true);
            count++;
          });
          if (count === 0) addFormRow(urlencodedRows);
        } catch (e) {
          addFormRow(urlencodedRows);
        }
      } else {
        addFormRow(urlencodedRows);
      }

      // Populate form-data
      if (initialBodyFormData && initialBodyFormData.length > 0 && type === 'form-data') {
        initialBodyFormData.forEach(item => addFormDataRow(item.key, item.value, item.enabled !== false, item.type || 'text'));
      } else {
        addFormDataRow();
      }

      selectBodyType(type, false);
    }

    initBodyContent();

    // Helper to get body payload
    function getBodyPayload() {
      const selected = document.querySelector('input[name="bodyType"]:checked');
      const bodyType = selected ? selected.value : 'none';
      let body = '';
      let bodyFormData = undefined;

      if (bodyType === 'none') {
        body = '';
      } else if (bodyType === 'json') {
        body = document.getElementById('req-body-json').value;
      } else if (bodyType === 'text') {
        body = document.getElementById('req-body-text').value;
      } else if (bodyType === 'xml') {
        body = document.getElementById('req-body-xml').value;
      } else if (bodyType === 'raw') {
        body = document.getElementById('req-body-raw').value;
      } else if (bodyType === 'form-urlencoded') {
        const isBulk = urlencodedBulk.style.display !== 'none';
        if (isBulk) {
          body = urlencodedRaw.value;
          bodyFormData = urlencodedRaw.value.split('\\n').filter(Boolean).map(line => {
            const idx = line.indexOf('=') >= 0 ? line.indexOf('=') : line.indexOf(':');
            return idx >= 0
              ? { key: line.substring(0, idx).trim(), value: line.substring(idx + 1).trim(), enabled: true }
              : { key: line.trim(), value: '', enabled: true };
          });
        } else {
          const rows = Array.from(urlencodedRows.querySelectorAll('.param-row'));
          bodyFormData = rows.map(r => ({
            key: r.querySelector('[data-role="key"]').value.trim(),
            value: r.querySelector('[data-role="value"]').value,
            enabled: r.querySelector('[data-role="enabled"]').checked
          }));
          const params = new URLSearchParams();
          bodyFormData.filter(r => r.enabled && r.key).forEach(r => params.append(r.key, r.value));
          body = params.toString();
        }
      } else if (bodyType === 'form-data') {
        const rows = Array.from(formdataRows.querySelectorAll('.param-row'));
        bodyFormData = rows.map(r => {
          const typeSelect = r.querySelector('[data-role="type"]');
          const rowType = typeSelect ? typeSelect.value : 'text';
          return {
            key: r.querySelector('[data-role="key"]').value.trim(),
            value: r.querySelector('[data-role="value"]').value,
            enabled: r.querySelector('[data-role="enabled"]').checked,
            type: rowType
          };
        });
        body = bodyFormData.filter(r => r.enabled && r.key).map(r => r.type === 'file' ? (r.key + '=@' + r.value) : (r.key + '=' + r.value)).join('&');
      }

      return { bodyType, body, bodyFormData };
    }

    // Helper to get variables array
    function getVariables() {
      return Array.from(varRowsContainer.querySelectorAll('.param-row')).map(row => {
        const name = row.querySelector('[data-role="name"]').value.trim();
        const value = row.querySelector('[data-role="value"]').value;
        const enabled = row.querySelector('[data-role="enabled"]').checked;
        const hidden = row.querySelector('[data-role="hidden"]').checked;
        return name ? { name, value, enabled, hidden } : null;
      }).filter(Boolean);
    }

    // Helper to get headers map
    function getHeaders() {
      const headers = {};
      varRowsContainer.querySelectorAll('.param-row');
      headerRowsContainer.querySelectorAll('.param-row').forEach(row => {
        const enabled = row.querySelector('[data-role="enabled"]').checked;
        const key = row.querySelector('[data-role="key"]').value.trim();
        const value = row.querySelector('[data-role="value"]').value;
        if (enabled && key) {
          headers[key] = value;
        }
      });
      return headers;
    }

    // Helper to get auth settings
    function getAuthSettings() {
      const inheritVal = document.getElementById('auth-inheritance').value;
      return {
        inheritFromProfile: inheritVal === 'both' || inheritVal === 'profile',
        inheritFromEnvironment: inheritVal === 'both' || inheritVal === 'environment',
        auth: extractAuthValues()
      };
    }

    // Helper to assemble payload
    function getPayload() {
      const profileSelect = document.getElementById('select-profile');
      const selectedOption = profileSelect ? profileSelect.options[profileSelect.selectedIndex] : null;
      const profileId = selectedOption ? selectedOption.getAttribute('data-id') : undefined;
      const bodyInfo = getBodyPayload();

      return {
        requestId: currentRequestId,
        method: document.getElementById('method-select').value,
        url: document.getElementById('url-input').value.trim(),
        profile: profileSelect ? profileSelect.value : '',
        profileId: profileId,
        environment: document.getElementById('select-env').value,
        collection: "${collectionName}",
        folder: "${displayFolder === 'Root' ? '' : displayFolder}",
        headers: getHeaders(),
        body: bodyInfo.body,
        bodyType: bodyInfo.bodyType,
        bodyFormData: bodyInfo.bodyFormData,
        variables: getVariables(),
        auth: getAuthSettings(),
        notes: document.getElementById('req-notes').value
      };
    }

    // Send action
    document.getElementById('btn-send').addEventListener('click', () => {
      const statusPill = document.getElementById('resp-status');
      statusPill.className = 'pill';
      statusPill.textContent = 'Sending...';

      document.getElementById('resp-body-text').textContent = 'Dispatching request...';
      vscode.postMessage({
        type: 'sendRequest',
        payload: getPayload()
      });
    });

    // Save action
    document.getElementById('btn-save').addEventListener('click', () => {
      vscode.postMessage({
        type: 'saveRequest',
        payload: getPayload()
      });
    });

    // Secondary actions in dropdown
    document.querySelectorAll('[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        if (action === 'preview') {
          vscode.postMessage({ type: 'previewRequest', payload: getPayload() });
        } else if (action === 'curl') {
          vscode.postMessage({ type: 'copyCurl', payload: getPayload() });
        }
      });
    });

    // Copy Response
    document.getElementById('btn-copy-resp').addEventListener('click', () => {
      const headersTab = document.getElementById('tab-resp-headers');
      let text = '';
      if (headersTab && headersTab.classList.contains('active')) {
        const rows = Array.from(headersTab.querySelectorAll('tbody tr'));
        text = rows.map(r => {
          const k = r.querySelector('.header-key');
          const v = r.querySelector('.header-val');
          return (k && v) ? (k.textContent + ': ' + v.textContent) : r.textContent;
        }).join('\\n');
      } else {
        text = document.getElementById('resp-body-text').textContent;
      }
      navigator.clipboard.writeText(text);
      const copyBtn = document.getElementById('btn-copy-resp');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });

    // Message listener from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'requestResult') {
        const meta = msg.meta;
        const statusPill = document.getElementById('resp-status');
        const timeTag = document.getElementById('resp-time');
        const sizeTag = document.getElementById('resp-size');

        statusPill.textContent = meta.status === 0 ? 'Error' : \`\${meta.status} \${meta.statusText}\`;
        statusPill.className = 'pill';
        if (meta.status >= 200 && meta.status < 300) statusPill.classList.add('status-2xx');
        else if (meta.status >= 300 && meta.status < 400) statusPill.classList.add('status-3xx');
        else if (meta.status >= 400 && meta.status < 500) statusPill.classList.add('status-4xx');
        else if (meta.status >= 500) statusPill.classList.add('status-5xx');
        else statusPill.classList.add('status-err');

        timeTag.textContent = \`\${meta.elapsedMs} ms\`;
        if (meta.sizeBytes) {
          const sizeKb = (meta.sizeBytes / 1024).toFixed(1);
          sizeTag.textContent = \`\${sizeKb} KB\`;
        }

        // Format body
        const bodyPre = document.getElementById('resp-body-text');
        try {
          const json = JSON.parse(meta.body);
          bodyPre.textContent = JSON.stringify(json, null, 2);
        } catch {
          bodyPre.textContent = meta.body || '(Empty response)';
        }

        // Response headers
        const headerEntries = Object.entries(meta.headers || {});
        document.getElementById('resp-header-count').textContent = \`(\${headerEntries.length})\`;
        const headersTbody = document.getElementById('resp-headers-body');
        headersTbody.innerHTML = '';
        if (headerEntries.length > 0) {
          headerEntries.forEach(([k, v]) => {
            const tr = document.createElement('tr');
            const tdK = document.createElement('td');
            tdK.className = 'header-key';
            tdK.textContent = k;
            const tdV = document.createElement('td');
            tdV.className = 'header-val';
            tdV.textContent = v;
            tr.appendChild(tdK);
            tr.appendChild(tdV);
            headersTbody.appendChild(tr);
          });
        } else {
          headersTbody.innerHTML = '<tr><td colspan="2" style="color: var(--muted);">No headers received.</td></tr>';
        }
      }

      if (msg.type === 'saved') {
        currentRequestId = msg.id;
        const statusPill = document.getElementById('resp-status');
        statusPill.textContent = 'Saved';
        statusPill.className = 'pill status-2xx';
        setTimeout(() => {
          if (statusPill.textContent === 'Saved') statusPill.textContent = 'Waiting';
        }, 2000);
      }

      if (msg.type === 'fileSelected' && msg.rowId) {
        const row = document.querySelector('.formdata-row[data-row-id="' + msg.rowId + '"]');
        if (row) {
          const valInput = row.querySelector('[data-role="value"]');
          if (valInput) {
            valInput.value = msg.filePath || '';
          }
        }
      }

      if (msg.type === 'updateInherited') {
        currentInheritedVars = msg.inheritedVars || [];
        currentInheritedHeaders = msg.inheritedHeaders || [];
        renderInheritedVars();
        renderInheritedHeaders();
      }

      if (msg.type === 'preview') {
        const bodyPre = document.getElementById('resp-body-text');
        bodyPre.textContent = JSON.stringify(msg.preview, null, 2);
        const statusPill = document.getElementById('resp-status');
        statusPill.textContent = 'Preview';
        statusPill.className = 'pill status-3xx';
      }
    });
  </script>
</body>
</html>`;
}

