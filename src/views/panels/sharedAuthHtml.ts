import { ProfileAuth } from '../../types';

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAuthCss(): string {
  return `
    /* Shared Auth Styles */
    .auth-grid {
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 580px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .form-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
    }
    .form-control {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 13px;
      outline: none;
    }
    .form-control:focus { border-color: var(--primary); }

    .password-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .password-wrapper .form-control {
      width: 100%;
      padding-right: 36px;
    }
    .btn-toggle-mask {
      position: absolute;
      right: 6px;
      padding: 4px 6px;
      font-size: 13px;
      color: var(--muted);
      cursor: pointer;
      background: transparent;
      border: none;
      border-radius: 4px;
      line-height: 1;
    }
    .btn-toggle-mask:hover {
      color: var(--text);
      background: rgba(255,255,255,0.08);
    }

    .auth-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .help-hint {
      font-size: 11px;
      color: var(--muted);
      line-height: 1.4;
    }
  `;
}

export function renderAuthFieldsHtml(auth?: ProfileAuth, targetDescription: string = 'this item'): string {
  const authType = auth?.type || 'none';
  const authToken = auth?.token || '';
  const authHeader = auth?.headerName || 'Authorization';
  const authKeyName = auth?.keyName || 'X-API-Key';
  const authPrefix = auth?.headerPrefix || (authType === 'bearer' || authType === 'oauth2' ? 'Bearer' : '');
  const authAddTo = auth?.addTo || 'header';
  const authClientId = auth?.clientId || '';
  const authClientSecret = auth?.clientSecret || '';
  const authAuthUrl = auth?.authorizationUrl || '';
  const authTokenUrl = auth?.tokenUrl || '';
  const authScopes = Array.isArray(auth?.scopes) ? auth.scopes.join(' ') : (auth?.scopes || '');
  const authGrantType = auth?.grantType || 'authorization_code';
  const authUsername = auth?.username || '';
  const authPassword = auth?.password || '';

  return `
    <div class="auth-grid">
      <div class="form-group">
        <label class="form-label" for="auth-type">Authentication Type</label>
        <select id="auth-type" class="form-control">
          <option value="none" ${authType === 'none' ? 'selected' : ''}>None (No Auth)</option>
          <option value="bearer" ${authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
          <option value="apiKey" ${authType === 'apiKey' ? 'selected' : ''}>API Key</option>
          <option value="oauth2" ${authType === 'oauth2' ? 'selected' : ''}>OAuth 2.0</option>
          <option value="basic" ${authType === 'basic' ? 'selected' : ''}>Basic Auth</option>
        </select>
      </div>

      <!-- Section: None -->
      <div id="section-none" class="auth-section">
        <span class="help-hint">Does not send any authentication credentials with requests.</span>
      </div>

      <!-- Section: Bearer Token -->
      <div id="section-bearer" class="auth-section">
        <div class="form-group">
          <label class="form-label" for="bearer-token">Token</label>
          <div class="password-wrapper">
            <input
              id="bearer-token"
              class="form-control"
              type="password"
              value="${escapeHtml(authToken)}"
              placeholder="Enter bearer token"
            />
            <button type="button" class="btn-toggle-mask icon-btn" title="Toggle visibility">👁</button>
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="bearer-prefix">Header Prefix</label>
            <input
              id="bearer-prefix"
              class="form-control"
              type="text"
              value="${escapeHtml(authPrefix || 'Bearer')}"
              placeholder="Bearer"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="bearer-header">Header Name</label>
            <input
              id="bearer-header"
              class="form-control"
              type="text"
              value="${escapeHtml(authHeader || 'Authorization')}"
              placeholder="Authorization"
            />
          </div>
        </div>
      </div>

      <!-- Section: API Key -->
      <div id="section-apikey" class="auth-section">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="apikey-key">Key Name</label>
            <input
              id="apikey-key"
              class="form-control"
              type="text"
              value="${escapeHtml(authKeyName || 'X-API-Key')}"
              placeholder="e.g. X-API-Key"
            />
            <span class="help-hint">Header or query parameter name.</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="apikey-add-to">Add To</label>
            <select id="apikey-add-to" class="form-control">
              <option value="header" ${authAddTo === 'header' ? 'selected' : ''}>Header</option>
              <option value="query" ${authAddTo === 'query' ? 'selected' : ''}>Query Params</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="apikey-value">Value</label>
          <div class="password-wrapper">
            <input
              id="apikey-value"
              class="form-control"
              type="password"
              value="${escapeHtml(authToken)}"
              placeholder="Enter API key"
            />
            <button type="button" class="btn-toggle-mask icon-btn" title="Toggle visibility">👁</button>
          </div>
        </div>
      </div>

      <!-- Section: OAuth 2.0 -->
      <div id="section-oauth2" class="auth-section">
        <div class="form-group">
          <label class="form-label" for="oauth-grant-type">Grant Type</label>
          <select id="oauth-grant-type" class="form-control">
            <option value="authorization_code" ${authGrantType === 'authorization_code' ? 'selected' : ''}>Authorization Code</option>
            <option value="client_credentials" ${authGrantType === 'client_credentials' ? 'selected' : ''}>Client Credentials</option>
            <option value="implicit" ${authGrantType === 'implicit' ? 'selected' : ''}>Implicit</option>
            <option value="password" ${authGrantType === 'password' ? 'selected' : ''}>Password Credentials</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="oauth-token">Access Token</label>
          <div class="password-wrapper">
            <input
              id="oauth-token"
              class="form-control"
              type="password"
              value="${escapeHtml(authToken)}"
              placeholder="Enter access token (e.g. ya29...)"
            />
            <button type="button" class="btn-toggle-mask icon-btn" title="Toggle visibility">👁</button>
          </div>
          <span class="help-hint">Current Bearer access token used to authorize requests.</span>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="oauth-prefix">Header Prefix</label>
            <input
              id="oauth-prefix"
              class="form-control"
              type="text"
              value="${escapeHtml(authPrefix || 'Bearer')}"
              placeholder="Bearer"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="oauth-header">Header Name</label>
            <input
              id="oauth-header"
              class="form-control"
              type="text"
              value="${escapeHtml(authHeader || 'Authorization')}"
              placeholder="Authorization"
            />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="oauth-client-id">Client ID</label>
            <input
              id="oauth-client-id"
              class="form-control"
              type="text"
              value="${escapeHtml(authClientId)}"
              placeholder="e.g. client_12345"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="oauth-client-secret">Client Secret</label>
            <div class="password-wrapper">
              <input
                id="oauth-client-secret"
                class="form-control"
                type="password"
                value="${escapeHtml(authClientSecret)}"
                placeholder="Client secret"
              />
              <button type="button" class="btn-toggle-mask icon-btn" title="Toggle visibility">👁</button>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="oauth-auth-url">Authorization URL</label>
          <input
            id="oauth-auth-url"
            class="form-control"
            type="text"
            value="${escapeHtml(authAuthUrl)}"
            placeholder="https://example.com/oauth/authorize"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="oauth-token-url">Access Token URL</label>
          <input
            id="oauth-token-url"
            class="form-control"
            type="text"
            value="${escapeHtml(authTokenUrl)}"
            placeholder="https://example.com/oauth/token"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="oauth-scopes">Scope(s)</label>
          <input
            id="oauth-scopes"
            class="form-control"
            type="text"
            value="${escapeHtml(authScopes)}"
            placeholder="e.g. openid profile email"
          />
          <span class="help-hint">Space or comma separated OAuth 2.0 permission scopes.</span>
        </div>
      </div>

      <!-- Section: Basic Auth -->
      <div id="section-basic" class="auth-section">
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="basic-username">Username</label>
            <input
              id="basic-username"
              class="form-control"
              type="text"
              value="${escapeHtml(authUsername)}"
              placeholder="Username"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="basic-password">Password</label>
            <div class="password-wrapper">
              <input
                id="basic-password"
                class="form-control"
                type="password"
                value="${escapeHtml(authPassword)}"
                placeholder="Password"
              />
              <button type="button" class="btn-toggle-mask icon-btn" title="Toggle visibility">👁</button>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="basic-header">Header Name</label>
          <input
            id="basic-header"
            class="form-control"
            type="text"
            value="${escapeHtml(authHeader || 'Authorization')}"
            placeholder="Authorization"
          />
        </div>
      </div>
    </div>
  `;
}

export function getSharedAuthClientScript(): string {
  return `
    // --- Dynamic Auth Fields Toggle ---
    const authTypeSelect = document.getElementById('auth-type');
    const authSections = {
      none: document.getElementById('section-none'),
      bearer: document.getElementById('section-bearer'),
      apiKey: document.getElementById('section-apikey'),
      oauth2: document.getElementById('section-oauth2'),
      basic: document.getElementById('section-basic'),
    };

    function syncAuthVisibility() {
      if (!authTypeSelect) return;
      const type = authTypeSelect.value;
      Object.entries(authSections).forEach(([key, section]) => {
        if (section) {
          section.style.display = key === type ? 'flex' : 'none';
        }
      });
    }
    if (authTypeSelect) {
      authTypeSelect.addEventListener('change', syncAuthVisibility);
      syncAuthVisibility();
    }

    // --- Password Peek Toggles ---
    document.querySelectorAll('.btn-toggle-mask').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.password-wrapper');
        const input = wrapper ? wrapper.querySelector('input') : null;
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    });

    // Helper to extract full auth values from DOM
    function extractAuthValues() {
      if (!authTypeSelect) return { type: 'none' };
      const authType = authTypeSelect.value;

      let token = '';
      let headerName = 'Authorization';
      let keyName = undefined;
      let headerPrefix = undefined;
      let addTo = undefined;
      let clientId = undefined;
      let clientSecret = undefined;
      let authorizationUrl = undefined;
      let tokenUrl = undefined;
      let scopes = undefined;
      let grantType = undefined;
      let username = undefined;
      let password = undefined;

      if (authType === 'bearer') {
        token = (document.getElementById('bearer-token')?.value || '').trim();
        headerPrefix = (document.getElementById('bearer-prefix')?.value || '').trim() || 'Bearer';
        headerName = (document.getElementById('bearer-header')?.value || '').trim() || 'Authorization';
      } else if (authType === 'apiKey') {
        keyName = (document.getElementById('apikey-key')?.value || '').trim() || 'X-API-Key';
        token = (document.getElementById('apikey-value')?.value || '').trim();
        headerName = keyName;
        addTo = document.getElementById('apikey-add-to')?.value || 'header';
      } else if (authType === 'oauth2') {
        grantType = document.getElementById('oauth-grant-type')?.value || 'authorization_code';
        token = (document.getElementById('oauth-token')?.value || '').trim();
        headerPrefix = (document.getElementById('oauth-prefix')?.value || '').trim() || 'Bearer';
        headerName = (document.getElementById('oauth-header')?.value || '').trim() || 'Authorization';
        clientId = (document.getElementById('oauth-client-id')?.value || '').trim();
        clientSecret = (document.getElementById('oauth-client-secret')?.value || '').trim();
        authorizationUrl = (document.getElementById('oauth-auth-url')?.value || '').trim();
        tokenUrl = (document.getElementById('oauth-token-url')?.value || '').trim();
        const scopesRaw = (document.getElementById('oauth-scopes')?.value || '').trim();
        scopes = scopesRaw ? scopesRaw.split(/[\\s,]+/).filter(Boolean) : [];
      } else if (authType === 'basic') {
        username = (document.getElementById('basic-username')?.value || '').trim();
        password = (document.getElementById('basic-password')?.value || '').trim();
        headerName = (document.getElementById('basic-header')?.value || '').trim() || 'Authorization';
      }

      return {
        type: authType,
        token,
        headerName,
        keyName,
        headerPrefix,
        addTo,
        clientId,
        clientSecret,
        authorizationUrl,
        tokenUrl,
        scopes,
        grantType,
        username,
        password,
      };
    }
  `;
}

