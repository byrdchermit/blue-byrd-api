import * as vscode from 'vscode';
import * as fs from 'fs';
import { AppState, DEFAULT_PROFILE_COLORS, Profile, StoredToken } from '../../types';
import { BlueByrdStateManager } from '../../state/stateManager';
import { TokenService } from '../../services/tokenService';
import { getGlobalSettingsPanelHtml } from './globalSettingsPanelHtml';
import { BlueByrdPanel } from './requestPanel';

export class BlueByrdGlobalSettingsPanel {
  public static readonly viewType = 'byrdsnestGlobalSettings';
  public static currentPanel?: BlueByrdGlobalSettingsPanel;

  private readonly panel: vscode.WebviewPanel;
  private readonly stateManager: BlueByrdStateManager;
  private readonly tokenService?: TokenService;
  private disposables: vscode.Disposable[] = [];
  private activeTab: string;
  private selectedProfileId?: string;

  public static createOrShow(
    extensionUri: vscode.Uri,
    stateManager: BlueByrdStateManager,
    tokenService?: TokenService,
    initialTab = 'profiles',
    profileId?: string
  ): void {
    if (this.currentPanel) {
      this.currentPanel.activeTab = initialTab;
      if (profileId) this.currentPanel.selectedProfileId = profileId;
      this.currentPanel.refresh();
      this.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      BlueByrdGlobalSettingsPanel.viewType,
      'byrdsnest api client Settings',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    const instance = new BlueByrdGlobalSettingsPanel(
      panel,
      stateManager,
      tokenService,
      initialTab,
      profileId
    );

    this.currentPanel = instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    stateManager: BlueByrdStateManager,
    tokenService?: TokenService,
    initialTab = 'profiles',
    profileId?: string
  ) {
    this.panel = panel;
    this.stateManager = stateManager;
    this.tokenService = tokenService;
    this.activeTab = initialTab;
    this.selectedProfileId = profileId || stateManager.getActiveProfileId();

    this.panel.onDidDispose(() => {
      BlueByrdGlobalSettingsPanel.currentPanel = undefined;
      while (this.disposables.length) {
        const d = this.disposables.pop();
        if (d) d.dispose();
      }
    }, null, this.disposables);

    this.disposables.push(
      this.stateManager.onDidChangeState(() => {
        this.refresh();
      })
    );

    this.panel.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.handleMessage(message);
      } catch (err) {
        console.error('[byrdsnest api client Settings] Message handler error:', err);
      }
    });

    this.refresh();
  }

  public refresh(): void {
    const state = this.stateManager.getState();
    const storedTokens = this.tokenService ? this.tokenService.getAllTokens() : [];
    this.panel.webview.html = getGlobalSettingsPanelHtml(
      state,
      storedTokens,
      this.activeTab,
      this.selectedProfileId
    );
  }

  private async handleMessage(message: any): Promise<void> {
    const { type, payload } = message;

    if (type === 'switchProfileView') {
      this.selectedProfileId = message.profileId;
      this.refresh();
    } else if (type === 'setActiveProfile') {
      const pId = message.profileId === 'global' ? undefined : message.profileId;
      this.stateManager.setActiveProfileId(pId);
      const prof = pId ? this.stateManager.getProfile(pId) : undefined;
      BlueByrdPanel.broadcastActiveProfile(pId || 'global', prof?.name || 'Shared / Global');
      vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
      vscode.window.showInformationMessage(`Active profile set to: ${prof?.name || 'Shared / Global'}`);
      this.refresh();
    } else if (type === 'createProfile') {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter new profile name',
        placeHolder: 'e.g. Staging, Production, Mobile',
        validateInput: (val) => (!val || !val.trim() ? 'Name cannot be empty' : null)
      });
      if (name && name.trim()) {
        const state = this.stateManager.getState();
        const id = `profile-${Date.now()}`;
        const nextColor = DEFAULT_PROFILE_COLORS[state.profiles.length % DEFAULT_PROFILE_COLORS.length].value;
        const newProf: Profile = {
          id,
          name: name.trim(),
          color: nextColor,
          auth: { type: 'none' },
          variables: {},
          headers: {},
        };
        state.profiles.push(newProf);
        state.activeProfileId = id;
        this.stateManager.save(state);
        this.selectedProfileId = id;
        vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
        vscode.window.showInformationMessage(`Profile '${name.trim()}' created and activated.`);
        this.refresh();
      }
    } else if (type === 'deleteProfile') {
      const targetId = message.profileId;
      if (targetId === 'global') {
        vscode.window.showWarningMessage('Cannot delete the Shared / Global scope.');
        return;
      }
      const state = this.stateManager.getState();
      if (state.profiles.length <= 1) {
        vscode.window.showWarningMessage('Cannot delete the last remaining profile.');
        return;
      }
      const prof = state.profiles.find(p => p.id === targetId);
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete profile '${prof?.name || targetId}'?`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        state.profiles = state.profiles.filter(p => p.id !== targetId);
        if (state.activeProfileId === targetId) {
          state.activeProfileId = state.profiles[0]?.id;
        }
        this.selectedProfileId = state.activeProfileId;
        this.stateManager.save(state);
        vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
        vscode.window.showInformationMessage(`Profile deleted.`);
        this.refresh();
      }
    } else if (type === 'deleteToken') {
      if (this.tokenService && message.tokenId && message.profileId) {
        await this.tokenService.deleteToken(message.profileId, message.tokenId);
        vscode.window.showInformationMessage('Token deleted from vault.');
        this.refresh();
      }
    } else if (type === 'pruneTokens') {
      if (this.tokenService) {
        const pruned = await this.tokenService.pruneAllExpiredTokens();
        vscode.window.showInformationMessage(`Pruned ${pruned} expired tokens.`);
        this.refresh();
      }
    } else if (type === 'exportBackup') {
      const state = this.stateManager.getState();
      const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'byrdsnest-backup.json')
        : undefined;
      const fileUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'JSON Files': ['json'] },
        saveLabel: 'Export Workspace State'
      });
      if (fileUri) {
        fs.writeFileSync(fileUri.fsPath, JSON.stringify(state, null, 2), 'utf8');
        vscode.window.showInformationMessage(`Backup exported to ${fileUri.fsPath}`);
      }
    } else if (type === 'importBackup') {
      const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        openLabel: 'Restore Workspace Backup'
      });
      if (fileUris && fileUris[0]) {
        try {
          const raw = fs.readFileSync(fileUris[0].fsPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.stateManager.save(parsed);
            vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
            vscode.window.showInformationMessage('Workspace backup restored successfully.');
            this.refresh();
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to restore backup: ${e.message}`);
        }
      }
    } else if (type === 'setActiveEnvironment') {
      const nextEnv = message.environmentName && message.environmentName.trim() ? message.environmentName.trim() : undefined;
      this.stateManager.setActiveEnvironmentName(nextEnv);
      BlueByrdPanel.broadcastActiveEnvironment(nextEnv || '');
      vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
      vscode.window.showInformationMessage(nextEnv ? `Active environment set to: ${nextEnv}` : 'Active environment cleared (using collection defaults).');
    } else if (type === 'saveSettings') {
      const state = this.stateManager.getState();
      if (!state.settings) {
        state.settings = {};
      }
      Object.assign(state.settings, payload.settings);

      if (payload.activeTab) {
        this.activeTab = payload.activeTab;
      }
      if (payload.profileId) {
        this.selectedProfileId = payload.profileId;
      }

      // Save Profile details
      if (payload.profileId === 'global') {
        if (!state.globalProfile) {
          state.globalProfile = {
            id: 'global',
            name: 'Shared / Global',
            color: '#64748b',
            auth: { type: 'none' },
            variables: {},
            headers: {},
            notes: 'Variables & auth shared across all profiles',
          };
        }
        state.globalProfile.notes = payload.profileNotes || '';
        state.globalProfile.variables = payload.variables || {};
        state.globalProfile.headers = payload.headers || {};
        state.globalProfile.auth = payload.auth || { type: 'none' };
      } else if (payload.profileId) {
        const prof = state.profiles.find(p => p.id === payload.profileId);
        if (prof) {
          if (payload.profileName) prof.name = payload.profileName.trim();
          if (payload.profileColor) prof.color = payload.profileColor.trim();
          prof.notes = payload.profileNotes || '';
          prof.variables = payload.variables || {};
          prof.headers = payload.headers || {};
          prof.auth = payload.auth || { type: 'none' };
          if (payload.profileGuards !== undefined || payload.guards !== undefined) {
            prof.guards = payload.profileGuards || payload.guards;
          }
        }
      }

      // Update active environment
      const nextEnv = payload.activeEnvironment && payload.activeEnvironment.trim() ? payload.activeEnvironment.trim() : undefined;
      state.activeEnvironmentName = nextEnv;

      this.stateManager.save(state);
      BlueByrdPanel.broadcastActiveEnvironment(nextEnv || '');
      BlueByrdPanel.broadcastStateUpdated(state);
      vscode.commands.executeCommand('byrdsnestApiClient.refreshExplorer');
      vscode.window.showInformationMessage('Settings saved successfully.');
      this.panel.webview.postMessage({ type: 'settingsSaved' });
      this.refresh();
    }
  }
}
