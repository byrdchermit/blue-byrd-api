import { Collection, CollectionFolder, EnvironmentConfig, Profile } from '../../types';
import { renderAuthCss, renderAuthFieldsHtml, getSharedAuthClientScript } from './sharedAuthHtml';

export function getSettingsPanelHtml(
  target: 'profile' | 'environment' | 'collection' | 'folder',
  item: Profile | EnvironmentConfig | Collection | CollectionFolder | undefined,
  displayName: string,
  collectionName?: string,
  allEnvironments?: Array<{ id: string; name: string }>,
  allProfiles?: Array<{ id: string; name: string }>
): string {
  const isProfile = target === 'profile';
  const isEnv = target === 'environment';
  const isCol = target === 'collection';
  const isFolder = target === 'folder';

  const profile = isProfile ? (item as Profile) : undefined;
  const env = isEnv ? (item as EnvironmentConfig) : undefined;
  const col = isCol ? (item as Collection) : undefined;
  const folder = isFolder ? (item as CollectionFolder) : undefined;

  const getAuth = (): any => {
    if (isProfile) return profile?.auth;
    if (isEnv) return env?.auth;
    if (isCol) return (col?.auth as any)?.auth || (col?.auth as any);
    if (isFolder) return (folder?.auth as any)?.auth || (folder?.auth as any);
    return undefined;
  };
  const auth = getAuth();

  const isInherited = isCol
    ? (col?.auth?.inheritFromProfile !== false && col?.auth?.inheritFromEnvironment !== false)
    : isFolder
    ? (folder?.auth?.inheritFromProfile !== false && folder?.auth?.inheritFromCollection !== false)
    : false;

  const normalizedVariables: Record<string, string> = {};
  if (Array.isArray(item?.variables)) {
    item.variables.forEach((v: any) => {
      if (v && typeof v === 'object') {
        const key = v.name || v.key;
        if (key) normalizedVariables[key] = String(v.value ?? '');
      }
    });
  } else if (item?.variables && typeof item.variables === 'object') {
    Object.entries(item.variables).forEach(([k, v]) => {
      normalizedVariables[k] = v != null ? String(v) : '';
    });
  }

  const normalizedHeaders: Record<string, string> = {};
  if (item?.headers && typeof item.headers === 'object') {
    Object.entries(item.headers).forEach(([k, v]) => {
      if (k) normalizedHeaders[k] = v != null ? String(v) : '';
    });
  }

  const notes = item?.notes || '';

  const escapeHtml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const variablesJson = JSON.stringify(normalizedVariables).replace(/</g, '\\u003c');
  const headersJson = JSON.stringify(normalizedHeaders).replace(/</g, '\\u003c');
  const targetLabel = target.toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(displayName)} Settings</title>
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
      --badge-bg: var(--vscode-badge-background, rgba(255,255,255,0.08));
      --badge-fg: var(--vscode-badge-foreground, var(--text));
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
    }
    body {
      padding: 16px 20px;
    }

    .container {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Top Context & Action Bar */
    .context-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
    }
    .context-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 260px;
    }
    .scope-pill {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .scope-profile { background: rgba(79, 193, 255, 0.15); color: #4fc1ff; }
    .scope-environment { background: rgba(206, 145, 120, 0.15); color: #ce9178; }
    .scope-collection { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; }
    .scope-folder { background: rgba(220, 220, 170, 0.15); color: #dcdcaa; }

    .name-input {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 14px;
      font-weight: 600;
      outline: none;
      flex: 1;
      max-width: 320px;
    }
    .name-input:focus { border-color: var(--primary); }

    .context-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      outline: none;
      transition: background 0.15s ease;
    }
    .btn-primary {
      background: var(--primary);
      color: var(--primary-fg);
    }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary {
      background: var(--surface);
      border-color: var(--border);
      color: var(--text);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.08); }

    /* Environment Configuration Banner */
    .env-url-banner {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .env-url-banner label {
      font-weight: 600;
      font-size: 12px;
      color: var(--text);
    }
    .env-url-input {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 13px;
      font-family: var(--vscode-editor-font-family, monospace);
      outline: none;
      width: 100%;
    }
    .env-url-input:focus { border-color: var(--primary); }
    .help-hint {
      font-size: 11px;
      color: var(--muted);
    }

    /* Tabbed Workspace */
    .panel-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      min-height: 400px;
    }
    .tab-header {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.15);
      padding: 0 8px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--text);
      border-bottom-color: var(--primary);
      background: rgba(255,255,255,0.03);
    }
    .tab-badge {
      font-size: 10px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      padding: 1px 6px;
      border-radius: 10px;
    }

    .tab-content {
      display: none;
      padding: 16px;
      flex: 1;
      overflow-y: auto;
    }
    .tab-content.active {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Table Rows */
    .table-header-row {
      display: grid;
      grid-template-columns: 32px 1.2fr 1.8fr 70px 36px;
      gap: 8px;
      padding: 0 4px 6px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    .param-row {
      display: grid;
      grid-template-columns: 32px 1.2fr 1.8fr 70px 36px;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
    }
    .param-row.header-row {
      grid-template-columns: 32px 1.5fr 2.5fr 36px;
    }
    .param-input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 10px;
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
      font-size: 13px;
      line-height: 1;
    }
    .icon-btn:hover {
      color: var(--danger);
      background: rgba(241, 76, 76, 0.15);
    }

    ${renderAuthCss()}

    /* Notes Textarea */
    .notes-box {
      width: 100%;
      min-height: 240px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 10px 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
    }
    .notes-box:focus { border-color: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Context Bar -->
    <header class="context-bar">
      <div class="context-left">
        <span class="scope-pill scope-${target}">${targetLabel}</span>
        ${collectionName ? `<span style="color: var(--muted); font-size: 12px;">${escapeHtml(collectionName)} ›</span>` : ''}
        <input
          id="item-name"
          class="name-input"
          type="text"
          value="${escapeHtml(displayName)}"
          placeholder="Name"
          title="Rename ${targetLabel}"
        />
      </div>
      <div class="context-actions">
        <button id="btn-cancel" class="btn btn-secondary">Cancel</button>
        <button id="btn-save" class="btn btn-primary">Save Changes</button>
      </div>
    </header>

    ${isEnv ? `
    <!-- Environment Base URL, Parent & Profile Scope Banner -->
    <div class="env-url-banner">
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 2; min-width: 240px;">
          <label for="base-url">Base URL</label>
          <input
            id="base-url"
            class="env-url-input"
            type="text"
            value="${escapeHtml(env?.baseUrl || '')}"
            placeholder="https://api.example.com"
          />
          <span class="help-hint">Available as {{baseUrl}} across requests</span>
        </div>
        <div style="flex: 1; min-width: 180px;">
          <label for="env-parent">Parent Environment</label>
          <select id="env-parent" class="env-url-input" style="height: 32px; cursor: pointer;">
            <option value="">None (Root Environment)</option>
            ${(allEnvironments || [])
              .filter(e => e.id !== item?.id && e.name !== displayName)
              .map(e => `<option value="${escapeHtml(e.id)}" ${e.id === item?.inheritsFrom || e.name === item?.inheritsFrom ? 'selected' : ''}>${escapeHtml(e.name)}</option>`)
              .join('')}
          </select>
          <span class="help-hint">Inherits variables and headers from parent</span>
        </div>
        <div style="flex: 1; min-width: 180px;">
          <label for="env-profile">Profile Scope</label>
          <select id="env-profile" class="env-url-input" style="height: 32px; cursor: pointer;">
            <option value="">Global / Shared (All Profiles)</option>
            ${(allProfiles || [])
              .map(p => `<option value="${escapeHtml(p.id)}" ${p.id === (item as any)?.profileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
              .join('')}
          </select>
          <span class="help-hint">Scope to profile or share globally</span>
        </div>
      </div>
    </div>
    ` : ''}

    ${isCol ? `
    <!-- Collection Profile Scope Banner -->
    <div class="env-url-banner">
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          <label for="col-profile">Profile Scope</label>
          <select id="col-profile" class="env-url-input" style="height: 32px; cursor: pointer;">
            <option value="">Global / Shared (All Profiles)</option>
            ${(allProfiles || [])
              .map(p => `<option value="${escapeHtml(p.id)}" ${p.id === (item as any)?.profileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
              .join('')}
          </select>
          <span class="help-hint">Scope this collection to a specific profile or share across all profiles</span>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Tabbed Settings Workspace -->
    <main class="panel-box">
      <nav class="tab-header">
        <button class="tab-btn active" data-tab="tab-vars">
          Variables <span id="var-count-badge" class="tab-badge">0</span>
        </button>
        <button class="tab-btn" data-tab="tab-headers">
          Headers <span id="header-count-badge" class="tab-badge">0</span>
        </button>
        <button class="tab-btn" data-tab="tab-auth">
          Authentication
        </button>
        <button class="tab-btn" data-tab="tab-notes">
          Documentation & Notes
        </button>
      </nav>

      <!-- Tab 1: Interactive Variables Table -->
      <section id="tab-vars" class="tab-content active">
        <div class="table-header-row">
          <span></span>
          <span>Variable Key</span>
          <span>Initial Value</span>
          <span>Mask</span>
          <span></span>
        </div>
        <div id="var-rows"></div>
        <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between;">
          <button id="btn-add-var" class="btn btn-secondary" style="font-size: 11px; padding: 4px 12px;">
            + Add Variable
          </button>
          <span class="help-hint">
            Reference in requests via <code style="color: #9cdcfe;">{{variableName}}</code>.
          </span>
        </div>
      </section>

      <!-- Tab 2: Interactive Headers Table -->
      <section id="tab-headers" class="tab-content">
        <div class="table-header-row" style="grid-template-columns: 32px 1.5fr 2.5fr 36px;">
          <span></span>
          <span>Header Name</span>
          <span>Header Value</span>
          <span></span>
        </div>
        <div id="header-rows"></div>
        <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between;">
          <button id="btn-add-header" class="btn btn-secondary" style="font-size: 11px; padding: 4px 12px;">
            + Add Header
          </button>
          <span class="help-hint">
            Inherited automatically by all requests under this ${target}.
          </span>
        </div>
      </section>

      <!-- Tab 3: Authentication -->
      <section id="tab-auth" class="tab-content">
        <div class="auth-grid">
          ${isCol || isFolder ? `
          <div class="form-group" style="padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 4px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">
              <input type="checkbox" id="auth-inherit" ${isInherited ? 'checked' : ''} style="cursor: pointer;" />
              <span>Inherit authentication from parent</span>
            </label>
            <span class="help-hint" style="margin-left: 22px; margin-top: 4px;">
              When enabled, requests in this ${target} automatically inherit credentials from the parent Collection, Environment, or Profile.
            </span>
          </div>
          ` : ''}

          ${renderAuthFieldsHtml(auth, target)}
        </div>
      </section>

      <!-- Tab 4: Notes -->
      <section id="tab-notes" class="tab-content">
        <textarea
          id="item-notes"
          class="notes-box"
          placeholder="Add notes, usage guidelines, or documentation here..."
        >${escapeHtml(notes)}</textarea>
      </section>
    </main>
  </div>

  <script>
    (function() {
      try {
        const vscode = acquireVsCodeApi();
        const initialVars = ${variablesJson};
        const initialHeaders = ${headersJson};

        // --- Tabs Switching ---
        document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const content = document.getElementById(targetTab);
            if (content) content.classList.add('active');
          });
        });

        // --- Variables Table Management ---
        const varRowsContainer = document.getElementById('var-rows');
        const varCountBadge = document.getElementById('var-count-badge');

        function updateVarCount() {
          const count = varRowsContainer.querySelectorAll('.param-row').length;
          varCountBadge.textContent = count;
        }

        function addVarRow(key = '', val = '', enabled = true, isMasked = false) {
          const row = document.createElement('div');
          row.className = 'param-row';

          const enabledCheckbox = document.createElement('input');
          enabledCheckbox.type = 'checkbox';
          enabledCheckbox.checked = enabled;
          enabledCheckbox.style.cursor = 'pointer';
          enabledCheckbox.dataset.role = 'enabled';

          const keyInput = document.createElement('input');
          keyInput.type = 'text';
          keyInput.className = 'param-input';
          keyInput.placeholder = 'Key';
          keyInput.value = key;
          keyInput.dataset.role = 'key';

          const valInput = document.createElement('input');
          valInput.type = isMasked ? 'password' : 'text';
          valInput.className = 'param-input';
          valInput.placeholder = 'Value';
          valInput.value = val;
          valInput.dataset.role = 'value';

          const maskLabel = document.createElement('label');
          maskLabel.style.display = 'flex';
          maskLabel.style.alignItems = 'center';
          maskLabel.style.gap = '4px';
          maskLabel.style.fontSize = '11px';
          maskLabel.style.color = 'var(--muted)';
          maskLabel.style.cursor = 'pointer';

          const maskCheckbox = document.createElement('input');
          maskCheckbox.type = 'checkbox';
          maskCheckbox.checked = isMasked;
          maskCheckbox.dataset.role = 'mask';
          maskLabel.appendChild(maskCheckbox);
          maskLabel.appendChild(document.createTextNode('Mask'));

          maskCheckbox.addEventListener('change', () => {
            valInput.type = maskCheckbox.checked ? 'password' : 'text';
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'icon-btn';
          delBtn.title = 'Delete';
          delBtn.dataset.role = 'delete';
          delBtn.textContent = '✕';
          delBtn.addEventListener('click', () => {
            row.remove();
            updateVarCount();
          });

          row.appendChild(enabledCheckbox);
          row.appendChild(keyInput);
          row.appendChild(valInput);
          row.appendChild(maskLabel);
          row.appendChild(delBtn);

          varRowsContainer.appendChild(row);
          updateVarCount();
        }

        document.getElementById('btn-add-var').addEventListener('click', () => addVarRow());

        // Populate initial variables from object
        const varEntries = Object.entries(initialVars);
        if (varEntries.length > 0) {
          varEntries.forEach(([k, v]) => {
            addVarRow(k, v != null ? String(v) : '', true, false);
          });
        } else {
          addVarRow('', '', true, false);
        }

        // --- Headers Table Management ---
        const headerRowsContainer = document.getElementById('header-rows');
        const headerCountBadge = document.getElementById('header-count-badge');

        function updateHeaderCount() {
          const count = headerRowsContainer.querySelectorAll('.param-row').length;
          headerCountBadge.textContent = count;
        }

        function addHeaderRow(key = '', val = '', enabled = true) {
          const row = document.createElement('div');
          row.className = 'param-row header-row';

          const enabledCheckbox = document.createElement('input');
          enabledCheckbox.type = 'checkbox';
          enabledCheckbox.checked = enabled;
          enabledCheckbox.style.cursor = 'pointer';
          enabledCheckbox.dataset.role = 'enabled';

          const keyInput = document.createElement('input');
          keyInput.type = 'text';
          keyInput.className = 'param-input';
          keyInput.placeholder = 'Header name (e.g. Accept, X-Custom)';
          keyInput.value = key;
          keyInput.dataset.role = 'key';

          const valInput = document.createElement('input');
          valInput.type = 'text';
          valInput.className = 'param-input';
          valInput.placeholder = 'Header value';
          valInput.value = val;
          valInput.dataset.role = 'value';

          const delBtn = document.createElement('button');
          delBtn.className = 'icon-btn';
          delBtn.title = 'Delete';
          delBtn.dataset.role = 'delete';
          delBtn.textContent = '✕';
          delBtn.addEventListener('click', () => {
            row.remove();
            updateHeaderCount();
          });

          row.appendChild(enabledCheckbox);
          row.appendChild(keyInput);
          row.appendChild(valInput);
          row.appendChild(delBtn);

          headerRowsContainer.appendChild(row);
          updateHeaderCount();
        }

        document.getElementById('btn-add-header').addEventListener('click', () => addHeaderRow());

        // Populate initial headers
        const headerEntries = Object.entries(initialHeaders);
        if (headerEntries.length > 0) {
          headerEntries.forEach(([k, v]) => {
            addHeaderRow(k, v != null ? String(v) : '', true);
          });
        }

        // --- Dynamic Auth Fields & Visibility ---
        ${getSharedAuthClientScript()}

        // --- Save & Cancel Actions ---
        document.getElementById('btn-cancel').addEventListener('click', () => {
          vscode.postMessage({ type: 'cancel' });
        });

        document.getElementById('btn-save').addEventListener('click', () => {
          const name = (document.getElementById('item-name').value || '').trim();
          const baseUrlInput = document.getElementById('base-url');
          const baseUrl = baseUrlInput ? baseUrlInput.value.trim() : undefined;
          const envParentSelect = document.getElementById('env-parent');
          const inheritsFrom = envParentSelect ? envParentSelect.value.trim() || undefined : undefined;
          const profileScopeSelect = document.getElementById('env-profile') || document.getElementById('col-profile');
          const profileId = profileScopeSelect ? profileScopeSelect.value.trim() || undefined : undefined;
          const authValues = extractAuthValues();
          const inheritCheck = document.getElementById('auth-inherit');
          const inheritAuth = inheritCheck ? inheritCheck.checked : true;
          const notes = (document.getElementById('item-notes').value || '').trim();

          // Gather non-empty enabled variables into a dictionary
          const variables = {};
          varRowsContainer.querySelectorAll('.param-row').forEach(row => {
            const enabled = row.querySelector('[data-role="enabled"]').checked;
            const key = (row.querySelector('[data-role="key"]').value || '').trim();
            const value = row.querySelector('[data-role="value"]').value;
            if (enabled && key) {
              variables[key] = value;
            }
          });

          // Gather non-empty enabled headers into a dictionary
          const headers = {};
          headerRowsContainer.querySelectorAll('.param-row').forEach(row => {
            const enabled = row.querySelector('[data-role="enabled"]').checked;
            const key = (row.querySelector('[data-role="key"]').value || '').trim();
            const value = row.querySelector('[data-role="value"]').value;
            if (enabled && key) {
              headers[key] = value;
            }
          });

          vscode.postMessage({
            type: 'saveSettings',
            payload: {
              name,
              baseUrl,
              inheritsFrom,
              profileId,
              authType: authValues.type,
              token: authValues.token,
              headerName: authValues.headerName,
              keyName: authValues.keyName,
              headerPrefix: authValues.headerPrefix,
              addTo: authValues.addTo,
              username: authValues.username,
              password: authValues.password,
              clientId: authValues.clientId,
              clientSecret: authValues.clientSecret,
              authorizationUrl: authValues.authorizationUrl,
              tokenUrl: authValues.tokenUrl,
              scopes: authValues.scopes,
              grantType: authValues.grantType,
              inheritAuth,
              variables,
              headers,
              notes
            }
          });
        });
      } catch (err) {
        console.error('[bluebyrd Settings] Webview runtime error:', err);
      }
    })();
  </script>
</body>
</html>`;
}
