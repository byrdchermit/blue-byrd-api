import { AuthSettings, ProfileAuth } from '../types';
import { BlueByrdStateManager } from '../state/stateManager';
import { TokenService } from './tokenService';

export class AuthService {
  private readonly stateManager: BlueByrdStateManager;
  private readonly tokenService?: TokenService;

  constructor(stateManager: BlueByrdStateManager, tokenService?: TokenService) {
    this.stateManager = stateManager;
    this.tokenService = tokenService;
  }

  /**
   * Resolves authentication headers based on request, folder, collection, environment, and profile settings.
   */
  public resolveAuthHeaders(
    profileNameOrId?: string,
    environmentNameOrId?: string,
    collectionNameOrId?: string,
    folderNameOrId?: string,
    existingHeaders: Record<string, string> = {},
    requestAuth?: AuthSettings
  ): Record<string, string> {
    const merged = { ...existingHeaders };

    // Retrieve hierarchy sources first so applyAuth has profile & environment context
    const profile = this.stateManager.getProfile(profileNameOrId);
    const environment = this.stateManager.getEnvironment(environmentNameOrId);
    const collection = this.stateManager.getCollection(collectionNameOrId);
    const folder = collection && folderNameOrId
      ? collection.folders.find((f) => f.id === folderNameOrId || f.name === folderNameOrId)
      : undefined;

    const applyAuth = (auth?: ProfileAuth) => {
      if (!auth || auth.type === 'none') {
        return;
      }

      if (auth.type === 'bearer' || auth.type === 'oauth2') {
        let tokenValue = auth.token?.trim() ?? '';
        if (auth.selectedTokenId && this.tokenService) {
          const found = this.tokenService.getAllTokens().find((t) => t.id === auth.selectedTokenId);
          if (found && found.accessToken) {
            tokenValue = found.accessToken;
          }
        }
        if (!tokenValue && auth.type === 'oauth2' && this.tokenService) {
          const stored = this.tokenService.getValidTokenSync(
            profile?.id || profileNameOrId || 'global',
            environment?.id || environmentNameOrId
          );
          if (stored) {
            tokenValue = stored.accessToken;
          }
        }
        if (!tokenValue) return;
        const header = auth.headerName?.trim() || 'Authorization';
        const prefix = auth.headerPrefix !== undefined && auth.headerPrefix !== '' ? auth.headerPrefix.trim() : 'Bearer';
        merged[header] = prefix ? `${prefix} ${tokenValue}` : tokenValue;
      } else if (auth.type === 'apiKey') {
        const tokenValue = auth.token?.trim() ?? '';
        if (!tokenValue) return;
        const header = auth.headerName?.trim() || auth.keyName?.trim() || 'X-API-Key';
        merged[header] = tokenValue;
      } else if (auth.type === 'basic') {
        const header = auth.headerName?.trim() || 'Authorization';
        const user = auth.username ?? '';
        const pass = auth.password ?? auth.token ?? '';
        if (user || pass) {
          const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
          merged[header] = `Basic ${encoded}`;
        }
      }
    };

    // Check request-level override
    if (requestAuth?.auth && requestAuth.auth.type !== 'none') {
      applyAuth(requestAuth.auth);
      return merged;
    }

    // Determine inheritance permissions
    const inheritProfile = requestAuth?.inheritFromProfile !== false;
    const inheritEnvironment = requestAuth?.inheritFromEnvironment !== false;
    const inheritCollection = requestAuth?.inheritFromCollection !== false;
    const inheritFolder = requestAuth?.inheritFromFolder !== false;

    // 1. Folder level
    if (inheritFolder && folder?.auth?.auth && folder.auth.auth.type !== 'none') {
      applyAuth(folder.auth.auth);
      return merged;
    }

    // 2. Collection level
    if (inheritCollection && collection?.auth?.auth && collection.auth.auth.type !== 'none') {
      applyAuth(collection.auth.auth);
      return merged;
    }

    // 3. Environment level
    if (inheritEnvironment && environment?.auth && environment.auth.type !== 'none') {
      applyAuth(environment.auth);
      return merged;
    }

    // 4. Profile level
    if (inheritProfile && profile?.auth && profile.auth.type !== 'none') {
      applyAuth(profile.auth);
      return merged;
    }

    return merged;
  }
}

