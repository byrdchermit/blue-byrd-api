import * as vscode from 'vscode';
import { AppState, RequestContext, RequestItem } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { BlueByrdTreeItem } from './treeItem';

export class BlueByrdExplorerTreeDataProvider
  implements vscode.TreeDataProvider<BlueByrdTreeItem>, vscode.Disposable {
  private readonly stateManager: BlueByrdStateManager;
  private state: AppState;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BlueByrdTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(stateManager: BlueByrdStateManager) {
    this.stateManager = stateManager;
    this.state = stateManager.getState();
  }

  public dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  public refresh(): void {
    this.state = this.stateManager.getState();
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: BlueByrdTreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: BlueByrdTreeItem): vscode.ProviderResult<BlueByrdTreeItem> {
    return undefined;
  }

  public getChildren(element?: BlueByrdTreeItem): BlueByrdTreeItem[] {
    if (!element) {
      return [
        this.buildScopeFilterItem(),
        this.buildProfilesSection(),
        this.buildEnvironmentsSection(),
        this.buildCollectionsSection(),
        this.buildHistorySection(),
      ];
    }

    if (
      element.kind === 'section' ||
      element.kind === 'collection' ||
      element.kind === 'folder' ||
      element.kind === 'environment'
    ) {
      return element.children;
    }

    return [];
  }

  private buildScopeFilterItem(): BlueByrdTreeItem {
    const activeProfileId = this.state.activeProfileId;
    const activeProfile = activeProfileId && activeProfileId !== 'all'
      ? this.state.profiles.find((p) => p.id === activeProfileId || p.name === activeProfileId)
      : undefined;

    const label = activeProfile ? `Scope: ${activeProfile.name}` : 'Scope: All Profiles (Global)';
    const desc = activeProfile ? 'Active Profile Scope • click to switch' : 'Global Scope • click to switch';

    return new BlueByrdTreeItem(
      label,
      'active-filter',
      'active-scope-filter',
      undefined,
      undefined,
      [],
      {
        title: 'Switch Active Profile Scope',
        command: 'blueByrdApiClient.switchActiveProfile',
        arguments: [],
      },
      desc
    );
  }

  private buildProfilesSection(): BlueByrdTreeItem {
    const activeProfileId = this.state.activeProfileId;
    const profileItems = this.state.profiles.map((p) => {
      const isActive = activeProfileId === p.id || activeProfileId === p.name;
      const desc = isActive ? '✔ Active Scope' : 'profile';
      const item = new BlueByrdTreeItem(
        p.name,
        'profile',
        p.id,
        undefined,
        undefined,
        [],
        {
          title: 'Edit Profile Settings',
          command: 'blueByrdApiClient.editProfile',
          arguments: [{ id: p.id, name: p.name }],
        },
        desc
      );
      if (isActive) {
        item.iconPath = new vscode.ThemeIcon('pass');
      }
      return item;
    });

    const section = new BlueByrdTreeItem('Profiles', 'section', 'section-profiles', undefined, undefined, profileItems);
    return section;
  }

  private buildEnvironmentsSection(): BlueByrdTreeItem {
    const activeProfileId = this.state.activeProfileId;
    const isProfileScoped = !!activeProfileId && activeProfileId !== 'all';
    const activeEnvName = this.state.activeEnvironmentName;

    // Filter environments if a profile is actively selected
    const allEnvEntries = Object.entries(this.state.environments);
    const filteredEnvEntries = isProfileScoped
      ? allEnvEntries.filter(([, env]) => !env.profileId || env.profileId === 'global' || env.profileId === activeProfileId)
      : allEnvEntries;

    const entryMapByName = new Map<string, { name: string; env: any }>();
    const entryMapById = new Map<string, { name: string; env: any }>();
    for (const [name, env] of filteredEnvEntries) {
      entryMapByName.set(name, { name, env });
      if (env.id) {
        entryMapById.set(env.id, { name, env });
      }
    }

    const parentMap = new Map<string, string>(); // child name -> parent name
    const childrenMap = new Map<string, Array<{ name: string; env: any }>>(); // parent name -> child entries

    for (const [name] of filteredEnvEntries) {
      childrenMap.set(name, []);
    }

    for (const [name, env] of filteredEnvEntries) {
      if (env.inheritsFrom) {
        const parentEntry = entryMapById.get(env.inheritsFrom) || entryMapByName.get(env.inheritsFrom);
        if (parentEntry && parentEntry.name !== name) {
          // Check for cycles
          let curr: string | undefined = parentEntry.name;
          let isCycle = false;
          const visited = new Set<string>([name]);
          while (curr) {
            if (visited.has(curr)) {
              isCycle = true;
              break;
            }
            visited.add(curr);
            curr = parentMap.get(curr);
          }
          if (!isCycle) {
            parentMap.set(name, parentEntry.name);
            childrenMap.get(parentEntry.name)!.push({ name, env });
          }
        }
      }
    }

    const rootEntries = filteredEnvEntries.filter(([name]) => !parentMap.has(name));

    const buildEnvItem = (name: string, env: any, parentName?: string): BlueByrdTreeItem => {
      const childEntries = childrenMap.get(name) || [];
      const childTreeItems = childEntries.map((c) => buildEnvItem(c.name, c.env, name));

      const isActive = activeEnvName === name || (env.id && activeEnvName === env.id);

      const parts: string[] = [];
      if (isActive) {
        parts.push('✔ Active');
      }
      if (childTreeItems.length > 0) {
        parts.push(`Parent (${childTreeItems.length})`);
      } else if (parentName) {
        parts.push(`inherits: ${parentName}`);
      }
      const desc = parts.join(' • ');

      const item = new BlueByrdTreeItem(
        name,
        'environment',
        env.id,
        undefined,
        undefined,
        childTreeItems,
        {
          title: 'Edit Environment Settings',
          command: 'blueByrdApiClient.editEnvironment',
          arguments: [{ id: env.id, name }],
        },
        desc || undefined
      );

      if (isActive) {
        item.iconPath = childTreeItems.length > 0
          ? new vscode.ThemeIcon('server-process')
          : new vscode.ThemeIcon('pass');
      }

      return item;
    };

    const envItems = rootEntries.map(([name, env]) => buildEnvItem(name, env));
    const section = new BlueByrdTreeItem('Environments', 'section', 'section-environments', undefined, undefined, envItems);
    return section;
  }

  private buildCollectionsSection(): BlueByrdTreeItem {
    const activeProfileId = this.state.activeProfileId;
    const isProfileScoped = !!activeProfileId && activeProfileId !== 'all';

    const filteredCollections = isProfileScoped
      ? this.state.collections.filter((col) => !col.profileId || col.profileId === 'global' || col.profileId === activeProfileId)
      : this.state.collections;

    const colItems = filteredCollections.map((col) => {
      // Build folders
      const folderItems = col.folders.map((folder) => {
        const reqItems = folder.requests.map((req) => this.buildRequestItem(req, col.name, folder.name, col.id, folder.id));
        return new BlueByrdTreeItem(
          folder.name,
          'folder',
          folder.id,
          col.id,
          undefined,
          reqItems,
          {
            title: 'Edit Folder Settings',
            command: 'blueByrdApiClient.editFolder',
            arguments: [{ collection: col.name, folder: folder.name, collectionId: col.id, folderId: folder.id }],
          }
        );
      });

      // Build root requests (which do not belong to any folder)
      const rootReqItems = col.requests.map((req) => this.buildRequestItem(req, col.name, undefined, col.id));

      const children = [...folderItems, ...rootReqItems];

      let colDesc = `${children.length} ${children.length === 1 ? 'item' : 'items'}`;
      if (col.profileId && col.profileId !== 'global') {
        const prof = this.state.profiles.find((p) => p.id === col.profileId || p.name === col.profileId);
        if (prof) {
          colDesc += ` • [Profile: ${prof.name}]`;
        }
      }

      return new BlueByrdTreeItem(
        col.name,
        'collection',
        col.id,
        undefined,
        undefined,
        children,
        {
          title: 'Edit Collection Settings',
          command: 'blueByrdApiClient.editCollection',
          arguments: [{ id: col.id, name: col.name }],
        },
        colDesc
      );
    });

    return new BlueByrdTreeItem('Collections', 'section', 'section-collections', undefined, undefined, colItems);
  }

  private buildHistorySection(): BlueByrdTreeItem {
    const historyItems = this.state.history.map((h) => {
      const label = h.name || `${h.method} ${h.url}`;
      return new BlueByrdTreeItem(
        label,
        'history',
        h.id,
        'section-history',
        undefined,
        [],
        {
          title: `Inspect History: ${label}`,
          command: 'blueByrdApiClient.openHistoryPanel',
          arguments: [{ historyId: h.id }],
        }
      );
    });

    return new BlueByrdTreeItem(
      'History',
      'section',
      'section-history',
      undefined,
      undefined,
      historyItems,
      {
        title: 'Open History Inspector',
        command: 'blueByrdApiClient.openHistoryPanel',
        arguments: [],
      }
    );
  }

  private buildRequestItem(
    req: RequestItem,
    collectionName?: string,
    folderName?: string,
    collectionId?: string,
    folderId?: string,
    isHistory = false
  ): BlueByrdTreeItem {
    const context: RequestContext = {
      id: req.id,
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      bodyType: req.bodyType,
      bodyFormData: req.bodyFormData,
      profile: req.profile,
      environment: req.environment,
      collection: collectionName || req.collection,
      collectionId: collectionId || req.collectionId,
      folder: folderName || req.folder,
      folderId: folderId || req.folderId,
      auth: req.auth,
      notes: req.notes,
      variables: req.variables,
    };

    return new BlueByrdTreeItem(
      req.name || `${req.method} ${req.url}`,
      isHistory ? 'history' : 'request',
      req.id,
      folderId || collectionId,
      context,
      [],
      {
        title: `Open ${req.name}`,
        command: 'blueByrdApiClient.openRequestPanel',
        arguments: [context],
      }
    );
  }
}

