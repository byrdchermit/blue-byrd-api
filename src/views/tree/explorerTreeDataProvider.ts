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
        this.buildProfilesSection(),
        this.buildEnvironmentsSection(),
        this.buildCollectionsSection(),
        this.buildHistorySection(),
      ];
    }

    if (element.kind === 'section' || element.kind === 'collection' || element.kind === 'folder') {
      return element.children;
    }

    return [];
  }

  private buildProfilesSection(): BlueByrdTreeItem {
    const profileItems = this.state.profiles.map((p) => {
      return new BlueByrdTreeItem(
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
        }
      );
    });

    const section = new BlueByrdTreeItem('Profiles', 'section', 'section-profiles', undefined, undefined, profileItems);
    return section;
  }

  private buildEnvironmentsSection(): BlueByrdTreeItem {
    const envEntries = Object.entries(this.state.environments);
    const envItems = envEntries.map(([name, env]) => {
      return new BlueByrdTreeItem(
        name,
        'environment',
        env.id,
        undefined,
        undefined,
        [],
        {
          title: 'Edit Environment Settings',
          command: 'blueByrdApiClient.editEnvironment',
          arguments: [{ id: env.id, name }],
        }
      );
    });

    const section = new BlueByrdTreeItem('Environments', 'section', 'section-environments', undefined, undefined, envItems);
    return section;
  }

  private buildCollectionsSection(): BlueByrdTreeItem {
    const colItems = this.state.collections.map((col) => {
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
        }
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

