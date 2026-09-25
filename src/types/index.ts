import * as vscode from 'vscode';

export type SidebarNodeKind =
  | 'section'
  | 'active-filter'
  | 'profile'
  | 'environment'
  | 'collection'
  | 'folder'
  | 'request'
  | 'history'
  | 'token'
  | 'noTokens';

export interface StoredToken {
  id: string;
  profileId: string;
  envName?: string;
  envId?: string;
  tokenName?: string;
  tier?: string;
  accessToken: string;
  tokenType?: string;
  refreshToken?: string;
  expiresAt: number;
  createdAt: number;
  scopes?: string[];
  configHash?: string;
}

export type RequestContext = {
  id?: string;
  requestId?: string;
  profile?: string;
  profileId?: string;
  environment?: string;
  environmentId?: string;
  collection?: string;
  collectionId?: string;
  folder?: string;
  folderId?: string;
  requestName?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  bodyType?: BodyType;
  bodyFormData?: FormDataItem[];
  auth?: AuthSettings;
  notes?: string;
  variables?: VariableItem[];
  preRequestScript?: string;
  postResponseScript?: string;
};

export type BodyType = 'none' | 'json' | 'form-urlencoded' | 'form-data' | 'text' | 'xml' | 'raw';

export type FormDataItem = {
  key: string;
  value: string;
  enabled: boolean;
  type?: 'text' | 'file';
};

export type VariableItem = {
  name: string;
  value: string;
  enabled: boolean;
  hidden?: boolean;
};

export type ProfileAuth = {
  type: 'none' | 'bearer' | 'apiKey' | 'oauth2' | 'basic';
  token?: string;
  headerName?: string;
  keyName?: string;
  headerPrefix?: string;
  addTo?: 'header' | 'query';
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  grantType?: 'authorization_code' | 'client_credentials' | 'implicit' | 'password';
};

export type AuthSettings = {
  inheritFromProfile?: boolean;
  inheritFromEnvironment?: boolean;
  inheritFromCollection?: boolean;
  inheritFromFolder?: boolean;
  auth?: ProfileAuth;
};

export type RequestItem = {
  id: string;
  name: string;
  method: string;
  url: string;
  folder?: string;
  folderId?: string;
  collection: string;
  collectionId?: string;
  headers: Record<string, string>;
  body: string;
  bodyType?: BodyType;
  bodyFormData?: FormDataItem[];
  profile?: string;
  environment?: string;
  auth?: AuthSettings;
  notes?: string;
  variables?: VariableItem[];
  preRequestScript?: string;
  postResponseScript?: string;
};

export type TestResultItem = {
  name: string;
  passed: boolean;
  error?: string;
};

export type ScriptConsoleLog = {
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
};

export type CollectionFolder = {
  id: string;
  name: string;
  requests: RequestItem[];
  auth?: AuthSettings;
  notes?: string;
  variables?: Record<string, string>;
  headers?: Record<string, string>;
  inheritsFrom?: string;
};

export type Collection = {
  id: string;
  name: string;
  folders: CollectionFolder[];
  requests: RequestItem[];
  auth?: AuthSettings;
  notes?: string;
  variables?: Record<string, string>;
  headers?: Record<string, string>;
  inheritsFrom?: string;
  profileId?: string;
};

export type ResponseMetadata = {
  ok: boolean;
  status: number;
  statusText: string;
  elapsedMs: number;
  sizeBytes?: number;
  headers: Record<string, string>;
  body: string;
  testResults?: TestResultItem[];
  consoleLogs?: ScriptConsoleLog[];
};

export type RecentRequest = RequestItem & {
  timestamp: string;
  responseStatus?: number;
  responseStatusText?: string;
  elapsedMs?: number;
  resolvedUrl?: string;
  responseSizeBytes?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseOk?: boolean;
  testResults?: TestResultItem[];
  consoleLogs?: ScriptConsoleLog[];
};

export type Profile = {
  id: string;
  name: string;
  auth: ProfileAuth;
  variables?: Record<string, string>;
  headers?: Record<string, string>;
  inheritsFrom?: string;
  notes?: string;
};

export type EnvironmentConfig = {
  id: string;
  baseUrl: string;
  apiKey?: string;
  auth?: ProfileAuth;
  variables?: Record<string, string>;
  headers?: Record<string, string>;
  inheritsFrom?: string;
  notes?: string;
  profileId?: string;
};

export type AppState = {
  profiles: Profile[];
  environments: Record<string, EnvironmentConfig>;
  collections: Collection[];
  history: RecentRequest[];
  activeProfileId?: string;
  activeEnvironmentName?: string;
};

export type VariableSourceKind =
  | 'profile'
  | 'parent-environment'
  | 'environment'
  | 'collection'
  | 'folder'
  | 'dynamic';

export type InheritedVariableInfo = {
  key: string;
  value: string;
  source: VariableSourceKind;
  sourceName: string;
  isOverridden?: boolean;
};

export interface VariableResolutionResult {
  resolved: Record<string, string>;
  inherited: InheritedVariableInfo[];
  overriddenKeys: string[];
}

export type HeaderSourceKind =
  | 'profile'
  | 'parent-environment'
  | 'environment'
  | 'collection'
  | 'folder';

export type InheritedHeaderInfo = {
  key: string;
  value: string;
  source: HeaderSourceKind;
  sourceName: string;
  isOverridden?: boolean;
};

export interface HeaderResolutionResult {
  merged: Record<string, string>;
  inherited: InheritedHeaderInfo[];
  overriddenKeys: string[];
}

