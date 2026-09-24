import * as vscode from 'vscode';
import { RequestContext, RequestItem } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { HttpService } from '../../services/httpService';
import { VariableService } from '../../services/variableService';
import { AuthService } from '../../services/authService';
import { getRequestPanelHtml } from './requestPanelHtml';

export class BlueByrdPanel {
  public static currentPanel: BlueByrdPanel | undefined;
  private static readonly panels = new Map<string, BlueByrdPanel>();
  public static readonly viewType = 'blueByrdApiClient';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly stateManager: BlueByrdStateManager;
  private readonly httpService: HttpService;
  private readonly variableService: VariableService;
  private readonly authService: AuthService;
  private readonly panelKey: string;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    initialContext: RequestContext | undefined,
    stateManager: BlueByrdStateManager,
    httpService: HttpService,
    variableService: VariableService,
    authService: AuthService
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Use stable request ID if available, or generate a unique session key for new requests
    const requestId = initialContext?.requestId || initialContext?.id;
    const panelKey = requestId || `new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // If panel is already open for this request, reveal it
    if (requestId && this.panels.has(requestId)) {
      const existing = this.panels.get(requestId)!;
      existing.panel.reveal(column);
      return;
    }

    const title = initialContext?.requestName || (initialContext?.method && initialContext?.url ? `${initialContext.method} ${initialContext.url}` : 'New Request');

    const panel = vscode.window.createWebviewPanel(
      BlueByrdPanel.viewType,
      title,
      { viewColumn: column || vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    const instance = new BlueByrdPanel(
      panel,
      extensionUri,
      initialContext || {},
      stateManager,
      httpService,
      variableService,
      authService,
      panelKey
    );

    this.panels.set(panelKey, instance);
    this.currentPanel = instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    initialContext: RequestContext,
    stateManager: BlueByrdStateManager,
    httpService: HttpService,
    variableService: VariableService,
    authService: AuthService,
    panelKey: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.stateManager = stateManager;
    this.httpService = httpService;
    this.variableService = variableService;
    this.authService = authService;
    this.panelKey = panelKey;

    // Pre-calculate initial inherited variables and headers for inspector
    const initialEnv = initialContext?.environment;
    const initialCol = initialContext?.collection;
    const initialFolder = initialContext?.folder;
    const initialVars = initialContext?.variables || [];
    const initialHeaders = initialContext?.headers || {};

    const varDetails = this.variableService.resolveVariablesDetailed(
      initialContext?.profileId || initialContext?.profile,
      initialEnv,
      initialCol,
      initialFolder,
      initialVars
    );
    const headerDetails = this.variableService.resolveHeadersDetailed(
      initialEnv,
      initialCol,
      initialFolder,
      initialHeaders
    );

    // Set HTML content
    this.panel.webview.html = getRequestPanelHtml(
      initialContext,
      this.stateManager.getState(),
      varDetails.inherited,
      headerDetails.inherited
    );

    // Listen for disposal
    this.panel.onDidDispose(
      () => {
        if (BlueByrdPanel.currentPanel === this) {
          BlueByrdPanel.currentPanel = undefined;
        }
        BlueByrdPanel.panels.delete(this.panelKey);
        while (this.disposables.length) {
          const d = this.disposables.pop();
          if (d) d.dispose();
        }
      },
      null,
      this.disposables
    );

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          if (message.type === 'sendRequest') {
            const payload = message.payload;
            const meta = await this.httpService.executeRequest(payload);
            this.panel.webview.postMessage({ type: 'requestResult', meta });
            // Refresh explorer so history node updates
            vscode.commands.executeCommand('blueByrdApiClient.refreshExplorer');
          } else if (message.type === 'saveRequest') {
            const payload = message.payload;
            const savedItem: RequestItem = {
              id: payload.requestId || `req-${Date.now()}`,
              name: payload.requestName || (payload.url ? `${payload.method} ${payload.url}` : 'Saved Request'),
              method: payload.method || 'GET',
              url: payload.url || '',
              folder: payload.folder,
              collection: payload.collection || 'Demo Collection',
              headers: payload.headers || {},
              body: payload.body || '',
              bodyType: payload.bodyType,
              bodyFormData: payload.bodyFormData,
              profile: payload.profile,
              environment: payload.environment,
              auth: payload.auth,
              notes: payload.notes,
              variables: payload.variables,
            };

            const saved = this.stateManager.saveRequest(savedItem, payload.collection, payload.folder);

            // Update panel title
            this.panel.title = saved.name;
            this.panel.webview.postMessage({ type: 'saved', id: saved.id });

            vscode.window.showInformationMessage(`Request '${saved.name}' saved.`);
            vscode.commands.executeCommand('blueByrdApiClient.refreshExplorer');
          } else if (message.type === 'getInherited') {
            const payload = message.payload;
            const varDetails = this.variableService.resolveVariablesDetailed(
              payload.profileId || payload.profile,
              payload.environment,
              payload.collection,
              payload.folder,
              payload.variables
            );
            const headerDetails = this.variableService.resolveHeadersDetailed(
              payload.environment,
              payload.collection,
              payload.folder,
              payload.headers || {}
            );
            this.panel.webview.postMessage({
              type: 'updateInherited',
              inheritedVars: varDetails.inherited,
              inheritedHeaders: headerDetails.inherited,
            });
          } else if (message.type === 'previewRequest') {
            const payload = message.payload;
            const vars = this.variableService.resolveVariables(
              payload.profileId || payload.profile,
              payload.environment,
              payload.collection,
              payload.folder,
              payload.variables
            );
            const hierarchicalHeaders = this.variableService.resolveHeaders(
              payload.environment,
              payload.collection,
              payload.folder,
              payload.headers || {}
            );
            const authHeaders = this.authService.resolveAuthHeaders(
              payload.profileId || payload.profile,
              payload.environment,
              payload.collection,
              payload.folder,
              hierarchicalHeaders,
              payload.auth
            );
            const interpolated = this.variableService.interpolateRequest(
              {
                url: payload.url,
                headers: authHeaders,
                body: payload.body,
              },
              vars
            );

            this.panel.webview.postMessage({
              type: 'preview',
              preview: {
                resolvedUrl: interpolated.url,
                method: payload.method,
                resolvedHeaders: interpolated.headers,
                resolvedBody: interpolated.body,
                availableVariables: vars,
              },
            });
          } else if (message.type === 'copyCurl') {
            const payload = message.payload;
            const vars = this.variableService.resolveVariables(
              payload.profileId || payload.profile,
              payload.environment,
              payload.collection,
              payload.folder,
              payload.variables
            );
            const hierarchicalHeaders = this.variableService.resolveHeaders(
              payload.environment,
              payload.collection,
              payload.folder,
              payload.headers || {}
            );
            const authHeaders = this.authService.resolveAuthHeaders(
              payload.profileId || payload.profile,
              payload.environment,
              payload.collection,
              payload.folder,
              hierarchicalHeaders,
              payload.auth
            );
            const interpolated = this.variableService.interpolateRequest(
              {
                url: payload.url,
                headers: authHeaders,
                body: payload.body,
              },
              vars
            );

            let curl = `curl -X ${payload.method || 'GET'} "${interpolated.url}"`;
            Object.entries(interpolated.headers).forEach(([k, v]) => {
              curl += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
            });
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(payload.method)) {
              if (payload.bodyType === 'form-data' && Array.isArray(payload.bodyFormData)) {
                payload.bodyFormData.forEach((item: { key: string; value: string; enabled: boolean; type?: string }) => {
                  if (item.enabled && item.key) {
                    if (item.type === 'file') {
                      curl += ` -F "${item.key}=@${(item.value || '').replace(/"/g, '\\"')}"`;
                    } else {
                      curl += ` -F "${item.key}=${(item.value || '').replace(/"/g, '\\"')}"`;
                    }
                  }
                });
              } else if (interpolated.body) {
                curl += ` -d '${interpolated.body.replace(/'/g, "'\\''")}'`;
              }
            }

            await vscode.env.clipboard.writeText(curl);
            vscode.window.showInformationMessage('cURL command copied to clipboard!');
          } else if (message.type === 'selectFile') {
            const uris = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              openLabel: 'Select File for Form Data',
            });
            if (uris && uris.length > 0) {
              this.panel.webview.postMessage({
                type: 'fileSelected',
                rowId: message.rowId,
                filePath: uris[0].fsPath,
              });
            }
          }
        } catch (err) {
          console.error('[bluebyrd] Error handling webview message:', err);
          vscode.window.showErrorMessage(`Request panel error: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      null,
      this.disposables
    );
  }
}

