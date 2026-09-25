import * as vscode from 'vscode';
import { RecentRequest, RequestItem } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { getHistoryPanelHtml } from './historyPanelHtml';

export class BlueByrdHistoryPanel {
  public static currentPanel: BlueByrdHistoryPanel | undefined;
  public static readonly viewType = 'blueByrdHistoryPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly stateManager: BlueByrdStateManager;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    stateManager: BlueByrdStateManager,
    selectedId?: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If History panel is already open, reveal it and select target item
    if (BlueByrdHistoryPanel.currentPanel) {
      BlueByrdHistoryPanel.currentPanel.panel.reveal(column);
      if (selectedId) {
        BlueByrdHistoryPanel.currentPanel.panel.webview.postMessage({
          type: 'selectItem',
          historyId: selectedId,
        });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      BlueByrdHistoryPanel.viewType,
      'History',
      { viewColumn: column || vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    const instance = new BlueByrdHistoryPanel(panel, extensionUri, stateManager, selectedId);
    BlueByrdHistoryPanel.currentPanel = instance;
  }

  /**
   * Broadcasts a new history entry live to the open History panel.
   */
  public static notifyNewHistory(entry: RecentRequest): void {
    if (BlueByrdHistoryPanel.currentPanel) {
      BlueByrdHistoryPanel.currentPanel.panel.webview.postMessage({
        type: 'historyAdded',
        entry,
      });
    }
  }

  /**
   * Broadcasts history cleared live to the open History panel.
   */
  public static notifyHistoryCleared(): void {
    if (BlueByrdHistoryPanel.currentPanel) {
      BlueByrdHistoryPanel.currentPanel.panel.webview.postMessage({
        type: 'historyCleared',
      });
    }
  }

  /**
   * Broadcasts item deletion live to the open History panel.
   */
  public static notifyItemDeleted(historyId: string): void {
    if (BlueByrdHistoryPanel.currentPanel) {
      BlueByrdHistoryPanel.currentPanel.panel.webview.postMessage({
        type: 'itemDeleted',
        historyId,
      });
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    stateManager: BlueByrdStateManager,
    selectedId?: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.stateManager = stateManager;

    // Render HTML content
    this.panel.webview.html = getHistoryPanelHtml(this.stateManager.getState(), selectedId);

    // Disposal listener
    this.panel.onDidDispose(
      () => {
        if (BlueByrdHistoryPanel.currentPanel === this) {
          BlueByrdHistoryPanel.currentPanel = undefined;
        }
        while (this.disposables.length) {
          const d = this.disposables.pop();
          if (d) d.dispose();
        }
      },
      null,
      this.disposables
    );

    // Message listener
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.type) {
            case 'openInEditor': {
              const item = message.item as RecentRequest;
              // Open a new request editor populated with this historical run
              await vscode.commands.executeCommand('byrdsnestApiClient.openRequestPanel', {
                id: `replay-${Date.now()}`,
                requestName: item.name ? `${item.name} (Replay)` : `${item.method} ${item.url}`,
                method: item.method,
                url: item.url,
                headers: item.headers,
                body: item.body,
                bodyType: item.bodyType,
                bodyFormData: item.bodyFormData,
                profile: item.profile,
                environment: item.environment,
                collection: item.collection,
                folder: item.folder,
                auth: item.auth,
                variables: item.variables,
                notes: item.notes,
              });
              break;
            }

            case 'saveToCollection': {
              const item = message.item as RecentRequest;
              const colId = message.collectionId;
              const folderId = message.folderId;
              const reqName = message.requestName || item.name || `${item.method} ${item.url}`;

              const targetCol = this.stateManager.getCollection(colId);
              const targetFolder = targetCol?.folders.find((f) => f.id === folderId);

              const newReq: RequestItem = {
                id: `req-${Date.now()}`,
                name: reqName,
                method: item.method,
                url: item.url,
                headers: item.headers || {},
                body: item.body || '',
                bodyType: item.bodyType,
                bodyFormData: item.bodyFormData,
                collection: targetCol?.name || 'Demo Collection',
                collectionId: targetCol?.id,
                folder: targetFolder?.name,
                folderId: targetFolder?.id,
                profile: item.profile,
                environment: item.environment,
                auth: item.auth,
                variables: item.variables,
                notes: item.notes,
              };

              this.stateManager.saveRequest(newReq, targetCol?.id, targetFolder?.id);
              vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
              vscode.window.showInformationMessage(
                `Saved "${reqName}" to ${targetCol?.name}${targetFolder ? ' › ' + targetFolder.name : ''}!`
              );

              // Update collection state in History webview
              this.panel.webview.postMessage({
                type: 'stateUpdated',
                collections: this.stateManager.getCollections(),
              });
              break;
            }

            case 'deleteItem': {
              const id = message.historyId;
              this.stateManager.deleteHistoryItem(id);
              this.panel.webview.postMessage({ type: 'itemDeleted', historyId: id });
              vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
              break;
            }

            case 'clearAll': {
              const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all request history?',
                { modal: true },
                'Clear History'
              );
              if (confirm === 'Clear History') {
                this.stateManager.clearHistory();
                this.panel.webview.postMessage({ type: 'historyCleared' });
                vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
                vscode.window.showInformationMessage('Request history cleared.');
              }
              break;
            }

            case 'copyCurl': {
              if (message.curl) {
                await vscode.env.clipboard.writeText(message.curl);
                vscode.window.showInformationMessage('cURL command copied to clipboard!');
              }
              break;
            }

            case 'copyResponse': {
              if (message.body) {
                await vscode.env.clipboard.writeText(message.body);
                vscode.window.showInformationMessage('Response body copied to clipboard!');
              }
              break;
            }
          }
        } catch (err) {
          vscode.window.showErrorMessage(`History action error: ${err}`);
        }
      },
      null,
      this.disposables
    );
  }
}
