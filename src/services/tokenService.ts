import * as vscode from 'vscode';
import { StoredToken } from '../types';

export class TokenService {
  private readonly secrets?: vscode.SecretStorage;
  private readonly memoryStore = new Map<string, StoredToken[]>();

  constructor(secrets?: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  private getKey(profileId: string): string {
    return `bluebyrd.tokens.${profileId || 'global'}`;
  }

  public async getTokens(profileId: string): Promise<StoredToken[]> {
    if (!this.secrets) {
      return this.memoryStore.get(profileId) || [];
    }
    try {
      const raw = await this.secrets.get(this.getKey(profileId));
      if (!raw) {
        this.memoryStore.set(profileId, []);
        return [];
      }
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [];
      this.memoryStore.set(profileId, arr);
      return arr;
    } catch {
      return this.memoryStore.get(profileId) || [];
    }
  }

  public async setTokens(profileId: string, tokens: StoredToken[]): Promise<void> {
    this.memoryStore.set(profileId, tokens);
    if (this.secrets) {
      await this.secrets.store(this.getKey(profileId), JSON.stringify(tokens));
    }
  }

  public getValidTokenSync(profileId: string, envIdOrName?: string): StoredToken | undefined {
    const tokens = this.memoryStore.get(profileId) || [];
    const now = Date.now();
    const valid = tokens.filter((t) => t.expiresAt > now + 15000);
    if (envIdOrName) {
      const envMatch = valid.find((t) => t.envId === envIdOrName || t.envName === envIdOrName);
      if (envMatch) return envMatch;
    }
    return valid.sort((a, b) => b.expiresAt - a.expiresAt)[0];
  }

  public async saveToken(token: StoredToken): Promise<void> {
    const existing = await this.getTokens(token.profileId);
    const filtered = existing.filter((t) => t.id !== token.id);
    filtered.push(token);
    await this.setTokens(token.profileId, filtered);
  }

  public async deleteToken(profileId: string, tokenId: string): Promise<void> {
    const existing = await this.getTokens(profileId);
    const filtered = existing.filter((t) => t.id !== tokenId);
    await this.setTokens(profileId, filtered);
  }

  public async clearTokens(profileId: string): Promise<void> {
    await this.setTokens(profileId, []);
  }

  public async pruneExpiredTokens(profileId: string): Promise<void> {
    const tokens = await this.getTokens(profileId);
    const now = Date.now();
    const alive = tokens.filter((t) => t.expiresAt > now || !!t.refreshToken);
    if (alive.length !== tokens.length) {
      await this.setTokens(profileId, alive);
    }
  }

  public async getValidToken(profileId: string, envIdOrName?: string): Promise<StoredToken | undefined> {
    const tokens = await this.getTokens(profileId);
    const now = Date.now();
    const valid = tokens.filter((t) => t.expiresAt > now + 15000);
    if (envIdOrName) {
      const envMatch = valid.find((t) => t.envId === envIdOrName || t.envName === envIdOrName);
      if (envMatch) return envMatch;
    }
    return valid.sort((a, b) => b.expiresAt - a.expiresAt)[0];
  }
}
