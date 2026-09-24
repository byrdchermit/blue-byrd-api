import * as fs from 'fs';
import * as path from 'path';
import { AuthSettings, BodyType, FormDataItem, RequestItem, ResponseMetadata, VariableItem } from '../types';
import { BlueByrdStateManager } from '../state/stateManager';
import { VariableService } from './variableService';
import { AuthService } from './authService';
import { BlueByrdHistoryPanel } from '../views/panels/historyPanel';

export class HttpService {
  private readonly stateManager: BlueByrdStateManager;
  private readonly variableService: VariableService;
  private readonly authService: AuthService;

  constructor(
    stateManager: BlueByrdStateManager,
    variableService: VariableService,
    authService: AuthService
  ) {
    this.stateManager = stateManager;
    this.variableService = variableService;
    this.authService = authService;
  }

  /**
   * Prepares and executes an HTTP request, recording history on completion.
   */
  public async executeRequest(params: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    bodyType?: BodyType;
    bodyFormData?: FormDataItem[];
    profile?: string;
    profileId?: string;
    environment?: string;
    collection?: string;
    folder?: string;
    requestName?: string;
    requestId?: string;
    auth?: AuthSettings;
    variables?: VariableItem[];
  }): Promise<ResponseMetadata> {
    const method = (params.method || 'GET').toUpperCase();
    const rawUrl = params.url || '';

    // 1. Resolve combined variables
    const variables = this.variableService.resolveVariables(
      params.profileId || params.profile,
      params.environment,
      params.collection,
      params.folder,
      params.variables
    );

    // 2. Resolve hierarchical headers (Parent Env -> Env -> Col -> Folder -> Request)
    const hierarchicalHeaders = this.variableService.resolveHeaders(
      params.environment,
      params.collection,
      params.folder,
      params.headers || {}
    );

    // 3. Resolve Auth headers
    const authHeaders = this.authService.resolveAuthHeaders(
      params.profileId || params.profile,
      params.environment,
      params.collection,
      params.folder,
      hierarchicalHeaders,
      params.auth
    );

    // 3. Interpolate variables into URL, headers, and body
    const interpolated = this.variableService.interpolateRequest(
      {
        url: rawUrl,
        headers: authHeaders,
        body: params.body,
      },
      variables
    );

    const finalUrl = interpolated.url.trim();

    if (!finalUrl) {
      throw new Error('URL is required to send a request.');
    }

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      throw new Error(`Invalid URL scheme: "${finalUrl}". Only HTTP and HTTPS protocols are supported.`);
    }

    // Build fetch RequestInit
    const requestHeaders = new Headers();
    Object.entries(interpolated.headers).forEach(([k, v]) => {
      if (k) requestHeaders.set(k, v);
    });

    // Timeout guard (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('Request timed out after 30 seconds.'));
    }, 30000);

    const init: RequestInit = {
      method,
      headers: requestHeaders,
      signal: controller.signal,
    };

    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (hasBody) {
      if (params.bodyType === 'form-data' && Array.isArray(params.bodyFormData)) {
        if (typeof FormData !== 'undefined') {
          const fd = new FormData();
          for (const item of params.bodyFormData) {
            if (item.enabled && item.key) {
              const k = this.variableService.interpolate(item.key, variables);
              const v = this.variableService.interpolate(item.value || '', variables);

              if (item.type === 'file') {
                let resolvedFilePath = v.trim();
                if (resolvedFilePath) {
                  if (!path.isAbsolute(resolvedFilePath)) {
                    let baseDir = process.cwd();
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-var-requires
                      const vscode = require('vscode');
                      if (vscode.workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                        baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                      }
                    } catch {
                      // Running outside VS Code (test suite)
                    }
                    const candidate = path.resolve(baseDir, resolvedFilePath);
                    if (fs.existsSync(candidate)) {
                      resolvedFilePath = candidate;
                    }
                  }

                  if (fs.existsSync(resolvedFilePath)) {
                    const fileBytes = fs.readFileSync(resolvedFilePath);
                    const fileName = path.basename(resolvedFilePath);
                    const blob = new Blob([fileBytes]);
                    fd.append(k, blob, fileName);
                  } else {
                    throw new Error(`File not found for form-data field "${k}": ${v}`);
                  }
                }
              } else {
                fd.append(k, v);
              }
            }
          }
          init.body = fd;
          requestHeaders.delete('content-type');
        } else if (interpolated.body) {
          init.body = interpolated.body;
        }
      } else if (params.bodyType === 'none') {
        // Explicitly no body
      } else if (interpolated.body) {
        init.body = interpolated.body;
      }
    }

    const startTime = performance.now();
    const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB limit

    try {
      const response = await fetch(finalUrl, init);
      const elapsedMs = Math.round(performance.now() - startTime);

      // Inspect Content-Length header if present
      const declaredLen = Number(response.headers.get('content-length') || 0);
      if (declaredLen > MAX_RESPONSE_BYTES) {
        throw new Error(`Response payload (${(declaredLen / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum 10 MB limit.`);
      }

      let responseText = await response.text();
      let sizeBytes = new TextEncoder().encode(responseText).length;

      if (sizeBytes > MAX_RESPONSE_BYTES) {
        responseText = responseText.substring(0, MAX_RESPONSE_BYTES) + '\n\n... [Response truncated: exceeded 10 MB limit]';
        sizeBytes = MAX_RESPONSE_BYTES;
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      const metadata: ResponseMetadata = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        sizeBytes,
        headers: responseHeaders,
        body: responseText,
      };

      // Record in history without touching collections
      const historyItem: RequestItem = {
        id: params.requestId || `req-hist-${Date.now()}`,
        name: params.requestName || `${method} ${finalUrl}`,
        method,
        url: rawUrl,
        headers: params.headers || {},
        body: params.body || '',
        bodyType: params.bodyType,
        bodyFormData: params.bodyFormData,
        collection: params.collection || 'Demo Collection',
        folder: params.folder,
        profile: params.profile,
        environment: params.environment,
        auth: params.auth,
        variables: params.variables,
      };

      const recorded = this.stateManager.recordHistory(historyItem, {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        sizeBytes,
        headers: responseHeaders,
        body: responseText,
        resolvedUrl: finalUrl,
      });

      // Live notification to open History Inspector
      BlueByrdHistoryPanel.notifyNewHistory(recorded);

      return metadata;
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : String(err);

      const metadata: ResponseMetadata = {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        elapsedMs,
        sizeBytes: 0,
        headers: {},
        body: errorMsg,
      };

      // Record network error attempts in history
      const historyItem: RequestItem = {
        id: params.requestId || `req-hist-${Date.now()}`,
        name: params.requestName || `${method} ${finalUrl}`,
        method,
        url: rawUrl,
        headers: params.headers || {},
        body: params.body || '',
        bodyType: params.bodyType,
        bodyFormData: params.bodyFormData,
        collection: params.collection || 'Demo Collection',
        folder: params.folder,
        profile: params.profile,
        environment: params.environment,
        auth: params.auth,
        variables: params.variables,
      };

      const recorded = this.stateManager.recordHistory(historyItem, {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        elapsedMs,
        sizeBytes: 0,
        headers: {},
        body: errorMsg,
        resolvedUrl: finalUrl,
      });

      BlueByrdHistoryPanel.notifyNewHistory(recorded);

      return metadata;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

