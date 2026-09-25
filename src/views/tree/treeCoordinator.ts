import * as vscode from 'vscode';
import { BlueByrdProfilesTreeProvider } from './profilesTreeProvider';
import { BlueByrdCollectionsTreeProvider } from './collectionsTreeProvider';
import { BlueByrdEnvironmentsTreeProvider } from './environmentsTreeProvider';
import { BlueByrdHistoryTreeProvider } from './historyTreeProvider';

export interface TreeRefreshable {
  refresh(): void;
}

export class BlueByrdTreeCoordinator implements TreeRefreshable, vscode.Disposable {
  constructor(
    public readonly profilesProvider: BlueByrdProfilesTreeProvider,
    public readonly collectionsProvider: BlueByrdCollectionsTreeProvider,
    public readonly environmentsProvider: BlueByrdEnvironmentsTreeProvider,
    public readonly historyProvider: BlueByrdHistoryTreeProvider,
    private readonly onRefreshCallback?: () => void
  ) {
    this.collectionsProvider.setRefreshListener(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this.profilesProvider.refresh();
    this.collectionsProvider.refresh();
    this.environmentsProvider.refresh();
    this.historyProvider.refresh();
    if (this.onRefreshCallback) {
      this.onRefreshCallback();
    }
  }

  public dispose(): void {
    this.profilesProvider.dispose();
    this.collectionsProvider.dispose();
    this.environmentsProvider.dispose();
    this.historyProvider.dispose();
  }
}

