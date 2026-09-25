import * as vscode from 'vscode';
import { AppState, EnvironmentConfig } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { BlueByrdTreeItem } from './treeItem';

export class BlueByrdEnvironmentsTreeProvider
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

  public getChildren(element?: BlueByrdTreeItem): BlueByrdTreeItem[] {
    if (!element) {
      return this.getRootEnvironments();
    }
    return element.children || [];
  }

  private getRootEnvironments(): BlueByrdTreeItem[] {
    const activeProfileId = this.state.activeProfileId;
    const isFiltered = activeProfileId && activeProfileId !== 'all';
    const activeEnvName = this.state.activeEnvironmentName;

    // 1. Filter environments matching active profile scope or global
    const envEntries = Object.entries(this.state.environments).filter(([name, env]) => {
      if (!isFiltered) return true;
      if (activeProfileId === 'global') return !env.profileId || env.profileId === 'global';
      return env.profileId === activeProfileId || !env.profileId || env.profileId === 'global';
    });

    if (envEntries.length === 0) {
      const emptyItem = new BlueByrdTreeItem(
        'No environments found',
        'environment',
        'empty',
        undefined,
        undefined,
        [],
        undefined,
        'Click + to create one',
        vscode.TreeItemCollapsibleState.None
      );
      emptyItem.iconPath = new vscode.ThemeIcon('info');
      return [emptyItem];
    }

    // 2. Maps for lookup
    const envById = new Map<string, { name: string; env: EnvironmentConfig }>();
    const envByName = new Map<string, { name: string; env: EnvironmentConfig }>();
    for (const [name, env] of envEntries) {
      envByName.set(name, { name, env });
      if (env.id) envById.set(env.id, { name, env });
    }

    // 3. Child mapping
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

    // 4. Recursive builder with cycle guard
    const buildEnvNode = (
      name: string,
      env: EnvironmentConfig,
      visited: Set<string>
    ): BlueByrdTreeItem => {
      const key = env.id || name;
      const nextVisited = new Set(visited).add(key);

      const rawChildren = childrenMap.get(key) || [];
      const validChildren = rawChildren.filter(c => !visited.has(c.env.id || c.name));
      const childNodes = validChildren.map(c => buildEnvNode(c.name, c.env, nextVisited));

      const isActive = activeEnvName === name || (env.id && activeEnvName === env.id);
      const isParent = childNodes.length > 0;

      const descParts: string[] = [];
      if (isActive) {
        descParts.push('✔ Active');
      }
      if (isParent) {
        descParts.push(`Parent (${childNodes.length})`);
      }
      if (env.inheritsFrom) {
        const p = envById.get(env.inheritsFrom) || envByName.get(env.inheritsFrom);
        descParts.push(`inherits: ${p?.name || env.inheritsFrom}`);
      }
      if (env.baseUrl && !isParent) {
        descParts.push(env.baseUrl);
      }
      const desc = descParts.length > 0 ? descParts.join(' • ') : undefined;

      const item = new BlueByrdTreeItem(
        name,
        'environment',
        env.id || name,
        env.inheritsFrom,
        undefined,
        childNodes,
        {
          title: 'Set as Active Environment',
          command: 'byrdsnestApiClient.setActiveEnvironment',
          arguments: [{ name, id: env.id }],
        },
        desc,
        isParent ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
      );

      if (isActive) {
        item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      } else if (isParent) {
        item.iconPath = new vscode.ThemeIcon('server-process');
      } else {
        item.iconPath = new vscode.ThemeIcon('globe');
      }

      return item;
    };

    return rootEntries.map(e => buildEnvNode(e.name, e.env, new Set()));
  }
}
