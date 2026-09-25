import * as vscode from 'vscode';
import { AppState, RequestContext } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { TokenService } from '../../services/tokenService';
import { BlueByrdTreeItem } from './treeItem';

export class BlueByrdToolsTreeProvider
  implements vscode.TreeDataProvider<BlueByrdTreeItem>, vscode.Disposable {
  private readonly stateManager: BlueByrdStateManager;
  private readonly tokenService?: TokenService;
  private state: AppState;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BlueByrdTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(stateManager: BlueByrdStateManager, tokenService?: TokenService) {
    this.stateManager = stateManager;
    this.tokenService = tokenService;
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

  public getChildren(element?: BlueByrdTreeItem): BlueByrdTreeItem[] {
    if (element) return [];

    const history = this.state.history || [];
    const count = history.length;
    const runStr = count === 1 ? '1 run recorded' : `${count} runs recorded`;

    const tokenCount = this.tokenService ? this.tokenService.getAllTokens().length : 0;
    const tokenStr = tokenCount > 0 ? `${tokenCount} stored` : 'Manage credentials';

    const items: BlueByrdTreeItem[] = [];

    // 1. History Inspector
    const historyItem = new BlueByrdTreeItem(
      'History Inspector',
      'history',
      'tool-history-inspector',
      undefined,
      undefined,
      [],
      {
        title: 'Open History Inspector',
        command: 'byrdsnestApiClient.openHistoryPanel',
        arguments: [],
      },
      count > 0 ? runStr : 'No runs recorded',
      vscode.TreeItemCollapsibleState.None
    );
    historyItem.iconPath = new vscode.ThemeIcon('history');
    historyItem.tooltip = count > 0
      ? `Click to open History Inspector (${runStr})`
      : 'Click to open History Inspector';
    items.push(historyItem);

    // 2. OAuth Token Vault
    const tokenVaultItem = new BlueByrdTreeItem(
      'OAuth Token Vault',
      'token',
      'tool-token-vault',
      undefined,
      undefined,
      [],
      {
        title: 'Manage Tokens',
        command: 'byrdsnestApiClient.manageTokens',
        arguments: [],
      },
      tokenStr,
      vscode.TreeItemCollapsibleState.None
    );
    tokenVaultItem.iconPath = new vscode.ThemeIcon('key');
    tokenVaultItem.tooltip = 'Manage active OAuth 2.0 access tokens and session credentials';
    items.push(tokenVaultItem);

    // 3. Import from cURL
    const curlItem = new BlueByrdTreeItem(
      'Import from cURL...',
      'request',
      'tool-import-curl',
      undefined,
      undefined,
      [],
      {
        title: 'Import from cURL',
        command: 'byrdsnestApiClient.importCurl',
        arguments: [],
      },
      'Paste cURL command',
      vscode.TreeItemCollapsibleState.None
    );
    curlItem.iconPath = new vscode.ThemeIcon('terminal');
    curlItem.tooltip = 'Paste a raw cURL command to import into a new request panel';
    items.push(curlItem);

    // 4. Import API Workspace Data
    const importItem = new BlueByrdTreeItem(
      'Import API Data...',
      'collection',
      'tool-import-data',
      undefined,
      undefined,
      [],
      {
        title: 'Import API Data',
        command: 'byrdsnestApiClient.importJson',
        arguments: [],
      },
      'Postman / OpenAPI / Backup',
      vscode.TreeItemCollapsibleState.None
    );
    importItem.iconPath = new vscode.ThemeIcon('cloud-download');
    importItem.tooltip = 'Import Postman Collections, OpenAPI 3.0 / Swagger, or byrdsnest api client backup';
    items.push(importItem);

    // 5. Export Full Backup
    const exportItem = new BlueByrdTreeItem(
      'Export Full Backup...',
      'collection',
      'tool-export-backup',
      undefined,
      undefined,
      [],
      {
        title: 'Export Backup',
        command: 'byrdsnestApiClient.exportBackup',
        arguments: [],
      },
      'Full JSON snapshot',
      vscode.TreeItemCollapsibleState.None
    );
    exportItem.iconPath = new vscode.ThemeIcon('cloud-upload');
    exportItem.tooltip = 'Export all collections, environments, and profiles to a timestamped backup file';
    items.push(exportItem);

    // 6. Check for Updates
    const updateItem = new BlueByrdTreeItem(
      'Check for Updates...',
      'section',
      'tool-check-updates',
      undefined,
      undefined,
      [],
      {
        title: 'Check for Updates',
        command: 'byrdsnestApiClient.checkForUpdates',
        arguments: [],
      },
      'v0.3.0',
      vscode.TreeItemCollapsibleState.None
    );
    updateItem.iconPath = new vscode.ThemeIcon('sync');
    updateItem.tooltip = 'Check GitHub for the latest release of byrdsnest api client';
    items.push(updateItem);

    return items;
  }
}

export { BlueByrdToolsTreeProvider as BlueByrdHistoryTreeProvider };
