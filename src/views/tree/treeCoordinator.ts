import * as vscode from 'vscode';
import { BlueByrdProfilesTreeProvider } from './profilesTreeProvider';
import { BlueByrdCollectionsTreeProvider } from './collectionsTreeProvider';
import { BlueByrdEnvironmentsTreeProvider } from './environmentsTreeProvider';
import { BlueByrdHistoryTreeProvider } from './historyTreeProvider';
import { BlueByrdToolsTreeProvider } from './toolsTreeProvider';

export interface TreeRefreshable {
  refresh(): void;
}

export class BlueByrdTreeCoordinator implements TreeRefreshable, vscode.Disposable {
  public readonly toolsProvider: BlueByrdToolsTreeProvider | BlueByrdHistoryTreeProvider;
  public readonly historyProvider: BlueByrdHistoryTreeProvider | BlueByrdToolsTreeProvider;

  constructor(
    public readonly profilesProvider: BlueByrdProfilesTreeProvider,
    public readonly collectionsProvider: BlueByrdCollectionsTreeProvider,
    public readonly environmentsProvider: BlueByrdEnvironmentsTreeProvider,
    toolsOrHistoryProvider: BlueByrdToolsTreeProvider | BlueByrdHistoryTreeProvider,
    private readonly onRefreshCallback?: () => void
  ) {
    this.toolsProvider = toolsOrHistoryProvider;
    this.historyProvider = toolsOrHistoryProvider;
    this.collectionsProvider.setRefreshListener(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this.profilesProvider.refresh();
    this.collectionsProvider.refresh();
    this.environmentsProvider.refresh();
    this.toolsProvider.refresh();
    if (this.onRefreshCallback) {
      this.onRefreshCallback();
    }
  }

  public dispose(): void {
    this.profilesProvider.dispose();
    this.collectionsProvider.dispose();
    this.environmentsProvider.dispose();
    this.toolsProvider.dispose();
  }
}
