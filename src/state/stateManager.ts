import * as vscode from 'vscode';
import {
  AppState,
  AuthSettings,
  Collection,
  CollectionFolder,
  EnvironmentConfig,
  Profile,
  ProfileAuth,
  RecentRequest,
  RequestItem,
  ResponseMetadata,
  SidebarNodeKind,
} from '../types';

export class BlueByrdStateManager {
  private readonly context: vscode.ExtensionContext;
  private readonly storageKey = 'blue-byrd-state';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  public createDefaultState(): AppState {
    return {
      profiles: [
        {
          id: 'profile-dev',
          name: 'Development',
          auth: { type: 'bearer', token: 'dev-token-sample', headerName: 'Authorization' },
          variables: {
            authSecret: 'super-secret-key',
            version: 'v1',
          },
        },
        {
          id: 'profile-staging',
          name: 'Staging',
          auth: { type: 'apiKey', keyName: 'x-api-key', headerName: 'x-api-key', token: 'staging-api-key' },
          variables: {
            version: 'v1',
          },
        },
        {
          id: 'profile-prod',
          name: 'Production',
          auth: { type: 'bearer', token: '', headerName: 'Authorization' },
          variables: {
            version: 'v1',
          },
        },
      ],
      environments: {
        Local: {
          id: 'env-local',
          baseUrl: 'https://jsonplaceholder.typicode.com',
          apiKey: 'local-key',
          variables: {
            baseUrl: 'https://jsonplaceholder.typicode.com',
            userId: '1',
          },
          profileId: 'profile-dev',
        },
        Dev: {
          id: 'env-dev',
          baseUrl: 'https://dev.api.example.com',
          apiKey: 'dev-key',
          variables: {
            baseUrl: 'https://dev.api.example.com',
            userId: '100',
          },
          inheritsFrom: 'Local',
          profileId: 'profile-dev',
        },
        Prod: {
          id: 'env-prod',
          baseUrl: 'https://api.example.com',
          apiKey: 'prod-key',
          variables: {
            baseUrl: 'https://api.example.com',
          },
          profileId: 'profile-prod',
        },
      },
      collections: [
        {
          id: 'col-demo',
          name: 'Demo Collection',
          profileId: 'profile-dev',
          folders: [
            {
              id: 'folder-todos',
              name: 'Todos',
              requests: [
                {
                  id: 'req-get-todo',
                  name: 'Get Todo Item',
                  method: 'GET',
                  url: '{{baseUrl}}/todos/{{userId}}',
                  folder: 'Todos',
                  collection: 'Demo Collection',
                  headers: {
                    Accept: 'application/json',
                  },
                  body: '',
                  profile: 'Development',
                  environment: 'Local',
                  notes: 'Fetches a single todo item using baseUrl and userId template variables.',
                },
                {
                  id: 'req-create-todo',
                  name: 'Create Todo Item',
                  method: 'POST',
                  url: '{{baseUrl}}/todos',
                  folder: 'Todos',
                  collection: 'Demo Collection',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                  body: JSON.stringify(
                    {
                      title: 'Ship bluebyrd',
                      completed: false,
                      userId: 1,
                    },
                    null,
                    2
                  ),
                  profile: 'Development',
                  environment: 'Local',
                  notes: 'Creates a new todo item.',
                },
              ],
            },
          ],
          requests: [
            {
              id: 'req-get-users',
              name: 'Get Users List',
              method: 'GET',
              url: '{{baseUrl}}/users',
              collection: 'Demo Collection',
              headers: {
                Accept: 'application/json',
              },
              body: '',
              profile: 'Development',
              environment: 'Local',
              notes: 'Collection root level request.',
            },
          ],
        },
      ],
      history: [],
      activeProfileId: 'profile-dev',
      activeEnvironmentName: 'Local',
    };
  }

  private normalizeAuth(auth?: Partial<ProfileAuth>): ProfileAuth {
    return {
      type: auth?.type === 'bearer' || auth?.type === 'apiKey' || auth?.type === 'oauth2' || auth?.type === 'basic' ? auth.type : 'none',
      token: auth?.token ?? '',
      headerName: auth?.headerName ?? 'Authorization',
      keyName: auth?.keyName ?? 'X-API-Key',
      headerPrefix: auth?.headerPrefix ?? (auth?.type === 'bearer' || auth?.type === 'oauth2' ? 'Bearer' : ''),
      addTo: auth?.addTo ?? 'header',
      username: auth?.username ?? '',
      password: auth?.password ?? '',
      clientId: auth?.clientId ?? '',
      clientSecret: auth?.clientSecret ?? '',
      authorizationUrl: auth?.authorizationUrl ?? '',
      tokenUrl: auth?.tokenUrl ?? '',
      scopes: Array.isArray(auth?.scopes) ? auth.scopes : [],
      grantType: auth?.grantType ?? 'authorization_code',
    };
  }

  public normalizeState(value: Partial<AppState> | undefined): AppState {
    const fallback = this.createDefaultState();
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const slugify = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';

    // Normalize profiles
    const profiles: Profile[] = Array.isArray(value.profiles) && value.profiles.length > 0
      ? value.profiles.map((p, index) => ({
          id: p.id || `profile-${slugify(p.name || `dev-${index + 1}`)}`,
          name: p.name || `Profile ${index + 1}`,
          auth: this.normalizeAuth(p.auth),
          variables: p.variables || {},
          headers: p.headers || {},
          inheritsFrom: p.inheritsFrom,
          notes: p.notes || '',
        }))
      : fallback.profiles;

    // Normalize environments
    const rawEnvs = value.environments && typeof value.environments === 'object' ? value.environments : {};
    const environments: Record<string, EnvironmentConfig> = {};

    if (Object.keys(rawEnvs).length > 0) {
      Object.entries(rawEnvs).forEach(([key, env]) => {
        if (!env || typeof env !== 'object') return;
        environments[key] = {
          id: env.id || `env-${slugify(key)}`,
          baseUrl: env.baseUrl !== undefined ? env.baseUrl : (env.inheritsFrom ? '' : 'https://api.example.com'),
          apiKey: env.apiKey || '',
          auth: env.auth ? this.normalizeAuth(env.auth) : undefined,
          variables: env.variables || {},
          headers: env.headers || {},
          inheritsFrom: env.inheritsFrom,
          notes: env.notes || '',
          profileId: env.profileId,
        };
      });
    } else {
      Object.assign(environments, fallback.environments);
    }

    // Normalize collections & eliminate any duplicates where requests in folders were also placed in root
    const collections: Collection[] = Array.isArray(value.collections) && value.collections.length > 0
      ? value.collections.map((col, cIdx) => {
          const colId = col.id || `col-${slugify(col.name || `col-${cIdx + 1}`)}`;
          const colName = col.name || `Collection ${cIdx + 1}`;

          const folders: CollectionFolder[] = Array.isArray(col.folders)
            ? col.folders.map((f, fIdx) => {
                const folderId = f.id || `folder-${slugify(f.name || `folder-${fIdx + 1}`)}`;
                const folderName = f.name || `Folder ${fIdx + 1}`;
                const requests: RequestItem[] = Array.isArray(f.requests)
                  ? f.requests.map((r, rIdx) => ({
                      id: r.id || `req-${Date.now()}-${rIdx}`,
                      name: r.name || 'Untitled Request',
                      method: (r.method || 'GET').toUpperCase(),
                      url: r.url || '',
                      folder: folderName,
                      folderId,
                      collection: colName,
                      collectionId: colId,
                      headers: r.headers || {},
                      body: r.body || '',
                      bodyType: r.bodyType,
                      bodyFormData: r.bodyFormData,
                      profile: r.profile,
                      environment: r.environment,
                      auth: r.auth,
                      notes: r.notes || '',
                      variables: r.variables || [],
                    }))
                  : [];
                return {
                  id: folderId,
                  name: folderName,
                  requests,
                  auth: f.auth,
                  notes: f.notes || '',
                  variables: f.variables || {},
                  headers: f.headers || {},
                  inheritsFrom: f.inheritsFrom,
                };
              })
            : [];

          // Get IDs of requests that are in folders so we can remove them from root if duplicated
          const folderRequestIds = new Set<string>();
          folders.forEach((f) => f.requests.forEach((r) => folderRequestIds.add(r.id)));

          const rootRequests: RequestItem[] = Array.isArray(col.requests)
            ? col.requests
                .filter((r) => r && !folderRequestIds.has(r.id) && (!r.folder || r.folder === 'Root'))
                .map((r, rIdx) => ({
                  id: r.id || `req-${Date.now()}-${rIdx}`,
                  name: r.name || 'Untitled Request',
                  method: (r.method || 'GET').toUpperCase(),
                  url: r.url || '',
                  folder: undefined,
                  folderId: undefined,
                  collection: colName,
                  collectionId: colId,
                  headers: r.headers || {},
                  body: r.body || '',
                  bodyType: r.bodyType,
                  bodyFormData: r.bodyFormData,
                  profile: r.profile,
                  environment: r.environment,
                  auth: r.auth,
                  notes: r.notes || '',
                  variables: r.variables || [],
                }))
            : [];

          return {
            id: colId,
            name: colName,
            folders,
            requests: rootRequests,
            auth: col.auth,
            notes: col.notes || '',
            variables: col.variables || {},
            headers: col.headers || {},
            inheritsFrom: col.inheritsFrom,
            profileId: col.profileId,
          };
        })
      : fallback.collections;

    // Normalize history
    const history: RecentRequest[] = Array.isArray(value.history)
      ? value.history
          .filter((h): h is RecentRequest => !!h && typeof h.id === 'string')
          .map((h) => ({
            ...h,
            method: (h.method || 'GET').toUpperCase(),
            headers: h.headers || {},
            body: h.body || '',
            timestamp: h.timestamp || new Date().toISOString(),
          }))
          .slice(0, 50)
      : [];

    const activeProfileId = typeof value.activeProfileId === 'string' ? value.activeProfileId : undefined;
    const activeEnvironmentName = typeof value.activeEnvironmentName === 'string' ? value.activeEnvironmentName : (fallback.activeEnvironmentName || undefined);

    return {
      profiles,
      environments,
      collections,
      history,
      activeProfileId,
      activeEnvironmentName,
    };
  }

  public getState(): AppState {
    const saved = this.context.workspaceState.get<Partial<AppState>>(this.storageKey);
    try {
      const normalized = this.normalizeState(saved);
      return normalized;
    } catch (err) {
      console.error('[bluebyrd] Error normalizing state, returning fallback:', err);
      const fallback = this.createDefaultState();
      this.context.workspaceState.update(this.storageKey, fallback);
      return fallback;
    }
  }

  public save(state: AppState): void {
    this.context.workspaceState.update(this.storageKey, state);
  }

  // --- Active Context & Workspace Scope ---
  public getActiveProfileId(): string | undefined {
    return this.getState().activeProfileId;
  }

  public setActiveProfileId(id?: string): void {
    const state = this.getState();
    state.activeProfileId = id;
    this.save(state);
  }

  public getActiveEnvironmentName(): string | undefined {
    return this.getState().activeEnvironmentName;
  }

  public setActiveEnvironmentName(name?: string): void {
    const state = this.getState();
    state.activeEnvironmentName = name;
    this.save(state);
  }

  // --- Profiles ---
  public getProfiles(): Profile[] {
    return this.getState().profiles;
  }

  public getProfile(nameOrId?: string): Profile | undefined {
    if (!nameOrId) return undefined;
    const profiles = this.getState().profiles;
    return profiles.find((p) => p.id === nameOrId) || profiles.find((p) => p.name === nameOrId);
  }

  public createProfile(name: string, auth?: Partial<ProfileAuth>): Profile {
    const state = this.getState();
    const trimmed = name.trim() || 'New Profile';
    let finalName = trimmed;
    let counter = 1;
    while (state.profiles.some((p) => p.name.toLowerCase() === finalName.toLowerCase())) {
      counter++;
      finalName = `${trimmed} (${counter})`;
    }
    const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'profile';
    const newProfile: Profile = {
      id: this.generateId(`profile-${slug}`),
      name: finalName,
      auth: this.normalizeAuth(auth),
      variables: {},
      headers: {},
      notes: '',
    };
    state.profiles.push(newProfile);
    this.save(state);
    return newProfile;
  }

  public saveProfile(profile: Profile): void {
    const state = this.getState();
    const index = profile.id
      ? state.profiles.findIndex((p) => p.id === profile.id)
      : state.profiles.findIndex((p) => p.name === profile.name);
    if (index >= 0) {
      state.profiles[index] = profile;
    } else {
      state.profiles.push(profile);
    }
    this.save(state);
  }

  public deleteProfile(nameOrId: string): boolean {
    const state = this.getState();
    const initialLen = state.profiles.length;
    const deletedProfile = state.profiles.find((p) => p.id === nameOrId || p.name === nameOrId);
    const byId = state.profiles.filter((p) => p.id !== nameOrId);
    if (byId.length !== initialLen) {
      state.profiles = byId;
      if (state.activeProfileId === nameOrId || (deletedProfile && state.activeProfileId === deletedProfile.id)) {
        state.activeProfileId = undefined;
      }
      this.save(state);
      return true;
    }
    state.profiles = state.profiles.filter((p) => p.name !== nameOrId);
    if (state.profiles.length !== initialLen) {
      if (state.activeProfileId === nameOrId || (deletedProfile && state.activeProfileId === deletedProfile.id)) {
        state.activeProfileId = undefined;
      }
      this.save(state);
      return true;
    }
    return false;
  }

  // --- Environments ---
  public getEnvironments(): Record<string, EnvironmentConfig> {
    return this.getState().environments;
  }

  public getEnvironment(nameOrId?: string): EnvironmentConfig | undefined {
    if (!nameOrId) return undefined;
    const envs = this.getState().environments;
    if (envs[nameOrId]) return envs[nameOrId];
    return Object.values(envs).find((e) => e.id === nameOrId);
  }

  public getEnvironmentName(nameOrId?: string): string | undefined {
    if (!nameOrId) return undefined;
    const envs = this.getState().environments;
    if (envs[nameOrId]) return nameOrId;
    const entry = Object.entries(envs).find(([, e]) => e.id === nameOrId);
    return entry ? entry[0] : undefined;
  }

  public createEnvironment(name: string, baseUrl = 'https://api.example.com', profileId?: string): { name: string; env: EnvironmentConfig } {
    const state = this.getState();
    const trimmed = name.trim() || 'New Environment';
    let finalName = trimmed;
    let counter = 1;
    while (state.environments[finalName]) {
      counter++;
      finalName = `${trimmed} (${counter})`;
    }
    const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'env';
    const newEnv: EnvironmentConfig = {
      id: this.generateId(`env-${slug}`),
      baseUrl,
      variables: {},
      headers: {},
      notes: '',
      profileId,
    };
    state.environments[finalName] = newEnv;
    this.save(state);
    return { name: finalName, env: newEnv };
  }

  public saveEnvironment(name: string, env: EnvironmentConfig, oldName?: string): void {
    const state = this.getState();
    if (oldName && oldName !== name) {
      delete state.environments[oldName];
      if (state.activeEnvironmentName === oldName) {
        state.activeEnvironmentName = name;
      }
    }
    state.environments[name] = env;
    this.save(state);
  }

  public deleteEnvironment(nameOrId: string): boolean {
    const state = this.getState();
    const key = Object.keys(state.environments).find((k) => k === nameOrId || state.environments[k].id === nameOrId);
    if (key) {
      delete state.environments[key];
      if (state.activeEnvironmentName === key || state.activeEnvironmentName === nameOrId) {
        state.activeEnvironmentName = undefined;
      }
      this.save(state);
      return true;
    }
    return false;
  }

  // --- Collections & Folders ---
  public getCollections(): Collection[] {
    return this.getState().collections;
  }

  public getCollection(idOrName?: string): Collection | undefined {
    if (!idOrName) return undefined;
    return this.getState().collections.find((c) => c.id === idOrName || c.name === idOrName);
  }

  public createCollection(name: string, profileId?: string): Collection {
    const state = this.getState();
    const newCol: Collection = {
      id: this.generateId('col'),
      name: name.trim() || 'New Collection',
      folders: [],
      requests: [],
      profileId,
    };
    state.collections.push(newCol);
    this.save(state);
    return newCol;
  }

  public saveCollection(collection: Collection): void {
    const state = this.getState();
    const idx = state.collections.findIndex((c) => c.id === collection.id);
    if (idx >= 0) {
      state.collections[idx] = collection;
    } else {
      state.collections.push(collection);
    }
    this.save(state);
  }

  public deleteCollection(idOrName: string): boolean {
    const state = this.getState();
    const initialLen = state.collections.length;
    state.collections = state.collections.filter((c) => c.id !== idOrName && c.name !== idOrName);
    if (state.collections.length !== initialLen) {
      this.save(state);
      return true;
    }
    return false;
  }

  public createFolder(collectionIdOrName: string, folderName: string): CollectionFolder | undefined {
    const state = this.getState();
    const col = state.collections.find((c) => c.id === collectionIdOrName || c.name === collectionIdOrName);
    if (!col) return undefined;

    const newFolder: CollectionFolder = {
      id: this.generateId('folder'),
      name: folderName.trim() || 'New Folder',
      requests: [],
      headers: {},
      variables: {},
    };
    col.folders.push(newFolder);
    this.save(state);
    return newFolder;
  }

  public deleteFolder(collectionIdOrName: string, folderIdOrName: string): boolean {
    const state = this.getState();
    const col = state.collections.find((c) => c.id === collectionIdOrName || c.name === collectionIdOrName);
    if (!col) return false;

    const initialLen = col.folders.length;
    col.folders = col.folders.filter((f) => f.id !== folderIdOrName && f.name !== folderIdOrName);
    if (col.folders.length !== initialLen) {
      this.save(state);
      return true;
    }
    return false;
  }

  // --- Requests CRUD ---
  public getRequest(requestId: string): { request: RequestItem; collection: Collection; folder?: CollectionFolder } | undefined {
    const state = this.getState();
    for (const collection of state.collections) {
      const rootReq = collection.requests.find((r) => r.id === requestId);
      if (rootReq) {
        return { request: rootReq, collection };
      }
      for (const folder of collection.folders) {
        const folderReq = folder.requests.find((r) => r.id === requestId);
        if (folderReq) {
          return { request: folderReq, collection, folder };
        }
      }
    }
    return undefined;
  }

  public saveRequest(request: RequestItem, targetCollectionNameOrId?: string, targetFolderNameOrId?: string): RequestItem {
    const state = this.getState();
    const colName = targetCollectionNameOrId || request.collection || state.collections[0]?.name || 'Demo Collection';
    let collection = state.collections.find((c) => c.id === colName || c.name === colName);

    if (!collection) {
      collection = {
        id: `col-${Date.now()}`,
        name: colName,
        folders: [],
        requests: [],
      };
      state.collections.push(collection);
    }

    const folderName = targetFolderNameOrId || request.folder;
    const hasFolder = folderName && folderName !== 'Root' && folderName.trim() !== '';

    const normalizedRequest: RequestItem = {
      ...request,
      id: request.id || `req-${Date.now()}`,
      name: request.name?.trim() || `${request.method} ${request.url || 'Untitled'}`,
      method: (request.method || 'GET').toUpperCase(),
      collection: collection.name,
      collectionId: collection.id,
      folder: hasFolder ? folderName : undefined,
    };

    if (hasFolder) {
      let folder = collection.folders.find((f) => f.id === folderName || f.name === folderName);
      if (!folder) {
        folder = {
          id: `folder-${Date.now()}`,
          name: folderName,
          requests: [],
        };
        collection.folders.push(folder);
      }
      normalizedRequest.folderId = folder.id;
      normalizedRequest.folder = folder.name;

      // Update in folder
      const reqIdx = folder.requests.findIndex((r) => r.id === normalizedRequest.id);
      if (reqIdx >= 0) {
        folder.requests[reqIdx] = normalizedRequest;
      } else {
        folder.requests.push(normalizedRequest);
      }

      // Remove from root if previously there
      collection.requests = collection.requests.filter((r) => r.id !== normalizedRequest.id);
    } else {
      normalizedRequest.folder = undefined;
      normalizedRequest.folderId = undefined;

      // Update in root
      const reqIdx = collection.requests.findIndex((r) => r.id === normalizedRequest.id);
      if (reqIdx >= 0) {
        collection.requests[reqIdx] = normalizedRequest;
      } else {
        collection.requests.push(normalizedRequest);
      }

      // Remove from any folder if previously there
      collection.folders.forEach((f) => {
        f.requests = f.requests.filter((r) => r.id !== normalizedRequest.id);
      });
    }

    this.save(state);
    return normalizedRequest;
  }

  public deleteRequest(requestId: string): boolean {
    const state = this.getState();
    let deleted = false;

    for (const col of state.collections) {
      const initRoot = col.requests.length;
      col.requests = col.requests.filter((r) => r.id !== requestId);
      if (col.requests.length !== initRoot) {
        deleted = true;
      }
      for (const folder of col.folders) {
        const initFolder = folder.requests.length;
        folder.requests = folder.requests.filter((r) => r.id !== requestId);
        if (folder.requests.length !== initFolder) {
          deleted = true;
        }
      }
    }

    if (deleted) {
      this.save(state);
    }
    return deleted;
  }

  public duplicateRequest(requestId: string): RequestItem | undefined {
    const found = this.getRequest(requestId);
    if (!found) return undefined;

    const copy: RequestItem = {
      ...found.request,
      id: this.generateId('req'),
      name: `${found.request.name} (Copy)`,
    };

    return this.saveRequest(copy, found.collection.id, found.folder?.id);
  }

  // --- History Isolated from Collections ---
  public getHistory(): RecentRequest[] {
    return this.getState().history;
  }

  public getHistoryItem(id: string): RecentRequest | undefined {
    return this.getState().history.find((h) => h.id === id);
  }

  public recordHistory(
    request: RequestItem,
    meta?: Partial<ResponseMetadata> & { resolvedUrl?: string }
  ): RecentRequest {
    const state = this.getState();

    // Memory protection: truncate response body if larger than 100KB (102400 chars)
    let bodyToStore = meta?.body;
    if (bodyToStore && bodyToStore.length > 102400) {
      bodyToStore = bodyToStore.substring(0, 102400) + '\n\n... [Response body truncated (> 100 KB) for history storage]';
    }

    const historyEntry: RecentRequest = {
      ...request,
      id: this.generateId('history'),
      timestamp: new Date().toISOString(),
      resolvedUrl: meta?.resolvedUrl || request.url,
      responseStatus: meta?.status,
      responseStatusText: meta?.statusText,
      elapsedMs: meta?.elapsedMs,
      responseSizeBytes: meta?.sizeBytes,
      responseHeaders: meta?.headers,
      responseBody: bodyToStore,
      responseOk: meta?.ok,
    };

    // Filter out previous immediate exact duplicate
    const filtered = state.history.filter(
      (entry) =>
        !(
          entry.method === historyEntry.method &&
          entry.url === historyEntry.url &&
          entry.collection === historyEntry.collection &&
          entry.folder === historyEntry.folder
        )
    );

    // Prepend and cap at 50
    state.history = [historyEntry, ...filtered].slice(0, 50);
    this.save(state);
    return historyEntry;
  }

  public clearHistory(): void {
    const state = this.getState();
    state.history = [];
    this.save(state);
  }

  public deleteHistoryItem(id: string): boolean {
    const state = this.getState();
    const initialLen = state.history.length;
    state.history = state.history.filter((h) => h.id !== id);
    if (state.history.length !== initialLen) {
      this.save(state);
      return true;
    }
    return false;
  }

  // --- Generic Delete Item for Context Menus ---
  public deleteItem(kind: SidebarNodeKind, id: string, parentId?: string): boolean {
    switch (kind) {
      case 'profile':
        return this.deleteProfile(id);
      case 'environment':
        return this.deleteEnvironment(id);
      case 'collection':
        return this.deleteCollection(id);
      case 'folder':
        return parentId ? this.deleteFolder(parentId, id) : false;
      case 'request':
        return this.deleteRequest(id);
      case 'history':
        return this.deleteHistoryItem(id);
      default:
        return false;
    }
  }
}

