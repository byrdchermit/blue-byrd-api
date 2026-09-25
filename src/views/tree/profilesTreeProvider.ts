import * as vscode from 'vscode';
import { AppState, StoredToken } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { TokenService } from '../../services/tokenService';
import { BlueByrdTreeItem } from './treeItem';

export class BlueByrdProfilesTreeProvider
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

  public async getChildren(element?: BlueByrdTreeItem): Promise<BlueByrdTreeItem[]> {
    if (!element) {
      return this.getRootProfiles();
    }

    if (element.kind === 'profile') {
      return this.getProfileTokenNodes(element.itemId || 'global');
    }

    return [];
  }

  private getRootProfiles(): BlueByrdTreeItem[] {
    const activeProfileId = this.state.activeProfileId;
    const items: BlueByrdTreeItem[] = [];

    for (const p of this.state.profiles) {
      const isActive = activeProfileId === p.id || activeProfileId === p.name;
      const desc = isActive ? '✔ Active' : undefined;

      const item = new BlueByrdTreeItem(
        p.name,
        'profile',
        p.id,
        undefined,
        undefined,
        [],
        {
          title: 'Select Profile Scope',
          command: 'blueByrdApiClient.setActiveProfile',
          arguments: [{ id: p.id, name: p.name }],
        },
        desc,
        vscode.TreeItemCollapsibleState.Collapsed
      );

      if (isActive) {
        item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
      } else {
        item.iconPath = new vscode.ThemeIcon('account');
      }
      items.push(item);
    }

    // Shared / Global item
    const isGlobalActive = !activeProfileId || activeProfileId === 'all' || activeProfileId === 'global';
    const globalItem = new BlueByrdTreeItem(
      'Shared / Global',
      'profile',
      'global',
      undefined,
      undefined,
      [],
      {
        title: 'Select Profile Scope',
        command: 'blueByrdApiClient.setActiveProfile',
        arguments: [{ id: 'global', name: 'Shared / Global' }],
      },
      isGlobalActive ? '✔ Active' : 'Shared across all profiles',
      vscode.TreeItemCollapsibleState.Collapsed
    );

    if (isGlobalActive) {
      globalItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
    } else {
      globalItem.iconPath = new vscode.ThemeIcon('globe');
    }
    items.push(globalItem);

    return items;
  }

  private async getProfileTokenNodes(profileId: string): Promise<BlueByrdTreeItem[]> {
    if (!this.tokenService) {
      return [
        new BlueByrdTreeItem(
          'No stored tokens',
          'noTokens',
          `noTokens-${profileId}`,
          profileId,
          undefined,
          [],
          undefined,
          undefined,
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }

    const tokens = await this.tokenService.getTokens(profileId);
    if (!tokens || tokens.length === 0) {
      return [
        new BlueByrdTreeItem(
          'No stored tokens',
          'noTokens',
          `noTokens-${profileId}`,
          profileId,
          undefined,
          [],
          undefined,
          undefined,
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }

    const now = Date.now();
    const sorted = [...tokens].sort((a, b) => b.expiresAt - a.expiresAt);

    return sorted.map((token) => {
      const isExpired = token.expiresAt <= now;
      const timeStr = new Date(token.expiresAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateStr = new Date(token.expiresAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });
      const expiryDesc = isExpired ? `Expired (${dateStr} ${timeStr})` : `Expires ${timeStr}`;

      const descParts = [token.tier, expiryDesc, token.refreshToken ? 'refreshable' : undefined].filter(
        Boolean
      );

      const label = token.envName || token.tokenName || token.tier || 'Access Token';
      const item = new BlueByrdTreeItem(
        label,
        'token',
        token.id,
        profileId,
        undefined,
        [],
        {
          title: 'Manage Tokens',
          command: 'blueByrdApiClient.manageTokens',
          arguments: [{ profileId }],
        },
        descParts.join(' • '),
        vscode.TreeItemCollapsibleState.None
      );

      item.iconPath = new vscode.ThemeIcon(
        'key',
        isExpired
          ? new vscode.ThemeColor('disabledForeground')
          : new vscode.ThemeColor('charts.yellow')
      );
      item.tooltip =
        `Token: ${label}\n` +
        `Environment: ${token.envName || 'Direct'}\n` +
        `Status: ${isExpired ? 'Expired' : 'Active'}\n` +
        `Expires: ${new Date(token.expiresAt).toLocaleString()}\n` +
        (token.scopes?.length ? `Scopes: ${token.scopes.join(', ')}\n` : '') +
        `Access Token: ${token.accessToken.substring(0, 12)}...`;

      return item;
    });
  }
}
