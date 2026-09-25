import { AppState, EnvironmentConfig, InheritedHeaderInfo, InheritedVariableInfo, RequestContext, StoredToken } from '../../types';
import { renderAuthCss, renderAuthFieldsHtml, getSharedAuthClientScript } from './sharedAuthHtml';

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getRequestPanelHtml(
  context: RequestContext,
  state: AppState,
  initialInheritedVars: InheritedVariableInfo[] = [],
  initialInheritedHeaders: InheritedHeaderInfo[] = [],
  availableTokens: StoredToken[] = []
): string {
  const activeProfile = context.profileId || context.profile || (state.activeProfileId !== 'all' ? state.activeProfileId : undefined) || state.profiles[0]?.id;
  const profileOptions = state.profiles
    .map((p) => {
      const isDuplicate = state.profiles.filter((o) => o.name === p.name).length > 1;
      const label = isDuplicate ? `${p.name} (${p.id.replace(/^profile-/, '')})` : p.name;
      const isSelected = p.id === activeProfile || p.name === activeProfile;
      return `<option value="${escapeHtml(p.name)}" data-id="${escapeHtml(p.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');

  const envEntries = Object.entries(state.environments);
  const envKeys = Object.keys(state.environments);
  const activeEnv = context.environment || state.activeEnvironmentName || envKeys[0];
  const selectedEnvKey = envKeys.find(k => k === activeEnv || state.environments[k]?.id === activeEnv) || envKeys[0];

  // Lookup maps for inheritance resolution
  const envById = new Map<string, { name: string; env: EnvironmentConfig }>();
  const envByName = new Map<string, { name: string; env: EnvironmentConfig }>();
  for (const [name, env] of envEntries) {
    envByName.set(name, { name, env });
    if (env.id) envById.set(env.id, { name, env });
  }

  // Build parent-to-children mapping & root entries
  const childrenMap = new Map<string, Array<{ name: string; env: EnvironmentConfig }>>();
  const rootEntries: Array<{ name: string; env: EnvironmentConfig }> = [];

  for (const [name, env] of envEntries) {
    const parentRef = env.inheritsFrom;
    const parentEntry = parentRef ? (envById.get(parentRef) || envByName.get(parentRef)) : undefined;

    if (parentEntry && parentEntry.name !== name) {
      const key = parentEntry.env.id || parentEntry.name;
      if (!childrenMap.has(key)) {
        childrenMap.set(key, []);
      }
      childrenMap.get(key)!.push({ name, env });
    } else {
      rootEntries.push({ name, env });
    }
  }

  const renderedEnvNames = new Set<string>();
  const optionLines: string[] = [];

  const renderEnvOption = (name: string, env: EnvironmentConfig, depth: number, visited: Set<string>) => {
    const key = env.id || name;
    if (visited.has(key)) return;
    const nextVisited = new Set(visited).add(key);
    renderedEnvNames.add(name);

    const rawChildren = childrenMap.get(key) || [];
    const validChildren = rawChildren.filter(c => !visited.has(c.env.id || c.name));
    const hasChildren = validChildren.length > 0;

    const parentEntry = env.inheritsFrom ? (envById.get(env.inheritsFrom) || envByName.get(env.inheritsFrom)) : undefined;
    const parentDisplayName = parentEntry ? parentEntry.name : env.inheritsFrom;

    let label = '';
    if (depth > 0) {
      const indent = '\u00A0\u00A0'.repeat(depth) + '↳ ';
      label = `${indent}${name}`;
      if (parentDisplayName) {
        label += ` (inherits: ${parentDisplayName})`;
      }
      if (hasChildren) {
        label += ` [Parent (${validChildren.length})]`;
      }
    } else {
      label = name;
      if (hasChildren) {
        label += ` (Parent • ${validChildren.length} ${validChildren.length === 1 ? 'child' : 'children'})`;
      } else if (parentDisplayName) {
        label += ` (inherits: ${parentDisplayName})`;
      }
    }

    const isSelected = name === selectedEnvKey;
    optionLines.push(
      `<option value="${escapeHtml(name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`
    );

    for (const child of validChildren) {
      renderEnvOption(child.name, child.env, depth + 1, nextVisited);
    }
  };

  for (const root of rootEntries) {
    renderEnvOption(root.name, root.env, 0, new Set());
  }

  // Safety fallback for any environments not reachable from roots
  for (const [name, env] of envEntries) {
    if (!renderedEnvNames.has(name)) {
      renderEnvOption(name, env, 0, new Set());
    }
  }

  const environmentOptions = optionLines.join('');

  const collectionName = escapeHtml(context.collection || state.collections[0]?.name || 'Demo Collection');
  const displayFolder = escapeHtml(context.folder && context.folder !== 'Root' ? context.folder : 'Root');
  const rawRequestName = context.requestName || (context as any).name || (context.url ? `${context.method || 'GET'} ${context.url}` : 'New Request');
  const requestName = escapeHtml(rawRequestName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${requestName || 'byrdsnest api client Request'}</title>
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
    .crumb-request-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 4px 1px 8px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .crumb-request-wrapper:hover {
      border-color: var(--primary);
    }
    .crumb-request-wrapper:focus-within {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
      background: var(--bg);
    }
    .crumb-request-icon {
      color: var(--muted);
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .crumb-request-input {
      background: transparent;
      border: none;
      color: var(--text);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 4px;
      outline: none;
      min-width: 140px;
      max-width: 320px;
    }
    .crumb-request-input::placeholder {
      color: var(--muted);
      font-weight: normal;
    }
    .crumb-rename-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 3px;
      border-radius: 3px;
      transition: color 0.15s ease, background 0.15s ease;
      flex-shrink: 0;
    }
    .crumb-rename-btn:hover {
      color: var(--success);
      background: rgba(78, 201, 176, 0.15);
    }
    .crumb-rename-btn.saved-flash {
      color: var(--success);
      animation: pulse-saved 0.6s ease;
    }
    @keyframes pulse-saved {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); color: #4ec9b0; }
      100% { transform: scale(1); }
    }

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
    .btn-toggle-dynamic {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      padding: 1px 7px;
      border-radius: 3px;
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .btn-toggle-dynamic:hover {
      color: var(--text);
      border-color: var(--primary);
      background: var(--bg);
    }

    /* Collapsible source groups in inherited vars/headers */
    .var-group {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .var-group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      background: rgba(255,255,255,0.025);
      user-select: none;
      transition: background 0.12s ease;
    }
    .var-group-header:hover {
      background: rgba(255,255,255,0.05);
    }
    .var-group-chevron {
      font-size: 9px;
      color: var(--muted);
      transition: transform 0.18s ease;
      flex-shrink: 0;
      margin-left: auto;
    }
    .var-group-header.collapsed .var-group-chevron {
      transform: rotate(-90deg);
    }
    .var-group-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .var-group-count {
      font-size: 10px;
      color: var(--muted);
      background: rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 1px 6px;
      flex-shrink: 0;
    }
    .var-group-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 6px 6px 6px;
      background: rgba(255,255,255,0.01);
    }
    .var-group-header.collapsed + .var-group-body {
      display: none;
    }
    /* Slightly tighter rows inside groups */
    .var-group .inherited-row {
      border-radius: 3px;
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

    /* URL preview bar */
    .url-preview-bar {
      font-size: 11px;
      color: var(--muted);
      padding: 3px 6px 3px 10px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      min-height: 20px;
      line-height: 18px;
      font-family: Consolas, Monaco, "Courier New", monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .url-preview-bar.has-unresolved {
      background: rgba(241, 76, 76, 0.06);
      border-bottom-color: rgba(241, 76, 76, 0.3);
    }
    .url-preview-label {
      color: var(--muted);
      font-family: var(--vscode-font-family, inherit);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      flex-shrink: 0;
    }
    .url-preview-resolved {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .unresolved-token {
      color: #f14c4c;
      background: rgba(241, 76, 76, 0.15);
      border-radius: 2px;
      padding: 0 2px;
      font-family: Consolas, Monaco, "Courier New", monospace;
    }
    .url-preview-warn {
      color: #f14c4c;
      font-size: 10px;
      font-family: var(--vscode-font-family, inherit);
      flex-shrink: 0;
    }

    /* Scripts tab & Snippet Chips */
    .snippet-btn {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
    }
    .snippet-btn:hover {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
    }
    .script-type-btn.active {
      background: var(--primary);
      color: var(--primary-fg);
      border-color: var(--primary);
    }

    /* Test Results Cards */
    .test-result-card {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 12px;
      border-radius: 4px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      font-size: 12px;
    }
    .test-result-card.passed {
      border-left: 3px solid #238636;
    }
    .test-result-card.failed {
      border-left: 3px solid #f14c4c;
      background: rgba(241, 76, 76, 0.05);
    }
    .test-result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .test-pass-icon { color: #238636; font-weight: bold; }
    .test-fail-icon { color: #f14c4c; font-weight: bold; }
    .test-error-msg {
      font-size: 11px;
      color: #f14c4c;
      font-family: Consolas, Monaco, monospace;
      margin-top: 3px;
      padding: 4px 8px;
      background: rgba(241,76,76,0.1);
      border-radius: 3px;
    }

    /* Console Logs */
    .console-log-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 6px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-family: Consolas, Monaco, monospace;
      font-size: 11px;
      line-height: 1.5;
    }
    .console-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 4px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .console-badge.log { background: rgba(255,255,255,0.1); color: var(--text); }
    .console-badge.info { background: rgba(79,193,255,0.2); color: #4fc1ff; }
    .console-badge.warn { background: rgba(204,167,0,0.2); color: #cca700; }
    .console-badge.error { background: rgba(241,76,76,0.2); color: #f14c4c; }
    .console-msg { flex: 1; word-break: break-word; white-space: pre-wrap; }
    .console-time { color: var(--muted); font-size: 10px; flex-shrink: 0; }

    ${renderAuthCss()}
  </style>
</head>
<body>
  <div class="app">
    <!-- Top Context Bar -->
    <div class="context-bar">
      <div class="breadcrumbs">
        <span class="crumb-pill" id="crumb-col" title="Collection">${collectionName}</span>
        <span class="crumb-separator">›</span>
        <span class="crumb-pill" id="crumb-folder" title="Folder">${displayFolder}</span>
        <span class="crumb-separator">›</span>
        <div class="crumb-request-wrapper" title="Request Name (click to edit, Enter to rename)">
          <span class="crumb-request-icon" title="Request">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.23 1h-1.46L3.52 9.25l-.16.32L2.01 13.9a.5.5 0 0 0 .61.61l4.33-1.35.32-.16L15.5 4.77v-1.46L13.23 1zM4.2 10.02L11.5 2.72l1.78 1.78-7.3 7.3-2.3.72.72-2.3z"/>
            </svg>
          </span>
          <input
            type="text"
            id="req-name-input"
            class="crumb-request-input"
            value="${requestName}"
            placeholder="Request Name"
            spellcheck="false"
            autocomplete="off"
            title="Click to rename request (Enter to save)"
          />
          <button id="btn-rename-req" class="crumb-rename-btn" type="button" title="Save Request Name">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
            </svg>
          </button>
        </div>
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
        value="${escapeHtml(context.url || '')}"
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

    <!-- URL Preview Bar -->
    <div id="url-preview-bar" class="url-preview-bar" style="display:none;">
      <span class="url-preview-label">→</span>
      <span class="url-preview-resolved" id="url-preview-text"></span>
      <span class="url-preview-warn" id="url-preview-warn" style="display:none;">⚠ unresolved tokens</span>
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
          <button class="tab-btn" data-tab="tab-scripts">Scripts</button>
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
              <div style="display:inline-flex; align-items:center; gap:6px;">
                <button id="btn-toggle-dynamic-vars" class="btn-toggle-dynamic" type="button" style="display:none;" title="Toggle built-in dynamic variables ($uuid, $timestamp, etc.)">Show Built-in Dynamic</button>
                <span class="meta-tag" id="inherited-vars-count">0 available</span>
              </div>
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

            ${renderAuthFieldsHtml(context.auth?.auth, 'this request', availableTokens)}
          </div>
        </div>

        <!-- Tab: Scripts -->
        <div id="tab-scripts" class="tab-content">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:6px;">
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-secondary script-type-btn active" data-script-view="pre" style="font-size:11px; padding:3px 10px;">Pre-Request Script</button>
              <button type="button" class="btn btn-secondary script-type-btn" data-script-view="post" style="font-size:11px; padding:3px 10px;">Post-Response Script (Tests)</button>
            </div>
            <div style="font-size:11px; color:var(--muted);">
              Access globals: <code style="color:#4ec9b0;">bb</code> & <code style="color:#4ec9b0;">pm</code>
            </div>
          </div>

          <!-- Snippet helper bar -->
          <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px; align-items:center;">
            <span style="font-size:10px; color:var(--muted); margin-right:4px;">SNIPPETS:</span>
            <button type="button" class="snippet-btn" data-snippet="set-env">+ Set Env Var</button>
            <button type="button" class="snippet-btn" data-snippet="get-env">+ Get Env Var</button>
            <button type="button" class="snippet-btn" data-snippet="status-200">+ Status is 200</button>
            <button type="button" class="snippet-btn" data-snippet="parse-json">+ Parse JSON</button>
            <button type="button" class="snippet-btn" data-snippet="set-header">+ Set Header</button>
            <button type="button" class="snippet-btn" data-snippet="hash-sha256">+ SHA-256</button>
          </div>

          <div id="script-view-pre" class="script-subview">
            <div style="font-size:11px; color:var(--muted); margin-bottom:6px;">
              Runs before sending. Mutate <code>bb.request.headers</code>, <code>bb.request.body</code>, or set variables.
            </div>
            <textarea id="req-pre-script" class="textarea-box" style="min-height:220px; font-family:Consolas, Monaco, monospace; font-size:12px;" placeholder="// Example: set dynamic timestamp or signature&#10;bb.request.headers['X-Timestamp'] = Date.now().toString();&#10;bb.environment.set('reqId', crypto.randomUUID());">${escapeHtml(context.preRequestScript || '')}</textarea>
          </div>

          <div id="script-view-post" class="script-subview" style="display:none;">
            <div style="font-size:11px; color:var(--muted); margin-bottom:6px;">
              Runs after response. Assert tests with <code>bb.test()</code> and <code>bb.expect()</code>, or store tokens with <code>bb.environment.set()</code>.
            </div>
            <textarea id="req-post-script" class="textarea-box" style="min-height:220px; font-family:Consolas, Monaco, monospace; font-size:12px;" placeholder="// Example: assert status 200 and store token&#10;bb.test('Status is 200', () => {&#10;  bb.expect(bb.response.status).toBe(200);&#10;});&#10;&#10;const data = bb.response.json();&#10;if (data.token) {&#10;  bb.environment.set('authToken', data.token);&#10;}">${escapeHtml(context.postResponseScript || '')}</textarea>
          </div>
        </div>

        <!-- Tab: Notes -->
        <div id="tab-notes" class="tab-content">
          <textarea id="req-notes" class="textarea-box" placeholder="Documentation or notes for this request...">${escapeHtml(context.notes || '')}</textarea>
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
          <button class="tab-btn" data-tab="tab-resp-tests">Tests <span id="resp-test-count" class="pill" style="display:none; font-size:10px; padding:1px 6px; margin-left:4px;"></span></button>
          <button class="tab-btn" data-tab="tab-resp-console">Console <span id="resp-console-count" class="meta-tag" style="display:none; margin-left:4px;"></span></button>
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

        <div id="tab-resp-tests" class="tab-content">
          <div id="test-results-container" style="display:flex; flex-direction:column; gap:6px; padding:10px;">
            <div style="color: var(--muted); font-size:12px;">No tests executed yet. Add test assertions in the <strong>Scripts &rarr; Post-Response Script</strong> tab using <code>bb.test(...)</code>.</div>
          </div>
        </div>

        <div id="tab-resp-console" class="tab-content">
          <div id="console-logs-container" style="display:flex; flex-direction:column; padding:8px; font-family: Consolas, Monaco, monospace; font-size:11px;">
            <div style="color: var(--muted); font-size:12px;">No console logs. Use <code>console.log(...)</code> in pre-request or post-response scripts.</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    ${getSharedAuthClientScript()}

    // Context / ID tracking
    let currentRequestId = "${escapeHtml(context.requestId || context.id || '')}";
    let initialHeaders = ${JSON.stringify(context.headers || {}).replace(/</g, '\\u003c')};
    let initialVars = ${JSON.stringify(context.variables || []).replace(/</g, '\\u003c')};
    let initialInheritedVars = ${JSON.stringify(initialInheritedVars).replace(/</g, '\\u003c')};
    let initialInheritedHeaders = ${JSON.stringify(initialInheritedHeaders).replace(/</g, '\\u003c')};
    let currentInheritedVars = initialInheritedVars;
    let currentInheritedHeaders = initialInheritedHeaders;
    let initialBodyType = "${escapeHtml(context.bodyType || '')}";
    let initialBody = ${JSON.stringify(context.body || '').replace(/</g, '\\u003c')};
    let initialBodyFormData = ${JSON.stringify(context.bodyFormData || []).replace(/</g, '\\u003c')};
    const activeCollection = ${JSON.stringify(context.collection || state.collections[0]?.name || 'Demo Collection').replace(/</g, '\\u003c')};
    const activeFolder = ${JSON.stringify(context.folder && context.folder !== 'Root' ? context.folder : '').replace(/</g, '\\u003c')};

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

    // Script view toggle (Pre-Request vs Post-Response)
    document.querySelectorAll('.script-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.script-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.getAttribute('data-script-view');
        const preView = document.getElementById('script-view-pre');
        const postView = document.getElementById('script-view-post');
        if (preView) preView.style.display = view === 'pre' ? 'block' : 'none';
        if (postView) postView.style.display = view === 'post' ? 'block' : 'none';
      });
    });

    // Script Snippets
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const snippetType = btn.getAttribute('data-snippet');
        const activeBtn = document.querySelector('.script-type-btn.active');
        const activeView = activeBtn ? activeBtn.getAttribute('data-script-view') : 'pre';
        const targetTextarea = activeView === 'pre' ? document.getElementById('req-pre-script') : document.getElementById('req-post-script');
        if (!targetTextarea) return;

        let snippetCode = '';
        switch (snippetType) {
          case 'set-env':
            snippetCode = 'bb.environment.set("myKey", "myValue");\\n';
            break;
          case 'get-env':
            snippetCode = 'const val = bb.environment.get("myKey");\\nconsole.log("Got value:", val);\\n';
            break;
          case 'status-200':
            snippetCode = 'bb.test("Status code is 200", () => {\\n  bb.expect(bb.response.status).toBe(200);\\n});\\n';
            break;
          case 'parse-json':
            snippetCode = 'const data = bb.response.json();\\nconsole.log("Response payload:", data);\\n';
            break;
          case 'set-header':
            snippetCode = 'bb.request.headers["X-Custom-Header"] = "CustomValue";\\n';
            break;
          case 'hash-sha256':
            snippetCode = 'const hash = crypto.createHash("sha256").update("myMessage").digest("hex");\\nconsole.log("SHA-256:", hash);\\n';
            break;
        }

        if (snippetCode) {
          const start = targetTextarea.selectionStart !== undefined ? targetTextarea.selectionStart : targetTextarea.value.length;
          const end = targetTextarea.selectionEnd !== undefined ? targetTextarea.selectionEnd : targetTextarea.value.length;
          const prev = targetTextarea.value;
          const prefix = (start > 0 && !prev.substring(0, start).endsWith('\\n')) ? '\\n' : '';
          targetTextarea.value = prev.substring(0, start) + prefix + snippetCode + prev.substring(end);
          targetTextarea.focus();
        }
      });
    });

    // DOM Containers
    const varRowsContainer = document.getElementById('var-rows');
    const headerRowsContainer = document.getElementById('header-rows');
    const inheritedVarsContainer = document.getElementById('inherited-var-rows');
    const inheritedVarsCount = document.getElementById('inherited-vars-count');
    const inheritedHeadersContainer = document.getElementById('inherited-header-rows');
    const inheritedHeadersCount = document.getElementById('inherited-headers-count');

    // URL Preview Bar — live resolved URL with unresolved token highlighting
    const urlPreviewBar = document.getElementById('url-preview-bar');
    const urlPreviewText = document.getElementById('url-preview-text');
    const urlPreviewWarn = document.getElementById('url-preview-warn');

    function updateUrlPreview() {
      const urlInput = document.getElementById('url-input');
      if (!urlInput || !urlPreviewBar || !urlPreviewText) return;
      const raw = urlInput.value.trim();

      if (!raw) {
        urlPreviewBar.style.display = 'none';
        return;
      }

      // Build merged variable map: inherited (lower priority) → request vars (higher priority)
      const varMap = {};
      if (currentInheritedVars && currentInheritedVars.length) {
        // Walk in resolution order; last writer wins (matches server-side precedence)
        for (const item of currentInheritedVars) {
          if (!item.isOverridden && item.key && item.value !== undefined) {
            varMap[item.key] = String(item.value);
          }
        }
        // Also include overridden entries so we have all keys, but only if not already set
        for (const item of currentInheritedVars) {
          if (item.isOverridden && item.key && !(item.key in varMap)) {
            varMap[item.key] = String(item.value ?? '');
          }
        }
      }
      // Request-level vars override everything
      if (varRowsContainer) {
        varRowsContainer.querySelectorAll('.param-row').forEach(row => {
          const enabled = row.querySelector('[data-role="enabled"]')?.checked;
          const name = (row.querySelector('[data-role="name"]')?.value || '').trim();
          const value = row.querySelector('[data-role="value"]')?.value || '';
          if (enabled && name) varMap[name] = value;
        });
      }

      // Tokenise the URL: split on {{varName}} tokens
      const TOKEN_RE = /\\{\\{([^}]+)\\}\\}/g;
      let hasUnresolved = false;

      // Build an array of [text | token] segments
      const segments = [];
      let lastIndex = 0;
      let match;
      TOKEN_RE.lastIndex = 0;
      while ((match = TOKEN_RE.exec(raw)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ type: 'text', value: raw.slice(lastIndex, match.index) });
        }
        const key = match[1].trim();
        const resolved = varMap[key];
        if (resolved !== undefined) {
          segments.push({ type: 'resolved', value: resolved });
        } else {
          segments.push({ type: 'unresolved', value: match[0] });
          hasUnresolved = true;
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < raw.length) {
        segments.push({ type: 'text', value: raw.slice(lastIndex) });
      }

      // Render segments into urlPreviewText
      urlPreviewText.innerHTML = '';
      for (const seg of segments) {
        if (seg.type === 'unresolved') {
          const span = document.createElement('span');
          span.className = 'unresolved-token';
          span.textContent = seg.value;
          span.title = 'Variable not found in current context';
          urlPreviewText.appendChild(span);
        } else {
          urlPreviewText.appendChild(document.createTextNode(seg.value));
        }
      }

      urlPreviewBar.style.display = 'flex';
      urlPreviewBar.classList.toggle('has-unresolved', hasUnresolved);
      if (urlPreviewWarn) urlPreviewWarn.style.display = hasUnresolved ? 'inline' : 'none';
    }

    // Helper functions for reading request state
    function getRequestVariables() {
      const vars = [];
      if (!varRowsContainer) return vars;
      varRowsContainer.querySelectorAll('.param-row').forEach(row => {
        const enabled = row.querySelector('[data-role="enabled"]')?.checked;
        const name = (row.querySelector('[data-role="name"]')?.value || '').trim();
        const value = row.querySelector('[data-role="value"]')?.value || '';
        const hidden = row.querySelector('[data-role="hidden"]')?.checked;
        if (name) {
          vars.push({ name, value, enabled: !!enabled, hidden: !!hidden });
        }
      });
      return vars;
    }

    function getRequestHeaders() {
      const headers = {};
      if (!headerRowsContainer) return headers;
      headerRowsContainer.querySelectorAll('.param-row').forEach(row => {
        const enabled = row.querySelector('[data-role="enabled"]')?.checked;
        const key = (row.querySelector('[data-role="key"]')?.value || '').trim();
        const value = row.querySelector('[data-role="value"]')?.value || '';
        if (enabled && key) {
          headers[key] = value;
        }
      });
      return headers;
    }

    // Tracks which groups are collapsed across re-renders
    const varGroupCollapsed = new Map();   // groupId → boolean
    const hdrGroupCollapsed = new Map();

    // Helper: build a single inherited-row element
    function buildInheritedRow(item, isOverridden, keyLabel, onOverride) {
      const row = document.createElement('div');
      row.className = 'inherited-row' + (isOverridden ? ' is-overridden' : '');

      const keySpan = document.createElement('span');
      keySpan.className = 'inherited-key';
      keySpan.textContent = keyLabel;
      keySpan.title = item.key;

      const valSpan = document.createElement('span');
      valSpan.className = 'inherited-val';
      valSpan.textContent = item.value;
      valSpan.title = item.value;

      const badgeContainer = document.createElement('div');
      badgeContainer.style.cssText = 'display:flex;align-items:center;gap:4px;';

      if (isOverridden) {
        const overPill = document.createElement('span');
        overPill.className = 'overridden-pill';
        overPill.textContent = 'Overridden';
        badgeContainer.appendChild(overPill);
      }

      const actionDiv = document.createElement('div');
      if (onOverride && !isOverridden) {
        const overrideBtn = document.createElement('button');
        overrideBtn.className = 'btn btn-secondary override-btn';
        overrideBtn.textContent = '+ Override';
        overrideBtn.title = 'Copy to request to override';
        overrideBtn.addEventListener('click', onOverride);
        actionDiv.appendChild(overrideBtn);
      }

      row.appendChild(keySpan);
      row.appendChild(valSpan);
      row.appendChild(badgeContainer);
      row.appendChild(actionDiv);
      return row;
    }

    // Helper: build a collapsible group wrapper
    function buildGroup(groupId, source, sourceName, items, collapseMap, defaultCollapsed, buildRowFn) {
      const wasCollapsed = collapseMap.has(groupId) ? collapseMap.get(groupId) : defaultCollapsed;

      const group = document.createElement('div');
      group.className = 'var-group';

      const header = document.createElement('div');
      header.className = 'var-group-header' + (wasCollapsed ? ' collapsed' : '');

      const badge = document.createElement('span');
      badge.className = 'source-badge source-' + source;
      badge.textContent = sourceName;

      const name = document.createElement('span');
      name.className = 'var-group-name';
      name.textContent = sourceName;
      // Use badge instead of separate name label for compactness
      name.style.display = 'none';

      const count = document.createElement('span');
      count.className = 'var-group-count';
      count.textContent = items.length + (items.length === 1 ? ' var' : ' vars');

      const chevron = document.createElement('span');
      chevron.className = 'var-group-chevron';
      chevron.textContent = '▾';

      header.appendChild(badge);
      header.appendChild(count);
      header.appendChild(chevron);

      const body = document.createElement('div');
      body.className = 'var-group-body';
      items.forEach(item => body.appendChild(buildRowFn(item)));

      header.addEventListener('click', () => {
        const isNowCollapsed = header.classList.toggle('collapsed');
        collapseMap.set(groupId, isNowCollapsed);
      });

      group.appendChild(header);
      group.appendChild(body);
      return group;
    }

    let showDynamicVars = false;

    // --- Inherited Variables Inspector (grouped) ---
    function renderInheritedVars() {
      if (!inheritedVarsContainer) return;
      inheritedVarsContainer.innerHTML = '';

      const userVars = (currentInheritedVars || []).filter(item => item.source !== 'dynamic');
      const dynamicVars = (currentInheritedVars || []).filter(item => item.source === 'dynamic');

      if (inheritedVarsCount) {
        inheritedVarsCount.textContent = userVars.length + ' available';
      }

      const btnToggleDynamic = document.getElementById('btn-toggle-dynamic-vars');
      if (btnToggleDynamic) {
        btnToggleDynamic.style.display = dynamicVars.length > 0 ? 'inline-flex' : 'none';
        btnToggleDynamic.textContent = showDynamicVars ? 'Hide Built-in Dynamic' : ('Show Built-in Dynamic (' + dynamicVars.length + ')');
      }

      if (userVars.length === 0 && (!showDynamicVars || dynamicVars.length === 0)) {
        inheritedVarsContainer.innerHTML = '<div style="font-size: 11px; color: var(--muted); padding: 8px 4px;">No inherited variables for this context.</div>';
        return;
      }

      const reqVarKeys = Array.from(varRowsContainer ? varRowsContainer.querySelectorAll('.param-row') : []).map(row => {
        const en = row.querySelector('[data-role="enabled"]')?.checked;
        const k = (row.querySelector('[data-role="name"]')?.value || '').trim();
        return en && k ? k : null;
      }).filter(Boolean);

      // Group items by source key
      const varsToRender = showDynamicVars ? currentInheritedVars : userVars;
      const groups = new Map(); // groupId → { source, sourceName, items[] }
      varsToRender.forEach(item => {
        const groupId = item.source + '::' + item.sourceName;
        if (!groups.has(groupId)) groups.set(groupId, { source: item.source, sourceName: item.sourceName, items: [] });
        groups.get(groupId).items.push(item);
      });

      groups.forEach(({ source, sourceName, items }, groupId) => {
        const isDynamic = source === 'dynamic';
        const group = buildGroup(
          groupId, source, sourceName, items,
          varGroupCollapsed,
          isDynamic, // dynamic starts collapsed
          (item) => {
            const isOverridden = item.isOverridden || reqVarKeys.includes(item.key);
            return buildInheritedRow(
              item, isOverridden,
              isDynamic ? item.key : ('{{' + item.key + '}}'),
              isDynamic ? null : () => {
                const newRow = addVarRow(item.key, item.value, true, false);
                const valInp = newRow.querySelector('[data-role="value"]');
                if (valInp) valInp.focus();
              }
            );
          }
        );
        inheritedVarsContainer.appendChild(group);
      });
    }

    // --- Inherited Headers Inspector (grouped) ---
    function renderInheritedHeaders() {
      if (!inheritedHeadersContainer) return;
      inheritedHeadersContainer.innerHTML = '';

      if (!currentInheritedHeaders || currentInheritedHeaders.length === 0) {
        inheritedHeadersContainer.innerHTML = '<div style="font-size: 11px; color: var(--muted); padding: 8px 4px;">No inherited headers for this context.</div>';
        if (inheritedHeadersCount) inheritedHeadersCount.textContent = '0 inherited';
        return;
      }

      const reqHeaderKeys = Array.from(headerRowsContainer ? headerRowsContainer.querySelectorAll('.param-row') : []).map(row => {
        const en = row.querySelector('[data-role="enabled"]')?.checked;
        const k = (row.querySelector('[data-role="key"]')?.value || '').trim().toLowerCase();
        return en && k ? k : null;
      }).filter(Boolean);

      if (inheritedHeadersCount) inheritedHeadersCount.textContent = currentInheritedHeaders.length + ' inherited';

      const groups = new Map();
      currentInheritedHeaders.forEach(item => {
        const groupId = item.source + '::' + item.sourceName;
        if (!groups.has(groupId)) groups.set(groupId, { source: item.source, sourceName: item.sourceName, items: [] });
        groups.get(groupId).items.push(item);
      });

      groups.forEach(({ source, sourceName, items }, groupId) => {
        const group = buildGroup(
          groupId, source, sourceName, items,
          hdrGroupCollapsed,
          false, // headers always start expanded
          (item) => {
            const isOverridden = item.isOverridden || reqHeaderKeys.includes(item.key.toLowerCase());
            return buildInheritedRow(
              item, isOverridden,
              item.key,
              () => {
                const newRow = addHeaderRow(item.key, item.value, true);
                const valInp = newRow.querySelector('[data-role="value"]');
                if (valInp) valInp.focus();
              }
            );
          }
        );
        inheritedHeadersContainer.appendChild(group);
      });
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
          collection: activeCollection,
          folder: activeFolder,
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

    // Wire Request Name inline renaming
    const reqNameInput = document.getElementById('req-name-input');
    const btnRename = document.getElementById('btn-rename-req');
    let lastSavedName = reqNameInput ? reqNameInput.value.trim() : '';

    function autoResizeInput(input) {
      if (!input) return;
      const len = Math.max(input.value.length || 0, (input.placeholder || '').length || 10);
      input.style.width = Math.min(Math.max(len + 2, 14), 45) + 'ch';
    }

    function triggerRename() {
      if (!reqNameInput) return;
      const newName = reqNameInput.value.trim();
      if (!newName || newName === lastSavedName) return;
      lastSavedName = newName;

      if (btnRename) {
        btnRename.classList.add('saved-flash');
        setTimeout(() => btnRename.classList.remove('saved-flash'), 800);
      }

      vscode.postMessage({
        type: 'renameRequest',
        payload: {
          requestId: currentRequestId,
          newName: newName,
          collection: activeCollection,
          folder: activeFolder
        }
      });
    }

    if (reqNameInput) {
      autoResizeInput(reqNameInput);
      reqNameInput.addEventListener('input', () => autoResizeInput(reqNameInput));
      reqNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerRename();
          reqNameInput.blur();
        }
      });
      reqNameInput.addEventListener('change', triggerRename);
      if (btnRename) {
        btnRename.addEventListener('click', triggerRename);
      }
    }

    const btnToggleDynamicEl = document.getElementById('btn-toggle-dynamic-vars');
    if (btnToggleDynamicEl) {
      btnToggleDynamicEl.addEventListener('click', () => {
        showDynamicVars = !showDynamicVars;
        renderInheritedVars();
      });
    }

    // Wire URL input → live preview
    const urlInputEl = document.getElementById('url-input');
    if (urlInputEl) {
      urlInputEl.addEventListener('input', () => updateUrlPreview());
    }

    // Variables UI Builder
    function addVarRow(name = '', value = '', enabled = true, hidden = false) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = \`
        <input type="checkbox" \${enabled ? 'checked' : ''} data-role="enabled" style="cursor: pointer;" />
        <input class="param-input" type="text" placeholder="Key" value="\${String(name).replace(/"/g, '&quot;')}" data-role="name" />
        <input class="param-input" type="\${hidden ? 'password' : 'text'}" placeholder="Value" value="\${String(value).replace(/"/g, '&quot;')}" data-role="value" />
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
        updateUrlPreview();
      });

      row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => { renderInheritedVars(); updateUrlPreview(); });
        input.addEventListener('change', () => { renderInheritedVars(); updateUrlPreview(); });
      });

      if (varRowsContainer) {
        varRowsContainer.appendChild(row);
      }
      renderInheritedVars();
      return row;
    }

    const btnAddVar = document.getElementById('btn-add-var');
    if (btnAddVar) {
      btnAddVar.addEventListener('click', () => addVarRow());
    }

    // Populate initial variables
    if (initialVars.length > 0) {
      initialVars.forEach(v => addVarRow(v.name, v.value, v.enabled !== false, v.hidden === true));
    } else {
      addVarRow();
    }

    // Headers UI Builder
    function addHeaderRow(key = '', value = '', enabled = true) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = \`
        <input type="checkbox" \${enabled ? 'checked' : ''} data-role="enabled" style="cursor: pointer;" />
        <input class="param-input" type="text" placeholder="Header name" value="\${String(key).replace(/"/g, '&quot;')}" data-role="key" />
        <input class="param-input" type="text" placeholder="Value" value="\${String(value).replace(/"/g, '&quot;')}" data-role="value" />
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

      if (headerRowsContainer) {
        headerRowsContainer.appendChild(row);
      }
      renderInheritedHeaders();
      return row;
    }

    const btnAddHeader = document.getElementById('btn-add-header');
    if (btnAddHeader) {
      btnAddHeader.addEventListener('click', () => addHeaderRow());
    }

    // Populate initial headers
    const headerEntries = Object.entries(initialHeaders);
    if (headerEntries.length > 0) {
      headerEntries.forEach(([k, v]) => addHeaderRow(k, v, true));
    } else {
      addHeaderRow('Accept', 'application/json', true);
    }

    // Initial render of inherited tables and URL preview
    renderInheritedVars();
    renderInheritedHeaders();
    updateUrlPreview();

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
      return getRequestVariables();
    }

    // Helper to get headers map
    function getHeaders() {
      return getRequestHeaders();
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
        requestName: document.getElementById('req-name-input')?.value?.trim() || '',
        method: document.getElementById('method-select').value,
        url: document.getElementById('url-input').value.trim(),
        profile: profileSelect ? profileSelect.value : '',
        profileId: profileId,
        environment: document.getElementById('select-env').value,
        collection: activeCollection,
        folder: activeFolder,
        headers: getHeaders(),
        body: bodyInfo.body,
        bodyType: bodyInfo.bodyType,
        bodyFormData: bodyInfo.bodyFormData,
        variables: getVariables(),
        auth: getAuthSettings(),
        notes: document.getElementById('req-notes').value,
        preRequestScript: document.getElementById('req-pre-script')?.value || '',
        postResponseScript: document.getElementById('req-post-script')?.value || ''
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
        const bodyPre = document.getElementById('resp-body-text');

        // Status pill
        if (meta.status === 0) {
          statusPill.textContent = meta.statusText || 'Error';
          statusPill.className = 'pill status-err';
        } else {
          statusPill.textContent = \`\${meta.status} \${meta.statusText}\`;
          statusPill.className = 'pill';
          if (meta.status >= 200 && meta.status < 300) statusPill.classList.add('status-2xx');
          else if (meta.status >= 300 && meta.status < 400) statusPill.classList.add('status-3xx');
          else if (meta.status >= 400 && meta.status < 500) statusPill.classList.add('status-4xx');
          else if (meta.status >= 500) statusPill.classList.add('status-5xx');
        }

        timeTag.textContent = \`\${meta.elapsedMs} ms\`;
        if (meta.status === 0) {
          sizeTag.textContent = '';
        } else if (meta.sizeBytes) {
          const sizeKb = (meta.sizeBytes / 1024).toFixed(1);
          sizeTag.textContent = \`\${sizeKb} KB\`;
        }

        // Body rendering
        if (meta.status === 0) {
          // Network error — render diagnostic card
          bodyPre.innerHTML = '';
          bodyPre.style.padding = '0';

          const card = document.createElement('div');
          card.style.cssText = [
            'margin: 12px',
            'padding: 14px 16px',
            'border-radius: 6px',
            'border: 1px solid rgba(241,76,76,0.35)',
            'background: rgba(241,76,76,0.07)',
            'font-family: Consolas, Monaco, "Courier New", monospace',
            'font-size: 12px',
            'color: var(--text)',
            'white-space: pre-wrap',
            'word-break: break-word',
            'line-height: 1.6'
          ].join(';');

          const heading = document.createElement('div');
          heading.style.cssText = 'font-size: 13px; font-weight: 700; color: #f14c4c; margin-bottom: 10px; font-family: var(--vscode-font-family, inherit); display: flex; align-items: center; gap: 6px;';
          heading.innerHTML = '⚠ ' + (meta.statusText || 'Network Error');

          const body = document.createElement('pre');
          body.style.cssText = 'margin: 0; padding: 0; background: transparent; font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-word;';
          body.textContent = meta.body || 'An unknown network error occurred.';

          card.appendChild(heading);
          card.appendChild(body);
          bodyPre.appendChild(card);
          bodyPre.style.padding = '0';
        } else {
          // Normal response
          bodyPre.innerHTML = '';
          bodyPre.style.padding = '12px';
          try {
            const json = JSON.parse(meta.body);
            bodyPre.textContent = JSON.stringify(json, null, 2);
          } catch {
            bodyPre.textContent = meta.body || '(Empty response)';
          }
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

        // Render test results
        const testBadge = document.getElementById('resp-test-count');
        const testsContainer = document.getElementById('test-results-container');
        if (testsContainer) {
          testsContainer.innerHTML = '';
          if (meta.testResults && meta.testResults.length > 0) {
            const passedCount = meta.testResults.filter(t => t.passed).length;
            const totalCount = meta.testResults.length;
            if (testBadge) {
              testBadge.style.display = 'inline-block';
              testBadge.textContent = \`\${passedCount}/\${totalCount}\`;
              testBadge.className = 'pill ' + (passedCount === totalCount ? 'status-2xx' : 'status-err');
            }

            meta.testResults.forEach(t => {
              const card = document.createElement('div');
              card.className = 'test-result-card ' + (t.passed ? 'passed' : 'failed');

              const header = document.createElement('div');
              header.className = 'test-result-header';

              const icon = document.createElement('span');
              icon.className = t.passed ? 'test-pass-icon' : 'test-fail-icon';
              icon.textContent = t.passed ? '✔' : '✖';

              const title = document.createElement('span');
              title.textContent = t.name;

              header.appendChild(icon);
              header.appendChild(title);
              card.appendChild(header);

              if (!t.passed && t.error) {
                const errDiv = document.createElement('div');
                errDiv.className = 'test-error-msg';
                errDiv.textContent = t.error;
                card.appendChild(errDiv);
              }

              testsContainer.appendChild(card);
            });
          } else {
            if (testBadge) testBadge.style.display = 'none';
            testsContainer.innerHTML = '<div style="color: var(--muted); font-size:12px;">No tests executed for this request. Add assertions in the <strong>Scripts &rarr; Post-Response Script</strong> tab using <code>bb.test(...)</code>.</div>';
          }
        }

        // Render console logs
        const consoleBadge = document.getElementById('resp-console-count');
        const consoleContainer = document.getElementById('console-logs-container');
        if (consoleContainer) {
          consoleContainer.innerHTML = '';
          if (meta.consoleLogs && meta.consoleLogs.length > 0) {
            if (consoleBadge) {
              consoleBadge.style.display = 'inline-block';
              consoleBadge.textContent = \`(\${meta.consoleLogs.length})\`;
            }

            meta.consoleLogs.forEach(l => {
              const row = document.createElement('div');
              row.className = 'console-log-row';

              const timeSpan = document.createElement('span');
              timeSpan.className = 'console-time';
              timeSpan.textContent = new Date(l.timestamp).toLocaleTimeString([], { hour12: false });

              const badgeSpan = document.createElement('span');
              badgeSpan.className = 'console-badge ' + l.level;
              badgeSpan.textContent = l.level;

              const msgSpan = document.createElement('span');
              msgSpan.className = 'console-msg';
              msgSpan.textContent = l.message;

              row.appendChild(timeSpan);
              row.appendChild(badgeSpan);
              row.appendChild(msgSpan);
              consoleContainer.appendChild(row);
            });
          } else {
            if (consoleBadge) consoleBadge.style.display = 'none';
            consoleContainer.innerHTML = '<div style="color: var(--muted); font-size:12px;">No console logs. Use <code>console.log(...)</code> in pre-request or post-response scripts.</div>';
          }
        }
      }

      if (msg.type === 'saved') {
        currentRequestId = msg.id;
        if (msg.name && reqNameInput) {
          reqNameInput.value = msg.name;
          lastSavedName = msg.name;
          autoResizeInput(reqNameInput);
        }
        const statusPill = document.getElementById('resp-status');
        statusPill.textContent = 'Saved';
        statusPill.className = 'pill status-2xx';
        setTimeout(() => {
          if (statusPill.textContent === 'Saved') statusPill.textContent = 'Waiting';
        }, 2000);
      }

      if (msg.type === 'requestRenamed' && msg.name) {
        if (reqNameInput) {
          reqNameInput.value = msg.name;
          lastSavedName = msg.name;
          autoResizeInput(reqNameInput);
        }
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
        updateUrlPreview();
      }

      if (msg.type === 'preview') {
        const bodyPre = document.getElementById('resp-body-text');
        bodyPre.textContent = JSON.stringify(msg.preview, null, 2);
        const statusPill = document.getElementById('resp-status');
        statusPill.textContent = 'Preview';
        statusPill.className = 'pill status-3xx';
      }

      if (msg.type === 'activeEnvironmentChanged' && msg.envName) {
        const selectEnv = document.getElementById('select-env');
        if (selectEnv) {
          selectEnv.value = msg.envName;
          requestInheritedData();
        }
      }

      if (msg.type === 'activeProfileChanged' && (msg.profileId || msg.profileName)) {
        const selectProfile = document.getElementById('select-profile');
        if (selectProfile) {
          for (let i = 0; i < selectProfile.options.length; i++) {
            const opt = selectProfile.options[i];
            if ((msg.profileId && opt.dataset.id === msg.profileId) || (msg.profileName && opt.value === msg.profileName)) {
              selectProfile.selectedIndex = i;
              break;
            }
          }
          requestInheritedData();
        }
      }
    });
  </script>
</body>
</html>`;
}

