import * as vscode from 'vscode';
import { BlueByrdStateManager } from './state/stateManager';
import { VariableService } from './services/variableService';
import { AuthService } from './services/authService';
import { TokenService } from './services/tokenService';
import { HttpService } from './services/httpService';
import { UpdateService } from './services/updateService';
import {
  BlueByrdProfilesTreeProvider,
  BlueByrdCollectionsTreeProvider,
  BlueByrdEnvironmentsTreeProvider,
  BlueByrdHistoryTreeProvider,
  BlueByrdTreeCoordinator,
} from './views/tree';
import { CommandManager } from './commands/commandManager';

export function activate(context: vscode.ExtensionContext): void {
  try {
    console.log('[bluebyrd] Activating bluebyrd...');

    // 1. Initialize core state and services
    const stateManager = new BlueByrdStateManager(context);
    const tokenService = new TokenService(context.secrets);
    const variableService = new VariableService(stateManager);
    const authService = new AuthService(stateManager, tokenService);
    const httpService = new HttpService(stateManager, variableService, authService);
    const updateService = new UpdateService(context);

    // 2. Initialize Dedicated Breakout Tree Providers
    const profilesProvider = new BlueByrdProfilesTreeProvider(stateManager, tokenService);
    const collectionsProvider = new BlueByrdCollectionsTreeProvider(stateManager);
    const environmentsProvider = new BlueByrdEnvironmentsTreeProvider(stateManager);
    const historyProvider = new BlueByrdHistoryTreeProvider(stateManager);

    // Dynamic Status Bar Item (Context & Scope Indicator)
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    const updateStatusBar = () => {
      const state = stateManager.getState();
      const activeProfile =
        state.activeProfileId && state.activeProfileId !== 'all'
          ? stateManager.getProfile(state.activeProfileId)
          : undefined;
      const profileLabel = activeProfile ? activeProfile.name : 'Global';
      const envLabel =
        state.activeEnvironmentName || Object.keys(state.environments)[0] || 'None';

      statusBarItem.text = `$(account) ${profileLabel} $(globe) ${envLabel}`;
      statusBarItem.tooltip = `Active Profile Scope: ${profileLabel}\nActive Environment: ${envLabel}\nClick to switch profile or environment context`;
      statusBarItem.command = 'blueByrdApiClient.switchContext';
    };

    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Coordinator that refreshes all views and synchronizes status bar
    const treeCoordinator = new BlueByrdTreeCoordinator(
      profilesProvider,
      collectionsProvider,
      environmentsProvider,
      historyProvider,
      updateStatusBar
    );

    // Register all 4 native view accordions
    const profilesView = vscode.window.createTreeView('blueByrdProfiles', {
      treeDataProvider: profilesProvider,
    });
    const collectionsView = vscode.window.createTreeView('blueByrdCollections', {
      treeDataProvider: collectionsProvider,
      dragAndDropController: collectionsProvider,
      canSelectMany: true,
      showCollapseAll: true,
    });
    const environmentsView = vscode.window.createTreeView('blueByrdEnvironments', {
      treeDataProvider: environmentsProvider,
      showCollapseAll: true,
    });
    const historyView = vscode.window.createTreeView('blueByrdHistory', {
      treeDataProvider: historyProvider,
    });

    context.subscriptions.push(
      treeCoordinator,
      profilesView,
      collectionsView,
      environmentsView,
      historyView
    );

    // 3. Register Commands
    const commandManager = new CommandManager(
      context,
      stateManager,
      treeCoordinator,
      httpService,
      variableService,
      authService,
      updateService,
      tokenService
    );
    commandManager.registerAll();

    // 4. Check for Updates in Background (throttled to once every 24 hours)
    updateService.checkForUpdates(false).catch((err) => {
      console.warn('[bluebyrd] Background update check error:', err?.message);
    });

    console.log('[bluebyrd] Extension activated successfully with breakout views.');
  } catch (error) {
    console.error('[bluebyrd] Failed to activate extension:', error);
    vscode.window.showErrorMessage('bluebyrd failed to start.');
  }
}

export function deactivate(): void {
  console.log('[bluebyrd] Deactivating extension.');
}
