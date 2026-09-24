import * as vscode from 'vscode';
import { BlueByrdStateManager } from './state/stateManager';
import { VariableService } from './services/variableService';
import { AuthService } from './services/authService';
import { HttpService } from './services/httpService';
import { UpdateService } from './services/updateService';
import { BlueByrdExplorerTreeDataProvider } from './views/tree/explorerTreeDataProvider';
import { CommandManager } from './commands/commandManager';

export function activate(context: vscode.ExtensionContext): void {
  try {
    console.log('[bluebyrd] Activating bluebyrd...');

    // 1. Initialize core state and services
    const stateManager = new BlueByrdStateManager(context);
    const variableService = new VariableService(stateManager);
    const authService = new AuthService(stateManager);
    const httpService = new HttpService(stateManager, variableService, authService);
    const updateService = new UpdateService(context);

    // 2. Initialize Tree Data Provider and Tree View
    const explorerProvider = new BlueByrdExplorerTreeDataProvider(stateManager);
    const treeView = vscode.window.createTreeView('blueByrdApiClientExplorer', {
      treeDataProvider: explorerProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(treeView, explorerProvider);

    // 3. Register Commands
    const commandManager = new CommandManager(
      context,
      stateManager,
      explorerProvider,
      httpService,
      variableService,
      authService,
      updateService
    );
    commandManager.registerAll();

    // 4. Check for Updates in Background (throttled to once every 24 hours)
    updateService.checkForUpdates(false).catch((err) => {
      console.warn('[bluebyrd] Background update check error:', err?.message);
    });

    // 5. Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = '$(symbol-structure) bluebyrd';
    statusBarItem.tooltip = 'Open bluebyrd';
    statusBarItem.command = 'blueByrdApiClient.newRequest';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    console.log('[bluebyrd] Extension activated successfully.');
  } catch (error) {
    console.error('[bluebyrd] Failed to activate extension:', error);
    vscode.window.showErrorMessage('bluebyrd failed to start.');
  }
}

export function deactivate(): void {
  console.log('[bluebyrd] Deactivating extension.');
}
