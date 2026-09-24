import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContext } from '../types';
import { BlueByrdStateManager } from '../state/stateManager';
import { HttpService } from '../services/httpService';
import { VariableService } from '../services/variableService';
import { AuthService } from '../services/authService';
import { ImportExportService } from '../services/importExportService';
import { UpdateService } from '../services/updateService';
import { BlueByrdPanel } from '../views/panels/requestPanel';
import { BlueByrdSettingsPanel } from '../views/panels/settingsPanel';
import { BlueByrdHistoryPanel } from '../views/panels/historyPanel';
import { BlueByrdExplorerTreeDataProvider } from '../views/tree/explorerTreeDataProvider';
import { BlueByrdTreeItem } from '../views/tree/treeItem';

export class CommandManager {
  private readonly context: vscode.ExtensionContext;
  private readonly stateManager: BlueByrdStateManager;
  private readonly treeProvider: BlueByrdExplorerTreeDataProvider;
  private readonly httpService: HttpService;
  private readonly variableService: VariableService;
  private readonly authService: AuthService;
  private readonly updateService: UpdateService;

  constructor(
    context: vscode.ExtensionContext,
    stateManager: BlueByrdStateManager,
    treeProvider: BlueByrdExplorerTreeDataProvider,
    httpService: HttpService,
    variableService: VariableService,
    authService: AuthService,
    updateService?: UpdateService
  ) {
    this.context = context;
    this.stateManager = stateManager;
    this.treeProvider = treeProvider;
    this.httpService = httpService;
    this.variableService = variableService;
    this.authService = authService;
    this.updateService = updateService || new UpdateService(context);
  }

  public registerAll(): void {
    const s = this.context.subscriptions;

    // Open Sidebar
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.openSidebar', () => {
        vscode.commands.executeCommand('workbench.view.extension.blueByrdApiClient');
      })
    );

    // Refresh Explorer
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.refreshExplorer', () => {
        this.treeProvider.refresh();
      })
    );

    // Open Request Panel
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.openRequestPanel', (payload?: RequestContext) => {
        BlueByrdPanel.createOrShow(
          this.context.extensionUri,
          payload,
          this.stateManager,
          this.httpService,
          this.variableService,
          this.authService
        );
      })
    );

    // Open Dedicated History Inspector Panel (Singleton)
    s.push(
      vscode.commands.registerCommand(
        'blueByrdApiClient.openHistoryPanel',
        (arg?: BlueByrdTreeItem | { historyId?: string } | string) => {
          let selectedId: string | undefined;
          if (arg instanceof BlueByrdTreeItem) {
            selectedId = arg.itemId;
          } else if (typeof arg === 'string') {
            selectedId = arg;
          } else if (arg && typeof arg === 'object') {
            selectedId = (arg as any).historyId || (arg as any).itemId || (arg as any).id;
          }

          BlueByrdHistoryPanel.createOrShow(
            this.context.extensionUri,
            this.stateManager,
            selectedId
          );
        }
      )
    );

    // Clear History
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.clearHistory', async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Are you sure you want to clear all request history?',
          { modal: true },
          'Clear History'
        );
        if (confirm === 'Clear History') {
          this.stateManager.clearHistory();
          this.treeProvider.refresh();
          vscode.window.showInformationMessage('Request history cleared.');
          BlueByrdHistoryPanel.notifyHistoryCleared();
        }
      })
    );

    // New Request
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.newRequest', (treeItem?: BlueByrdTreeItem) => {
        const state = this.stateManager.getState();
        const activeProfile = state.activeProfileId && state.activeProfileId !== 'all'
          ? this.stateManager.getProfile(state.activeProfileId)
          : state.profiles[0];
        const activeEnv = state.activeEnvironmentName || Object.keys(state.environments)[0] || 'Local';

        const collection = treeItem?.kind === 'collection'
          ? treeItem.label
          : treeItem?.kind === 'folder' && treeItem.parentId
          ? state.collections.find((c) => c.id === treeItem.parentId)?.name || state.collections[0]?.name
          : state.collections[0]?.name || 'Demo Collection';

        const folder = treeItem?.kind === 'folder' ? treeItem.label : undefined;

        BlueByrdPanel.createOrShow(
          this.context.extensionUri,
          {
            method: 'GET',
            url: '{{baseUrl}}/',
            collection,
            folder,
            profile: activeProfile?.name || state.profiles[0]?.name,
            environment: activeEnv,
          },
          this.stateManager,
          this.httpService,
          this.variableService,
          this.authService
        );
      })
    );

    // Switch Active Profile Scope
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.switchActiveProfile', async () => {
        const state = this.stateManager.getState();
        const activeProfileId = state.activeProfileId;

        const items: Array<vscode.QuickPickItem & { profileId?: string }> = [
          {
            label: '$(globe) All Profiles (Global Scope)',
            description: (!activeProfileId || activeProfileId === 'all') ? 'Current Active Scope' : '',
            profileId: 'all',
          },
        ];

        for (const p of state.profiles) {
          const isCurrent = activeProfileId === p.id || activeProfileId === p.name;
          items.push({
            label: `$(account) ${p.name}`,
            description: isCurrent ? 'Current Active Scope' : '',
            profileId: p.id,
          });
        }

        items.push({
          label: '$(add) Create New Profile...',
          profileId: '__create__',
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select workspace profile scope',
        });

        if (!selected) return;

        if (selected.profileId === '__create__') {
          vscode.commands.executeCommand('blueByrdApiClient.createProfile');
          return;
        }

        const newId = selected.profileId === 'all' ? undefined : selected.profileId;
        this.stateManager.setActiveProfileId(newId);
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(`Active profile scope set to: ${selected.label.replace(/^\$\([^)]+\)\s*/, '')}`);
      })
    );

    // Set Active Profile Directly (e.g. from context menu)
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.setActiveProfile', (arg?: BlueByrdTreeItem | { id?: string; name?: string } | string) => {
        let profileId: string | undefined;
        let profileName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          profileId = arg.itemId;
          profileName = arg.label;
        } else if (typeof arg === 'string') {
          profileId = arg;
        } else if (arg && typeof arg === 'object') {
          profileId = (arg as any).itemId || arg.id;
          profileName = arg.name || (arg as any).label;
        }

        const profile = this.stateManager.getProfile(profileId) || this.stateManager.getProfile(profileName);
        if (profile) {
          this.stateManager.setActiveProfileId(profile.id);
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Active profile scope set to: ${profile.name}`);
        }
      })
    );

    // Switch Active Environment
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.switchActiveEnvironment', async () => {
        const state = this.stateManager.getState();
        const activeEnvName = state.activeEnvironmentName;
        const envEntries = Object.entries(state.environments);

        if (envEntries.length === 0) {
          vscode.window.showWarningMessage('No environments available.');
          return;
        }

        const items: Array<vscode.QuickPickItem & { envName?: string }> = envEntries.map(([name, env]) => {
          const isCurrent = activeEnvName === name || (env.id && activeEnvName === env.id);
          const parts: string[] = [];
          if (env.baseUrl) parts.push(env.baseUrl);
          if (env.inheritsFrom) parts.push(`inherits: ${env.inheritsFrom}`);
          if (isCurrent) parts.push('Current Active');
          return {
            label: `$(globe) ${name}`,
            description: parts.join(' • '),
            envName: name,
          };
        });

        items.push({
          label: '$(add) Create New Environment...',
          envName: '__create__',
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select active environment',
        });

        if (!selected) return;

        if (selected.envName === '__create__') {
          vscode.commands.executeCommand('blueByrdApiClient.createEnvironment');
          return;
        }

        this.stateManager.setActiveEnvironmentName(selected.envName);
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(`Active environment set to: ${selected.envName}`);
      })
    );

    // Set Active Environment Directly (e.g. from context menu)
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.setActiveEnvironment', (arg?: BlueByrdTreeItem | { id?: string; name?: string } | string) => {
        let envName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          envName = arg.label;
        } else if (typeof arg === 'string') {
          envName = this.stateManager.getEnvironmentName(arg) || arg;
        } else if (arg && typeof arg === 'object') {
          envName = arg.name || (arg as any).label || this.stateManager.getEnvironmentName(arg.id);
        }

        if (envName) {
          this.stateManager.setActiveEnvironmentName(envName);
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Active environment set to: ${envName}`);
        }
      })
    );

    // Switch Context (Profile or Environment)
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.switchContext', async () => {
        const state = this.stateManager.getState();
        const activeProfile = state.activeProfileId && state.activeProfileId !== 'all'
          ? this.stateManager.getProfile(state.activeProfileId)
          : undefined;
        const profileLabel = activeProfile ? activeProfile.name : 'All Profiles (Global)';
        const envLabel = state.activeEnvironmentName || Object.keys(state.environments)[0] || 'None';

        const choice = await vscode.window.showQuickPick([
          {
            label: '$(account) Switch Active Profile Scope',
            description: `Current: ${profileLabel}`,
            action: 'profile',
          },
          {
            label: '$(globe) Switch Active Environment',
            description: `Current: ${envLabel}`,
            action: 'environment',
          },
        ], {
          placeHolder: 'Select context to switch',
        });

        if (!choice) return;
        if (choice.action === 'profile') {
          vscode.commands.executeCommand('blueByrdApiClient.switchActiveProfile');
        } else {
          vscode.commands.executeCommand('blueByrdApiClient.switchActiveEnvironment');
        }
      })
    );

    // Assign Profile Scope to Environment or Collection
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.assignProfileScope', async (arg?: BlueByrdTreeItem) => {
        if (!arg || !arg.itemId) return;

        const state = this.stateManager.getState();
        const profiles = state.profiles;

        const picks: Array<vscode.QuickPickItem & { profileId?: string }> = [
          {
            label: '$(globe) Global / Shared (All Profiles)',
            profileId: undefined,
          },
        ];

        for (const p of profiles) {
          picks.push({
            label: `$(account) ${p.name}`,
            profileId: p.id,
          });
        }

        const selected = await vscode.window.showQuickPick(picks, {
          placeHolder: `Assign profile scope for '${arg.label}'`,
        });

        if (selected === undefined) return;

        if (arg.kind === 'environment') {
          const env = this.stateManager.getEnvironment(arg.itemId) || this.stateManager.getEnvironment(arg.label);
          const envName = this.stateManager.getEnvironmentName(arg.itemId || arg.label) || arg.label;
          if (env) {
            env.profileId = selected.profileId;
            this.stateManager.saveEnvironment(envName, env);
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Scope for environment '${envName}' updated.`);
          }
        } else if (arg.kind === 'collection') {
          const col = this.stateManager.getCollection(arg.itemId) || this.stateManager.getCollection(arg.label);
          if (col) {
            col.profileId = selected.profileId;
            this.stateManager.saveCollection(col);
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`Scope for collection '${col.name}' updated.`);
          }
        }
      })
    );

    // Create Profile
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.createProfile', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new profile',
          placeHolder: 'e.g. Staging Team',
        });
        if (name && name.trim()) {
          const newProfile = this.stateManager.createProfile(name.trim());
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Profile '${newProfile.name}' created.`);
          BlueByrdSettingsPanel.createOrShow(
            this.context.extensionUri,
            'profile',
            newProfile.name,
            this.stateManager,
            undefined,
            newProfile.id
          );
        }
      })
    );

    // Create Environment
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.createEnvironment', async (treeItem?: BlueByrdTreeItem) => {
        let profileId: string | undefined;
        if (treeItem?.kind === 'profile') {
          profileId = treeItem.itemId !== 'global' ? treeItem.itemId : undefined;
        } else if (treeItem?.parentId) {
          profileId = treeItem.parentId !== 'global' ? treeItem.parentId : undefined;
        } else {
          profileId = this.stateManager.getActiveProfileId();
        }

        const name = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new environment',
          placeHolder: 'e.g. Staging or QA-West',
        });
        if (name && name.trim()) {
          const result = this.stateManager.createEnvironment(name.trim(), undefined, profileId);
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Environment '${result.name}' created.`);
          BlueByrdSettingsPanel.createOrShow(
            this.context.extensionUri,
            'environment',
            result.name,
            this.stateManager,
            undefined,
            result.env.id
          );
        }
      })
    );

    // Create Collection
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.createCollection', async (treeItem?: BlueByrdTreeItem) => {
        let profileId: string | undefined;
        if (treeItem?.kind === 'profile') {
          profileId = treeItem.itemId !== 'global' ? treeItem.itemId : undefined;
        } else if (treeItem?.parentId) {
          profileId = treeItem.parentId !== 'global' ? treeItem.parentId : undefined;
        } else {
          profileId = this.stateManager.getActiveProfileId();
        }

        const name = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new collection',
          placeHolder: 'e.g. Payments API',
        });
        if (name && name.trim()) {
          this.stateManager.createCollection(name.trim(), profileId);
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Collection '${name.trim()}' created.`);
        }
      })
    );

    // Create Folder
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.createFolder', async (treeItem?: BlueByrdTreeItem) => {
        const state = this.stateManager.getState();
        let targetCollectionId = treeItem?.kind === 'collection' ? treeItem.itemId : undefined;

        if (!targetCollectionId) {
          const picks = state.collections.map((c) => ({ label: c.name, id: c.id }));
          if (picks.length === 0) {
            vscode.window.showWarningMessage('Please create a collection first.');
            return;
          }
          const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a collection for the folder' });
          if (!selected) return;
          targetCollectionId = selected.id;
        }

        const folderName = await vscode.window.showInputBox({
          prompt: 'Enter folder name',
          placeHolder: 'e.g. Authentication',
        });

        if (folderName && folderName.trim()) {
          this.stateManager.createFolder(targetCollectionId, folderName.trim());
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Folder '${folderName.trim()}' created.`);
        }
      })
    );

    // Duplicate Request
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.duplicateRequest', (treeItem?: BlueByrdTreeItem) => {
        const reqId = treeItem?.itemId;
        if (!reqId) return;

        const duplicated = this.stateManager.duplicateRequest(reqId);
        if (duplicated) {
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Duplicated request as '${duplicated.name}'.`);
        }
      })
    );

    // Delete Item
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.deleteItem', async (treeItem?: BlueByrdTreeItem) => {
        if (!treeItem || !treeItem.itemId) return;

        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete '${treeItem.label}'?`,
          { modal: true },
          'Delete'
        );

        if (confirm === 'Delete') {
          this.stateManager.deleteItem(treeItem.kind, treeItem.itemId, treeItem.parentId);
          if (treeItem.kind === 'history') {
            BlueByrdHistoryPanel.notifyItemDeleted(treeItem.itemId);
          }
          this.treeProvider.refresh();
          vscode.window.showInformationMessage(`Deleted '${treeItem.label}'.`);
        }
      })
    );

    // Edit Settings Commands
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.editProfile', (arg?: BlueByrdTreeItem | { id?: string; name?: string } | string) => {
        let profileId: string | undefined;
        let profileName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          profileId = arg.itemId;
          profileName = arg.label;
        } else if (typeof arg === 'string') {
          profileId = arg;
        } else if (arg && typeof arg === 'object') {
          profileId = (arg as any).itemId || arg.id;
          profileName = arg.name || (arg as any).label;
        }

        const profile = this.stateManager.getProfile(profileId) || this.stateManager.getProfile(profileName) || this.stateManager.getState().profiles[0];
        if (profile) {
          BlueByrdSettingsPanel.createOrShow(
            this.context.extensionUri,
            'profile',
            profile.name,
            this.stateManager,
            undefined,
            profile.id
          );
        }
      })
    );

    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.editEnvironment', (arg?: BlueByrdTreeItem | { id?: string; name?: string } | string) => {
        let envId: string | undefined;
        let envName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          envId = arg.itemId;
          envName = arg.label;
        } else if (typeof arg === 'string') {
          envId = arg;
        } else if (arg && typeof arg === 'object') {
          envId = (arg as any).itemId || arg.id;
          envName = arg.name || (arg as any).label;
        }

        const env = this.stateManager.getEnvironment(envId) || this.stateManager.getEnvironment(envName);
        const resolvedName = this.stateManager.getEnvironmentName(envId || envName) || envName || 'Local';
        if (env) {
          BlueByrdSettingsPanel.createOrShow(
            this.context.extensionUri,
            'environment',
            resolvedName,
            this.stateManager,
            undefined,
            env.id
          );
        }
      })
    );

    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.editCollection', (arg?: BlueByrdTreeItem | { id?: string; name?: string } | string) => {
        let colId: string | undefined;
        let colName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          colId = arg.itemId;
          colName = arg.label;
        } else if (typeof arg === 'string') {
          colId = arg;
        } else if (arg && typeof arg === 'object') {
          colId = (arg as any).itemId || arg.id;
          colName = arg.name || (arg as any).label;
        }

        const col = this.stateManager.getCollection(colId) || this.stateManager.getCollection(colName);
        if (col) {
          BlueByrdSettingsPanel.createOrShow(
            this.context.extensionUri,
            'collection',
            col.name,
            this.stateManager,
            undefined,
            col.id
          );
        }
      })
    );

    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.editFolder', (arg?: BlueByrdTreeItem | { collection?: string; folder?: string; collectionId?: string; folderId?: string }) => {
        let folderId: string | undefined;
        let folderName: string | undefined;
        let colIdOrName: string | undefined;

        if (arg instanceof BlueByrdTreeItem) {
          folderId = arg.itemId;
          folderName = arg.label;
          colIdOrName = arg.parentId;
        } else if (arg && typeof arg === 'object') {
          folderId = arg.folderId;
          folderName = arg.folder;
          colIdOrName = arg.collectionId || arg.collection;
        }

        const col = this.stateManager.getCollection(colIdOrName);
        const colName = col?.name || (typeof colIdOrName === 'string' ? colIdOrName : undefined);
        BlueByrdSettingsPanel.createOrShow(
          this.context.extensionUri,
          'folder',
          folderName || 'Folder',
          this.stateManager,
          colName,
          folderId
        );
      })
    );

    // Import JSON (Postman, OpenAPI, bluebyrd Collection/Environment/Backup)
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.importJson', async () => {
        try {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import JSON',
            filters: {
              'API & Collection JSON': ['json'],
            },
          });

          if (!uris || uris.length === 0) return;

          const filePath = uris[0].fsPath;
          const content = await fs.promises.readFile(filePath, 'utf8');
          const result = ImportExportService.parse(content);

          if (result.type === 'postman-collection' || result.type === 'openapi' || result.type === 'bluebyrd-collection') {
            this.stateManager.saveCollection(result.collection);
            this.treeProvider.refresh();
            const directReqs = result.collection.requests.length;
            const folderReqs = result.collection.folders.reduce((acc, f) => acc + f.requests.length, 0);
            const totalReqs = directReqs + folderReqs;
            vscode.window.showInformationMessage(
              `Imported collection '${result.collection.name}' (${totalReqs} request${totalReqs === 1 ? '' : 's'}, ${result.collection.folders.length} folder${result.collection.folders.length === 1 ? '' : 's'}).`
            );
          } else if (result.type === 'postman-environment' || result.type === 'bluebyrd-environment') {
            this.stateManager.saveEnvironment(result.environmentName, result.environment);
            this.treeProvider.refresh();
            const varCount = Object.keys(result.environment.variables || {}).length;
            vscode.window.showInformationMessage(
              `Imported environment '${result.environmentName}' (${varCount} variable${varCount === 1 ? '' : 's'}).`
            );
          } else if (result.type === 'bluebyrd-backup') {
            const choice = await vscode.window.showWarningMessage(
              'How would you like to restore this workspace backup?',
              { modal: true },
              'Merge with Existing',
              'Replace Entire Workspace'
            );
            if (!choice) return;

            if (choice === 'Replace Entire Workspace') {
              this.stateManager.save(this.stateManager.normalizeState(result.state));
              this.treeProvider.refresh();
              const totalReqs = result.state.collections.reduce(
                (acc, c) => acc + c.requests.length + c.folders.reduce((facc, f) => facc + f.requests.length, 0),
                0
              );
              vscode.window.showInformationMessage(
                `Workspace replaced from backup: ${result.state.collections.length} collections (${totalReqs} requests), ${Object.keys(result.state.environments).length} environments, ${result.state.profiles.length} profile.`
              );
            } else {
              // Merge
              const currentState = this.stateManager.getState();
              for (const p of result.state.profiles) {
                if (!currentState.profiles.some((cp) => cp.id === p.id || cp.name === p.name)) {
                  currentState.profiles.push(p);
                }
              }
              for (const [k, e] of Object.entries(result.state.environments)) {
                currentState.environments[k] = e;
              }
              for (const col of result.state.collections) {
                if (!currentState.collections.some((cc) => cc.id === col.id)) {
                  currentState.collections.push(col);
                } else {
                  col.id = `col-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                  currentState.collections.push(col);
                }
              }
              if (Array.isArray(result.state.history) && result.state.history.length > 0) {
                for (const h of result.state.history) {
                  if (!currentState.history.some((ch) => ch.id === h.id)) {
                    currentState.history.push(h);
                  }
                }
              }
              this.stateManager.save(this.stateManager.normalizeState(currentState));
              this.treeProvider.refresh();
              const totalReqs = result.state.collections.reduce(
                (acc, c) => acc + c.requests.length + c.folders.reduce((facc, f) => facc + f.requests.length, 0),
                0
              );
              vscode.window.showInformationMessage(
                `Workspace merged with backup: imported ${result.state.collections.length} collections (${totalReqs} requests), ${Object.keys(result.state.environments).length} environments.`
              );
            }
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Import failed: ${err?.message || 'Unknown error'}`);
        }
      })
    );

    // Export Collection as JSON
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.exportCollection', async (arg?: BlueByrdTreeItem | { id?: string; name?: string }) => {
        try {
          const state = this.stateManager.getState();
          let targetCollectionId: string | undefined;

          if (arg instanceof BlueByrdTreeItem) {
            targetCollectionId = arg.itemId;
          } else if (arg && typeof arg === 'object') {
            targetCollectionId = arg.id || arg.name;
          }

          let col = this.stateManager.getCollection(targetCollectionId);
          if (!col) {
            const picks = state.collections.map((c) => ({ label: c.name, id: c.id }));
            if (picks.length === 0) {
              vscode.window.showWarningMessage('No collections available to export.');
              return;
            }
            const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a collection to export' });
            if (!selected) return;
            col = this.stateManager.getCollection(selected.id);
          }

          if (!col) return;

          const exportJson = ImportExportService.exportCollection(col);
          const slug = col.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'collection';
          const defaultUri = vscode.Uri.file(`${slug}.bluebyrd-collection.json`);

          const targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { 'JSON Files': ['json'] },
            saveLabel: 'Export Collection',
          });

          if (!targetUri) return;

          await fs.promises.writeFile(targetUri.fsPath, exportJson, 'utf8');
          vscode.window.showInformationMessage(`Collection '${col.name}' exported to ${path.basename(targetUri.fsPath)}.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Export collection failed: ${err?.message || 'Unknown error'}`);
        }
      })
    );

    // Export Environment as JSON
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.exportEnvironment', async (arg?: BlueByrdTreeItem | { id?: string; name?: string }) => {
        try {
          const state = this.stateManager.getState();
          let targetEnvName: string | undefined;

          if (arg instanceof BlueByrdTreeItem) {
            targetEnvName = arg.label;
          } else if (arg && typeof arg === 'object') {
            targetEnvName = arg.name || arg.id;
          }

          let env = this.stateManager.getEnvironment(targetEnvName);
          let envName = this.stateManager.getEnvironmentName(targetEnvName) || targetEnvName;

          if (!env || !envName) {
            const picks = Object.keys(state.environments).map((name) => ({ label: name }));
            if (picks.length === 0) {
              vscode.window.showWarningMessage('No environments available to export.');
              return;
            }
            const selected = await vscode.window.showQuickPick(picks, { placeHolder: 'Select an environment to export' });
            if (!selected) return;
            envName = selected.label;
            env = this.stateManager.getEnvironment(envName);
          }

          if (!env || !envName) return;

          const exportJson = ImportExportService.exportEnvironment(envName, env);
          const slug = envName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'environment';
          const defaultUri = vscode.Uri.file(`${slug}.bluebyrd-environment.json`);

          const targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { 'JSON Files': ['json'] },
            saveLabel: 'Export Environment',
          });

          if (!targetUri) return;

          await fs.promises.writeFile(targetUri.fsPath, exportJson, 'utf8');
          vscode.window.showInformationMessage(`Environment '${envName}' exported to ${path.basename(targetUri.fsPath)}.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Export environment failed: ${err?.message || 'Unknown error'}`);
        }
      })
    );

    // Export Full Workspace Backup as JSON
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.exportBackup', async () => {
        try {
          const state = this.stateManager.getState();
          const exportJson = ImportExportService.exportBackup(state);
          const dateStr = new Date().toISOString().slice(0, 10);
          const defaultUri = vscode.Uri.file(`bluebyrd-backup-${dateStr}.json`);

          const targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { 'JSON Files': ['json'] },
            saveLabel: 'Export Workspace Backup',
          });

          if (!targetUri) return;

          await fs.promises.writeFile(targetUri.fsPath, exportJson, 'utf8');
          vscode.window.showInformationMessage(`Workspace backup exported to ${path.basename(targetUri.fsPath)}.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Export backup failed: ${err?.message || 'Unknown error'}`);
        }
      })
    );

    // Check for Updates
    s.push(
      vscode.commands.registerCommand('blueByrdApiClient.checkForUpdates', async () => {
        await this.updateService.checkForUpdates(true);
      })
    );
  }
}

