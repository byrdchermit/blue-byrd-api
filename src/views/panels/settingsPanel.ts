import * as vscode from 'vscode';
import { Collection, CollectionFolder, EnvironmentConfig, Profile, ProfileAuth } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { getSettingsPanelHtml } from './settingsPanelHtml';

export class BlueByrdSettingsPanel {
  public static readonly viewType = 'blueByrdSettings';
  public static currentPanel?: BlueByrdSettingsPanel;
  private static readonly panels = new Map<string, BlueByrdSettingsPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly stateManager: BlueByrdStateManager;
  private readonly target: 'profile' | 'environment' | 'collection' | 'folder';
  private readonly originalName: string;
  private readonly originalId?: string;
  private readonly collectionName?: string;
  private disposables: vscode.Disposable[] = [];

  private static getPanelKey(
    target: 'profile' | 'environment' | 'collection' | 'folder',
    idOrName: string,
    collectionName?: string
  ): string {
    return [target, idOrName, collectionName || 'root'].join('::');
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    target: 'profile' | 'environment' | 'collection' | 'folder',
    name: string,
    stateManager: BlueByrdStateManager,
    collectionName?: string,
    itemId?: string
  ): void {
    try {
      const key = this.getPanelKey(target, itemId || name, collectionName);
      const existing = this.panels.get(key);
      if (existing) {
        existing.panel.reveal(vscode.ViewColumn.One);
        return;
      }

      const state = stateManager.getState();
      const isDuplicateName = target === 'profile'
        ? state.profiles.filter((p) => p.name === name).length > 1
        : false;
      const title = isDuplicateName && itemId
        ? `${name} (${itemId.replace(/^profile-/, '')}) Settings`
        : `${name || 'Untitled'} Settings`;

      const panel = vscode.window.createWebviewPanel(
        BlueByrdSettingsPanel.viewType,
        title,
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        {
          enableScripts: true,
          localResourceRoots: [extensionUri],
          retainContextWhenHidden: true,
        }
      );

      const instance = new BlueByrdSettingsPanel(
        panel,
        target,
        name,
        stateManager,
        collectionName,
        itemId
      );

      this.panels.set(key, instance);
      this.currentPanel = instance;
    } catch (err) {
      console.error('[bluebyrd] Failed to open settings panel:', err);
      vscode.window.showErrorMessage(`Failed to open settings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    target: 'profile' | 'environment' | 'collection' | 'folder',
    name: string,
    stateManager: BlueByrdStateManager,
    collectionName?: string,
    itemId?: string
  ) {
    this.panel = panel;
    this.target = target;
    this.originalName = name;
    this.originalId = itemId;
    this.collectionName = collectionName;
    this.stateManager = stateManager;

    const item = this.resolveItem();
    const allEnvironments = Object.entries(this.stateManager.getEnvironments()).map(([name, env]) => ({
      id: env.id,
      name,
    }));
    this.panel.webview.html = getSettingsPanelHtml(target, item, name, collectionName, allEnvironments);

    this.panel.onDidDispose(
      () => {
        if (BlueByrdSettingsPanel.currentPanel === this) {
          BlueByrdSettingsPanel.currentPanel = undefined;
        }
        const key = BlueByrdSettingsPanel.getPanelKey(
          this.target,
          this.originalId || this.originalName,
          this.collectionName
        );
        BlueByrdSettingsPanel.panels.delete(key);
        while (this.disposables.length) {
          const d = this.disposables.pop();
          if (d) d.dispose();
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'cancel') {
          this.panel.dispose();
          return;
        }

        if (message.type === 'saveSettings') {
          this.handleSave(message.payload);
        }
      },
      null,
      this.disposables
    );
  }

  private resolveItem(): Profile | EnvironmentConfig | Collection | CollectionFolder | undefined {
    const idOrName = this.originalId || this.originalName;
    if (this.target === 'profile') {
      return this.stateManager.getProfile(idOrName);
    } else if (this.target === 'environment') {
      return this.stateManager.getEnvironment(idOrName);
    } else if (this.target === 'collection') {
      return this.stateManager.getCollection(idOrName);
    } else if (this.target === 'folder') {
      const col = this.stateManager.getCollection(this.collectionName);
      return col?.folders.find((f) => f.id === idOrName || f.name === idOrName);
    }
    return undefined;
  }

  private handleSave(payload: {
    name: string;
    baseUrl?: string;
    inheritsFrom?: string;
    authType: 'none' | 'bearer' | 'apiKey' | 'oauth2' | 'basic';
    token?: string;
    headerName?: string;
    keyName?: string;
    headerPrefix?: string;
    addTo?: 'header' | 'query';
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    grantType?: string;
    inheritAuth?: boolean;
    variables: Record<string, string>;
    headers?: Record<string, string>;
    notes?: string;
  }): void {
    const nextName = payload.name.trim() || this.originalName;

    const authObj: ProfileAuth = {
      type: payload.authType,
      token: payload.token,
      headerName: payload.headerName || (payload.authType === 'apiKey' ? payload.keyName || 'X-API-Key' : 'Authorization'),
      keyName: payload.keyName || (payload.authType === 'apiKey' ? payload.headerName || 'X-API-Key' : undefined),
      headerPrefix: payload.headerPrefix || (payload.authType === 'bearer' || payload.authType === 'oauth2' ? 'Bearer' : undefined),
      addTo: payload.addTo || 'header',
      username: payload.username,
      password: payload.password,
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      authorizationUrl: payload.authorizationUrl,
      tokenUrl: payload.tokenUrl,
      scopes: payload.scopes,
      grantType: payload.grantType as any,
    };

    if (this.target === 'profile') {
      const existing = this.stateManager.getProfile(this.originalId || this.originalName);
      const updated: Profile = {
        id: this.originalId || existing?.id || `profile-${Date.now()}`,
        name: nextName,
        auth: authObj,
        variables: payload.variables,
        headers: payload.headers,
        inheritsFrom: payload.inheritsFrom,
        notes: payload.notes,
      };
      this.stateManager.saveProfile(updated);
    } else if (this.target === 'environment') {
      const existing = this.stateManager.getEnvironment(this.originalId || this.originalName);
      const updated: EnvironmentConfig = {
        id: this.originalId || existing?.id || `env-${Date.now()}`,
        baseUrl: payload.baseUrl || 'https://api.example.com',
        auth: authObj,
        variables: payload.variables,
        headers: payload.headers,
        inheritsFrom: payload.inheritsFrom,
        notes: payload.notes,
      };
      this.stateManager.saveEnvironment(nextName, updated, this.originalName);
    } else if (this.target === 'collection') {
      const existing = this.stateManager.getCollection(this.originalId || this.originalName);
      if (existing) {
        existing.name = nextName;
        existing.variables = payload.variables;
        existing.headers = payload.headers;
        existing.inheritsFrom = payload.inheritsFrom;
        existing.notes = payload.notes;
        existing.auth = {
          inheritFromProfile: payload.inheritAuth !== false,
          inheritFromEnvironment: payload.inheritAuth !== false,
          auth: authObj,
        };
        this.stateManager.saveCollection(existing);
      }
    } else if (this.target === 'folder') {
      const col = this.stateManager.getCollection(this.collectionName);
      const existing = col?.folders.find((f) => f.id === this.originalId || f.name === this.originalName);
      if (col && existing) {
        existing.name = nextName;
        existing.variables = payload.variables;
        existing.headers = payload.headers;
        existing.inheritsFrom = payload.inheritsFrom;
        existing.notes = payload.notes;
        existing.auth = {
          inheritFromProfile: payload.inheritAuth !== false,
          inheritFromEnvironment: payload.inheritAuth !== false,
          inheritFromCollection: payload.inheritAuth !== false,
          inheritFromFolder: payload.inheritAuth !== false,
          auth: authObj,
        };
        this.stateManager.saveCollection(col);
      }
    }

    vscode.window.showInformationMessage(`${this.target.toUpperCase()} settings saved.`);
    vscode.commands.executeCommand('blueByrdApiClient.refreshExplorer');
    try {
      this.panel.title = `${nextName} Settings`;
    } catch {
      // Panel might already be disposed
    }
  }
}

