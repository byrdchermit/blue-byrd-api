import * as vscode from 'vscode';
import { AppState, RequestContext } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { BlueByrdTreeItem } from './treeItem';

export class BlueByrdHistoryTreeProvider
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
    if (element) return [];

    const history = this.state.history || [];
    const count = history.length;
    const runStr = count === 1 ? '1 run recorded' : `${count} runs recorded`;

    const linkItem = new BlueByrdTreeItem(
      'Open History Inspector',
      'history',
      'history-inspector-link',
      undefined,
      undefined,
      [],
      {
        title: 'Open History Inspector',
        command: 'blueByrdApiClient.openHistoryPanel',
        arguments: [],
      },
      count > 0 ? runStr : 'No runs recorded',
      vscode.TreeItemCollapsibleState.None
    );
    linkItem.iconPath = new vscode.ThemeIcon('history');
    linkItem.tooltip = count > 0
      ? `Click to open History Inspector (${runStr})`
      : 'Click to open History Inspector';

    return [linkItem];
  }
}
