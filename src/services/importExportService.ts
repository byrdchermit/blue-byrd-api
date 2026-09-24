import * as crypto from 'crypto';
import {
  AppState,
  AuthSettings,
  BodyType,
  Collection,
  CollectionFolder,
  EnvironmentConfig,
  FormDataItem,
  Profile,
  ProfileAuth,
  RequestItem,
} from '../types';

export type ParsedImportResult =
  | { type: 'postman-collection'; collection: Collection }
  | { type: 'postman-environment'; environmentName: string; environment: EnvironmentConfig }
  | { type: 'openapi'; collection: Collection }
  | { type: 'bluebyrd-collection'; collection: Collection }
  | { type: 'bluebyrd-environment'; environmentName: string; environment: EnvironmentConfig }
  | { type: 'bluebyrd-backup'; state: AppState };

export class ImportExportService {
  private static generateId(prefix: string): string {
    const rand = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${Date.now()}-${rand}`;
  }

  // ==========================================
  // Public Parsing & Import Detection
  // ==========================================

  public static parse(jsonStr: string): ParsedImportResult {
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch (err: any) {
      throw new Error(`Invalid JSON file: ${err?.message || 'JSON parse error'}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid input: Expected a JSON object.');
    }

    // 1. Native bluebyrd backup
    if (this.isBlueByrdBackup(data)) {
      return {
        type: 'bluebyrd-backup',
        state: this.parseBlueByrdBackup(data),
      };
    }

    // 2. Native bluebyrd single collection
    if (this.isBlueByrdCollection(data)) {
      return {
        type: 'bluebyrd-collection',
        collection: this.parseBlueByrdCollection(data),
      };
    }

    // 3. Native bluebyrd single environment
    if (this.isBlueByrdEnvironment(data)) {
      const { name, env } = this.parseBlueByrdEnvironment(data);
      return {
        type: 'bluebyrd-environment',
        environmentName: name,
        environment: env,
      };
    }

    // 4. Postman Collection v2 / v2.1
    if (this.isPostmanCollection(data)) {
      return {
        type: 'postman-collection',
        collection: this.parsePostmanCollection(data),
      };
    }

    // 5. Postman Environment
    if (this.isPostmanEnvironment(data)) {
      const { name, env } = this.parsePostmanEnvironment(data);
      return {
        type: 'postman-environment',
        environmentName: name,
        environment: env,
      };
    }

    // 6. OpenAPI 3.0 or Swagger 2.0
    if (this.isOpenApi(data)) {
      return {
        type: 'openapi',
        collection: this.parseOpenApi(data),
      };
    }

    throw new Error(
      'Unrecognized format: Expected a Postman Collection (v2/v2.1), Postman Environment, OpenAPI/Swagger document, or bluebyrd JSON backup.'
    );
  }

  // ==========================================
  // Format Detectors
  // ==========================================

  private static isBlueByrdBackup(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (data.bluebyrdBackupVersion !== undefined) return true;
    if (
      Array.isArray(data.collections) &&
      (Array.isArray(data.environments) || (data.environments && typeof data.environments === 'object'))
    ) {
      return true;
    }
    return false;
  }

  private static isBlueByrdCollection(data: any): boolean {
    if (data.kind === 'bluebyrd.collection') return true;
    return (
      typeof data.name === 'string' &&
      !data.info &&
      (Array.isArray(data.folders) || Array.isArray(data.requests))
    );
  }

  private static isBlueByrdEnvironment(data: any): boolean {
    if (data.kind === 'bluebyrd.environment') return true;
    if (data.info || data.openapi || data.swagger) return false;
    if (Array.isArray(data.collections)) return false;
    return (
      (typeof data.name === 'string' || typeof data.baseUrl === 'string') &&
      ((data.variables !== undefined && typeof data.variables === 'object') || Array.isArray(data.variables)) &&
      !data.values
    );
  }

  private static isPostmanCollection(data: any): boolean {
    return Boolean(
      data.info &&
        typeof data.info === 'object' &&
        (Array.isArray(data.item) ||
          data.info._postman_id ||
          (typeof data.info.schema === 'string' && data.info.schema.includes('postman')))
    );
  }

  private static isPostmanEnvironment(data: any): boolean {
    return Boolean(
      typeof data.name === 'string' &&
        Array.isArray(data.values) &&
        (data._postman_variable_scope === 'environment' ||
          data.values.length === 0 ||
          data.values.some((v: any) => v && typeof v === 'object' && 'key' in v))
    );
  }

  private static isOpenApi(data: any): boolean {
    return Boolean(data.openapi || data.swagger || (data.info && data.paths));
  }

  // ==========================================
  // Postman Collection Parser
  // ==========================================

  private static parsePostmanAuth(authObj: any): ProfileAuth {
    if (!authObj || authObj.type === 'noauth') {
      return { type: 'none' };
    }

    const findVal = (arr: any[], key: string): string => {
      const match = (arr || []).find((x: any) => x?.key === key);
      return match ? String(match.value ?? '') : '';
    };

    const type = authObj.type;
    if (type === 'bearer') {
      return {
        type: 'bearer',
        token: findVal(authObj.bearer, 'token'),
        headerName: 'Authorization',
        headerPrefix: 'Bearer',
      };
    }

    if (type === 'basic') {
      return {
        type: 'basic',
        username: findVal(authObj.basic, 'username'),
        password: findVal(authObj.basic, 'password'),
      };
    }

    if (type === 'apikey') {
      const keyName = findVal(authObj.apikey, 'key');
      const token = findVal(authObj.apikey, 'value');
      const addToRaw = findVal(authObj.apikey, 'in') || 'header';
      return {
        type: 'apiKey',
        keyName: keyName || 'X-API-Key',
        headerName: keyName || 'X-API-Key',
        token,
        addTo: addToRaw === 'query' ? 'query' : 'header',
      };
    }

    if (type === 'oauth2') {
      return {
        type: 'oauth2',
        grantType: (findVal(authObj.oauth2, 'grant_type') as any) || 'client_credentials',
        clientId: findVal(authObj.oauth2, 'clientId'),
        clientSecret: findVal(authObj.oauth2, 'clientSecret'),
        authorizationUrl: findVal(authObj.oauth2, 'authUrl'),
        tokenUrl: findVal(authObj.oauth2, 'accessTokenUrl'),
        scopes: findVal(authObj.oauth2, 'scope')
          ? findVal(authObj.oauth2, 'scope').split(/[\s,]+/).filter(Boolean)
          : [],
        headerPrefix: 'Bearer',
      };
    }

    return { type: 'none' };
  }

  private static parsePostmanUrl(urlInput: any): string {
    if (!urlInput) return '';
    if (typeof urlInput === 'string') {
      return urlInput.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, '{{$1}}');
    }

    let raw = urlInput.raw || '';
    if (!raw && Array.isArray(urlInput.host)) {
      const protocol = urlInput.protocol ? `${urlInput.protocol}://` : 'https://';
      const host = urlInput.host.join('.');
      const pathPart = Array.isArray(urlInput.path) ? '/' + urlInput.path.join('/') : '';
      raw = `${protocol}${host}${pathPart}`;
      if (Array.isArray(urlInput.query) && urlInput.query.length > 0) {
        const queryParams = urlInput.query
          .filter((q: any) => !q.disabled && q.key)
          .map((q: any) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value ?? '')}`)
          .join('&');
        if (queryParams) {
          raw += `?${queryParams}`;
        }
      }
    }

    // Convert :param syntax into {{param}}
    return raw.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, '{{$1}}');
  }

  private static parsePostmanItem(
    item: any,
    collectionName: string,
    collectionId: string,
    folderName?: string,
    folderId?: string
  ): RequestItem {
    const req = item.request || {};
    const url = this.parsePostmanUrl(req.url);
    const method = (req.method || 'GET').toUpperCase();

    // Extract headers
    const headers: Record<string, string> = {};
    if (Array.isArray(req.header)) {
      for (const h of req.header) {
        if (!h.disabled && h.key) {
          headers[h.key] = h.value ?? '';
        }
      }
    }

    // Extract body
    let body = '';
    let bodyType: BodyType = 'none';
    const bodyFormData: FormDataItem[] = [];

    if (req.body) {
      const mode = req.body.mode;
      if (mode === 'raw') {
        body = req.body.raw || '';
        const lang = req.body.options?.raw?.language;
        if (lang === 'json' || body.trim().startsWith('{') || body.trim().startsWith('[')) {
          bodyType = 'json';
        } else if (lang === 'xml' || body.trim().startsWith('<')) {
          bodyType = 'xml';
        } else {
          bodyType = 'text';
        }
      } else if (mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) {
        bodyType = 'form-urlencoded';
        body = req.body.urlencoded
          .filter((u: any) => !u.disabled && u.key)
          .map((u: any) => `${encodeURIComponent(u.key)}=${encodeURIComponent(u.value ?? '')}`)
          .join('&');
      } else if (mode === 'formdata' && Array.isArray(req.body.formdata)) {
        bodyType = 'form-data';
        for (const fd of req.body.formdata) {
          if (fd.key) {
            bodyFormData.push({
              key: fd.key,
              value: fd.type === 'file' ? (fd.src || '') : (fd.value ?? ''),
              enabled: !fd.disabled,
              type: fd.type === 'file' ? 'file' : 'text',
            });
          }
        }
      }
    }

    // Extract auth
    let auth: AuthSettings | undefined;
    if (req.auth) {
      if (req.auth.type === 'noauth') {
        auth = { auth: { type: 'none' } };
      } else {
        auth = { auth: this.parsePostmanAuth(req.auth) };
      }
    }

    // Extract notes
    const notes = typeof req.description === 'string'
      ? req.description
      : req.description?.content || '';

    return {
      id: this.generateId('req'),
      name: item.name || 'Untitled Request',
      method,
      url,
      headers,
      body,
      bodyType,
      bodyFormData: bodyFormData.length > 0 ? bodyFormData : undefined,
      collection: collectionName,
      collectionId,
      folder: folderName,
      folderId,
      auth,
      notes,
    };
  }

  private static parsePostmanCollection(data: any): Collection {
    const colId = this.generateId('col');
    const colName = data.info?.name || 'Imported Postman Collection';
    const notes = typeof data.info?.description === 'string'
      ? data.info.description
      : data.info?.description?.content || '';

    // Variables
    const variables: Record<string, string> = {};
    if (Array.isArray(data.variable)) {
      for (const v of data.variable) {
        if (!v.disabled && v.key) {
          variables[v.key] = String(v.value ?? '');
        }
      }
    }

    // Auth
    let auth: AuthSettings | undefined;
    if (data.auth) {
      auth = { auth: this.parsePostmanAuth(data.auth) };
    }

    const folders: CollectionFolder[] = [];
    const rootRequests: RequestItem[] = [];

    // Helper to traverse postman items (which can contain nested sub-items)
    const traverse = (items: any[], currentFolderName?: string, currentFolderId?: string) => {
      for (const item of items) {
        if (Array.isArray(item.item)) {
          // It's a folder
          const subFolderName = currentFolderName ? `${currentFolderName} / ${item.name}` : (item.name || 'Folder');
          const subFolderId = this.generateId('folder');
          const folderRequests: RequestItem[] = [];

          // Collect direct requests inside this folder
          for (const sub of item.item) {
            if (!Array.isArray(sub.item) && sub.request) {
              folderRequests.push(
                this.parsePostmanItem(sub, colName, colId, subFolderName, subFolderId)
              );
            }
          }

          folders.push({
            id: subFolderId,
            name: subFolderName,
            requests: folderRequests,
          });

          // Check if there are deeper subfolders
          const nestedFolders = item.item.filter((sub: any) => Array.isArray(sub.item));
          if (nestedFolders.length > 0) {
            traverse(nestedFolders, subFolderName, subFolderId);
          }
        } else if (item.request) {
          // Root request
          rootRequests.push(
            this.parsePostmanItem(item, colName, colId, undefined, undefined)
          );
        }
      }
    };

    traverse(data.item || []);

    return {
      id: colId,
      name: colName,
      folders,
      requests: rootRequests,
      variables,
      auth,
      notes,
    };
  }

  // ==========================================
  // Postman Environment Parser
  // ==========================================

  private static parsePostmanEnvironment(data: any): { name: string; env: EnvironmentConfig } {
    const name = data.name || 'Imported Environment';
    const envId = this.generateId('env');
    const variables: Record<string, string> = {};
    let baseUrl = 'https://api.example.com';

    if (Array.isArray(data.values)) {
      for (const v of data.values) {
        if (!v || v.enabled === false || !v.key) continue;
        const val = String(v.value ?? '');
        variables[v.key] = val;
        const lowerKey = v.key.toLowerCase();
        if (lowerKey === 'baseurl' || lowerKey === 'base_url' || lowerKey === 'url' || lowerKey === 'host') {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            baseUrl = val;
          }
        }
      }
    }

    const env: EnvironmentConfig = {
      id: envId,
      baseUrl,
      variables,
      headers: {},
      notes: `Imported from Postman Environment '${name}'`,
    };

    return { name, env };
  }

  // ==========================================
  // OpenAPI 3.0 / Swagger 2.0 Parser
  // ==========================================

  private static generateSchemaExample(schema: any, depth = 0): any {
    if (depth > 4 || !schema || typeof schema !== 'object') return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    if (schema.type === 'string') {
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'email') return 'user@example.com';
      return 'string';
    }
    if (schema.type === 'integer' || schema.type === 'number') {
      return 0;
    }
    if (schema.type === 'boolean') {
      return true;
    }
    if (schema.type === 'array') {
      const itemEx = this.generateSchemaExample(schema.items, depth + 1);
      return itemEx !== null ? [itemEx] : [];
    }
    if (schema.type === 'object' || schema.properties) {
      const result: Record<string, any> = {};
      const props = schema.properties || {};
      for (const [k, v] of Object.entries(props)) {
        result[k] = this.generateSchemaExample(v, depth + 1);
      }
      return result;
    }
    return null;
  }

  private static parseOpenApi(data: any): Collection {
    const colId = this.generateId('col');
    const title = data.info?.title || 'OpenAPI Specification';
    const version = data.info?.version ? `v${data.info.version}` : '';
    const colName = `${title} ${version}`.trim();
    const notes = data.info?.description || '';

    // Extract Base URL
    let baseUrl = 'https://api.example.com';
    if (Array.isArray(data.servers) && data.servers[0]?.url) {
      baseUrl = data.servers[0].url.replace(/\/$/, '');
    } else if (data.host) {
      const scheme = Array.isArray(data.schemes) && data.schemes[0] ? data.schemes[0] : 'https';
      const basePath = data.basePath ? data.basePath.replace(/\/$/, '') : '';
      baseUrl = `${scheme}://${data.host}${basePath}`;
    }

    const tagFolders = new Map<string, RequestItem[]>();
    const rootRequests: RequestItem[] = [];
    const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    for (const [pathKey, pathItem] of Object.entries(data.paths || {})) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const pathParams = Array.isArray((pathItem as any).parameters)
        ? (pathItem as any).parameters
        : [];

      for (const method of HTTP_METHODS) {
        const op = (pathItem as any)[method];
        if (!op || typeof op !== 'object') continue;

        const allParams = [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
        const headers: Record<string, string> = {};
        const queryParts: string[] = [];

        for (const param of allParams) {
          if (!param || !param.name) continue;
          const val = param.example !== undefined
            ? String(param.example)
            : param.schema?.example !== undefined
            ? String(param.schema.example)
            : '';

          if (param.in === 'header') {
            headers[param.name] = val;
          } else if (param.in === 'query') {
            queryParts.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(val)}`);
          }
        }

        // Convert {param} to {{param}}
        let convertedPath = pathKey.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, '{{$1}}');
        if (queryParts.length > 0) {
          convertedPath += `?${queryParts.join('&')}`;
        }

        const fullUrl = `{{baseUrl}}${convertedPath}`;
        let body = '';
        let bodyType: BodyType = 'none';

        // Check OpenAPI 3 requestBody
        const rb = op.requestBody;
        if (rb?.content?.['application/json']) {
          bodyType = 'json';
          const ex = rb.content['application/json'].example ??
            this.generateSchemaExample(rb.content['application/json'].schema);
          body = ex !== null ? JSON.stringify(ex, null, 2) : '{}';
          headers['Content-Type'] = 'application/json';
        } else {
          // Check Swagger 2 body parameter
          const bodyParam = allParams.find((p: any) => p?.in === 'body');
          if (bodyParam) {
            bodyType = 'json';
            const ex = bodyParam.schema ? this.generateSchemaExample(bodyParam.schema) : null;
            body = ex !== null ? JSON.stringify(ex, null, 2) : '{}';
            headers['Content-Type'] = 'application/json';
          }
        }

        const reqName = op.summary || `${method.toUpperCase()} ${pathKey}`;
        const tag = Array.isArray(op.tags) && op.tags.length > 0 ? op.tags[0] : undefined;

        const reqItem: RequestItem = {
          id: this.generateId('req'),
          name: reqName,
          method: method.toUpperCase(),
          url: fullUrl,
          headers,
          body,
          bodyType,
          collection: colName,
          collectionId: colId,
          folder: tag,
          notes: op.description || op.summary || '',
        };

        if (tag) {
          if (!tagFolders.has(tag)) {
            tagFolders.set(tag, []);
          }
          tagFolders.get(tag)!.push(reqItem);
        } else {
          rootRequests.push(reqItem);
        }
      }
    }

    const folders: CollectionFolder[] = [];
    for (const [folderName, requests] of tagFolders.entries()) {
      const folderId = this.generateId('folder');
      requests.forEach((r) => {
        r.folderId = folderId;
      });
      folders.push({
        id: folderId,
        name: folderName,
        requests,
      });
    }

    return {
      id: colId,
      name: colName,
      folders,
      requests: rootRequests,
      variables: {
        baseUrl,
      },
      notes,
    };
  }

  // ==========================================
  // Normalization Helpers for Universal Compatibility
  // ==========================================

  private static normalizeHeaders(headers: any): Record<string, string> {
    const res: Record<string, string> = {};
    if (Array.isArray(headers)) {
      headers.forEach((h: any) => {
        if (h && h.enabled !== false && h.key) {
          res[h.key] = String(h.value ?? '');
        }
      });
      return res;
    }
    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          res[k] = String(v);
        }
      });
      return res;
    }
    return res;
  }

  private static normalizeVariables(variables: any): Record<string, string> {
    const res: Record<string, string> = {};
    if (Array.isArray(variables)) {
      variables.forEach((v: any) => {
        if (v && v.enabled !== false && v.key) {
          res[v.key] = String(v.value ?? '');
        }
      });
      return res;
    }
    if (variables && typeof variables === 'object') {
      Object.entries(variables).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          res[k] = String(v);
        }
      });
      return res;
    }
    return res;
  }

  private static normalizeAuthHelper(authObj: any): ProfileAuth {
    if (!authObj || authObj.type === 'none' || authObj.type === 'noauth' || authObj.type === 'inherit') {
      return { type: 'none' };
    }
    const cfg = authObj.config || authObj;
    if (authObj.type === 'oauth2') {
      let scopes: string[] = [];
      if (cfg.scope) {
        scopes = Array.isArray(cfg.scope) ? cfg.scope : String(cfg.scope).split(/[\s,]+/).filter(Boolean);
      } else if (cfg.scopes) {
        scopes = Array.isArray(cfg.scopes) ? cfg.scopes : String(cfg.scopes).split(/[\s,]+/).filter(Boolean);
      }
      return {
        type: 'oauth2',
        grantType: (cfg.grantType as any) || 'client_credentials',
        tokenUrl: cfg.tokenUrl || '',
        authorizationUrl: cfg.authUrl || cfg.authorizationUrl || '',
        clientId: cfg.clientId || '',
        clientSecret: cfg.clientSecret || '',
        scopes,
        headerPrefix: cfg.headerPrefix || 'Bearer',
      };
    }
    if (authObj.type === 'bearer') {
      return {
        type: 'bearer',
        token: cfg.token || '',
        headerName: cfg.headerName || 'Authorization',
        headerPrefix: cfg.headerPrefix || 'Bearer',
      };
    }
    if (authObj.type === 'basic') {
      return {
        type: 'basic',
        username: cfg.username || '',
        password: cfg.password || '',
      };
    }
    if (authObj.type === 'apikey' || authObj.type === 'apiKey') {
      return {
        type: 'apiKey',
        keyName: cfg.key || cfg.keyName || 'X-API-Key',
        token: cfg.value || cfg.token || '',
        addTo: cfg.addTo === 'query' ? 'query' : 'header',
      };
    }
    return { type: 'none' };
  }

  private static normalizeBodyTypeHelper(bodyType: any): BodyType {
    if (bodyType === 'raw-json' || bodyType === 'json') return 'json';
    if (bodyType === 'raw-text' || bodyType === 'text') return 'text';
    if (bodyType === 'urlencoded' || bodyType === 'form-urlencoded') return 'form-urlencoded';
    if (bodyType === 'formdata' || bodyType === 'form-data') return 'form-data';
    if (bodyType === 'xml') return 'xml';
    return 'none';
  }

  private static normalizeRequestHelper(
    r: any,
    collectionName: string,
    collectionId: string,
    folderName?: string,
    folderId?: string
  ): RequestItem {
    const bodyType = this.normalizeBodyTypeHelper(r.bodyType);
    let body = r.body !== undefined ? r.body : (r.bodyRaw || '');
    const bodyFormData: FormDataItem[] = [];

    if (bodyType === 'form-urlencoded' && !body && Array.isArray(r.bodyUrlencoded)) {
      body = r.bodyUrlencoded
        .filter((u: any) => u.enabled !== false && u.key)
        .map((u: any) => `${encodeURIComponent(u.key)}=${encodeURIComponent(u.value || '')}`)
        .join('&');
    } else if (bodyType === 'form-data' && Array.isArray(r.bodyFormData)) {
      for (const fd of r.bodyFormData) {
        if (fd && fd.key) {
          bodyFormData.push({
            key: fd.key,
            value: fd.type === 'file' ? (fd.src || '') : (fd.value ?? ''),
            enabled: fd.enabled !== false,
            type: fd.type === 'file' ? 'file' : 'text',
          });
        }
      }
    }

    let auth: AuthSettings | undefined;
    if (r.auth) {
      if (r.auth.type === 'inherit') {
        auth = { inheritFromCollection: true };
      } else {
        auth = { auth: this.normalizeAuthHelper(r.auth) };
      }
    }

    let url = r.url || '';
    if (Array.isArray(r.queryParams) && r.queryParams.length > 0 && !url.includes('?')) {
      const qs = r.queryParams
        .filter((q: any) => q.enabled !== false && q.key)
        .map((q: any) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value ?? '')}`)
        .join('&');
      if (qs) {
        url += `?${qs}`;
      }
    }

    return {
      id: r.id || this.generateId('req'),
      name: r.name || 'Untitled Request',
      method: (r.method || 'GET').toUpperCase(),
      url,
      headers: this.normalizeHeaders(r.headers),
      body,
      bodyType,
      bodyFormData: bodyFormData.length > 0 ? bodyFormData : undefined,
      collection: collectionName,
      collectionId,
      folder: folderName,
      folderId,
      auth,
      notes: r.notes || r.description || '',
    };
  }

  private static normalizeCollectionHelper(c: any): Collection {
    const colId = c.id || this.generateId('col');
    const colName = c.name || 'Imported Collection';
    const colVars = this.normalizeVariables(c.variables);
    const colHeaders = this.normalizeHeaders(c.headers);
    const colAuth: AuthSettings | undefined = c.auth ? { auth: this.normalizeAuthHelper(c.auth) } : undefined;

    const folders: CollectionFolder[] = (c.folders || []).map((fold: any) => {
      const fId = fold.id || this.generateId('folder');
      const fName = fold.name || 'Folder';
      const fReqs: RequestItem[] = (fold.requests || []).map((r: any) =>
        this.normalizeRequestHelper(r, colName, colId, fName, fId)
      );
      return {
        id: fId,
        name: fName,
        requests: fReqs,
        headers: this.normalizeHeaders(fold.headers),
        variables: this.normalizeVariables(fold.variables),
        notes: fold.notes || '',
      };
    });

    const rootReqs: RequestItem[] = (c.requests || []).map((r: any) =>
      this.normalizeRequestHelper(r, colName, colId, undefined, undefined)
    );

    return {
      id: colId,
      name: colName,
      folders,
      requests: rootReqs,
      variables: colVars,
      headers: colHeaders,
      auth: colAuth,
      notes: c.notes || '',
    };
  }

  // ==========================================
  // Native bluebyrd & Profile Backup Parsers
  // ==========================================

  private static parseBlueByrdBackup(data: any): AppState {
    const collections: Collection[] = Array.isArray(data.collections)
      ? data.collections.map((c: any) => this.normalizeCollectionHelper(c))
      : [];

    const environments: Record<string, EnvironmentConfig> = {};
    if (Array.isArray(data.environments)) {
      data.environments.forEach((e: any) => {
        const v = this.normalizeVariables(e.variables);
        let baseUrl = e.baseUrl;
        if (!baseUrl) {
          const keys = ['url', 'app_host', 'baseurl', 'base_url', 'host'];
          for (const k of keys) {
            if (v[k] && (v[k].startsWith('http://') || v[k].startsWith('https://'))) {
              baseUrl = v[k];
              break;
            }
          }
        }
        const envName = e.name || 'Environment';
        environments[envName] = {
          id: e.id || this.generateId('env'),
          baseUrl: baseUrl || 'https://api.example.com',
          apiKey: e.apiKey || '',
          auth: e.auth ? this.normalizeAuthHelper(e.auth) : undefined,
          variables: v,
          headers: this.normalizeHeaders(e.headers),
          inheritsFrom: e.inheritsFrom,
          notes: e.notes || '',
        };
      });
    } else if (data.environments && typeof data.environments === 'object') {
      Object.entries(data.environments).forEach(([key, e]: [string, any]) => {
        if (!e || typeof e !== 'object') return;
        environments[key] = {
          id: e.id || this.generateId('env'),
          baseUrl: e.baseUrl !== undefined ? e.baseUrl : 'https://api.example.com',
          apiKey: e.apiKey || '',
          auth: e.auth ? this.normalizeAuthHelper(e.auth) : undefined,
          variables: this.normalizeVariables(e.variables),
          headers: this.normalizeHeaders(e.headers),
          inheritsFrom: e.inheritsFrom,
          notes: e.notes || '',
        };
      });
    }

    let profiles: Profile[] = [];
    if (Array.isArray(data.profiles) && data.profiles.length > 0) {
      profiles = data.profiles.map((p: any) => ({
        id: p.id || this.generateId('profile'),
        name: p.name || 'Profile',
        auth: this.normalizeAuthHelper(p.auth),
        variables: this.normalizeVariables(p.variables),
        headers: this.normalizeHeaders(p.headers),
        inheritsFrom: p.inheritsFrom,
        notes: p.notes || '',
      }));
    } else if (data.profile && typeof data.profile === 'object') {
      profiles = [
        {
          id: data.profile.id || this.generateId('profile'),
          name: data.profile.name || 'Imported Profile',
          auth: this.normalizeAuthHelper(data.profile.auth),
          variables: this.normalizeVariables(data.profile.variables),
          headers: this.normalizeHeaders(data.profile.headers),
          notes: data.profile.notes || 'Imported from workspace backup',
        },
      ];
    } else {
      profiles = [
        {
          id: this.generateId('profile'),
          name: 'Default',
          auth: { type: 'none' },
          variables: {},
          headers: {},
          notes: '',
        },
      ];
    }

    const history = Array.isArray(data.history) ? data.history : [];

    return {
      profiles,
      environments,
      collections,
      history,
    };
  }

  private static parseBlueByrdCollection(data: any): Collection {
    const raw = data.collection || data;
    return this.normalizeCollectionHelper(raw);
  }

  private static parseBlueByrdEnvironment(data: any): { name: string; env: EnvironmentConfig } {
    const raw = data.environment || data;
    const name = data.name || data.environmentName || raw.name || 'Imported Environment';
    const v = this.normalizeVariables(raw.variables);
    let baseUrl = raw.baseUrl;
    if (!baseUrl) {
      const keys = ['url', 'app_host', 'baseurl', 'base_url', 'host'];
      for (const k of keys) {
        if (v[k] && (v[k].startsWith('http://') || v[k].startsWith('https://'))) {
          baseUrl = v[k];
          break;
        }
      }
    }
    const env: EnvironmentConfig = {
      id: raw.id || this.generateId('env'),
      baseUrl: baseUrl || 'https://api.example.com',
      apiKey: raw.apiKey || '',
      auth: raw.auth ? this.normalizeAuthHelper(raw.auth) : undefined,
      variables: v,
      headers: this.normalizeHeaders(raw.headers),
      inheritsFrom: raw.inheritsFrom,
      notes: raw.notes || '',
    };
    return { name, env };
  }

  // ==========================================
  // Export Methods
  // ==========================================

  public static exportCollection(collection: Collection): string {
    const exportData = {
      kind: 'bluebyrd.collection',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      collection,
    };
    return JSON.stringify(exportData, null, 2);
  }

  public static exportEnvironment(name: string, environment: EnvironmentConfig): string {
    const exportData = {
      kind: 'bluebyrd.environment',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      name,
      environment,
    };
    return JSON.stringify(exportData, null, 2);
  }

  public static exportBackup(state: AppState): string {
    const exportData = {
      bluebyrdBackupVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles: state.profiles,
      environments: state.environments,
      collections: state.collections,
      history: state.history,
    };
    return JSON.stringify(exportData, null, 2);
  }
}

