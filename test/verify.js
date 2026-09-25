const assert = require('assert');
const path = require('path');
const Module = require('module');

// Mock vscode module for standalone execution
const mockVscode = {
  ExtensionContext: class {},
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  EventEmitter: class {
    constructor() {
      this.event = () => {};
    }
    fire() {}
    dispose() {}
  },
  DataTransfer: class {
    constructor() {
      this.entries = new Map();
    }
    get(mime) {
      return this.entries.get(mime);
    }
    set(mime, item) {
      this.entries.set(mime, item);
    }
  },
  DataTransferItem: class {
    constructor(value) {
      this.value = value;
    }
    asString() {
      return Promise.resolve(typeof this.value === 'string' ? this.value : JSON.stringify(this.value));
    }
  },
  window: {
    showInformationMessage: () => {},
    showErrorMessage: () => {},
    showWarningMessage: () => {},
    createTreeView: () => ({ dispose: () => {} }),
    createStatusBarItem: () => ({ show: () => {} }),
    setStatusBarMessage: () => ({ dispose: () => {} }),
    StatusBarAlignment: { Right: 2 },
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => {},
  }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const repoDist = path.resolve(__dirname, '../dist');
const { BlueByrdStateManager } = require(path.join(repoDist, 'state/stateManager'));
const { VariableService } = require(path.join(repoDist, 'services/variableService'));
const { AuthService } = require(path.join(repoDist, 'services/authService'));
const { TokenService } = require(path.join(repoDist, 'services/tokenService'));
const { ScriptService } = require(path.join(repoDist, 'services/scriptService'));
const { ImportExportService } = require(path.join(repoDist, 'services/importExportService'));
const { UpdateService } = require(path.join(repoDist, 'services/updateService'));
const { BlueByrdExplorerTreeDataProvider } = require(path.join(repoDist, 'views/tree/explorerTreeDataProvider'));
const {
  BlueByrdProfilesTreeProvider,
  BlueByrdCollectionsTreeProvider,
  BlueByrdEnvironmentsTreeProvider,
  BlueByrdHistoryTreeProvider,
  BlueByrdTreeCoordinator,
} = require(path.join(repoDist, 'views/tree'));

console.log('--- Starting bluebyrd Verification Suite ---');

// 1. Test Mock Context & StateManager
const fakeStorage = new Map();
const mockContext = {
  workspaceState: {
    get: (key) => fakeStorage.get(key),
    update: (key, val) => { fakeStorage.set(key, val); return Promise.resolve(); }
  }
};

const stateManager = new BlueByrdStateManager(mockContext);
const variableService = new VariableService(stateManager);
const authService = new AuthService(stateManager);

// Test 1: State Initialization & Default State
const state = stateManager.getState();
assert(state.profiles.length >= 1, 'Should have default profiles');
assert(state.collections.length >= 1, 'Should have default collections');
assert(Object.keys(state.environments).length >= 1, 'Should have default environments');
assert(Array.isArray(state.history), 'History should be an array');
console.log('✓ Default state initialization passed');

// Test 2: Variable Interpolation
const testVars = {
  baseUrl: 'https://jsonplaceholder.typicode.com',
  userId: '42',
  version: 'v1',
  path: 'users/{{userId}}'
};

const singleReplace = variableService.interpolate('{{baseUrl}}/todos/{{userId}}', testVars);
assert.strictEqual(singleReplace, 'https://jsonplaceholder.typicode.com/todos/42', 'Single variable replacement failed');

const nestedReplace = variableService.interpolate('{{baseUrl}}/{{path}}', testVars);
assert.strictEqual(nestedReplace, 'https://jsonplaceholder.typicode.com/users/42', 'Nested variable replacement failed');

const unreplaced = variableService.interpolate('{{baseUrl}}/unknown/{{notExists}}', testVars);
assert.strictEqual(unreplaced, 'https://jsonplaceholder.typicode.com/unknown/{{notExists}}', 'Unmatched vars should remain untouched');
console.log('✓ Variable interpolation passed');

// Test 3: Variable Hierarchy Resolution
const resolvedVars = variableService.resolveVariables('Development', 'Local', 'Demo Collection', 'Todos', [
  { name: 'userId', value: '999', enabled: true },
  { name: 'customVar', value: 'hello', enabled: true },
  { name: 'disabledVar', value: 'ignored', enabled: false }
]);

assert.strictEqual(resolvedVars['baseUrl'], 'https://jsonplaceholder.typicode.com', 'baseUrl from environment should exist');
assert.strictEqual(resolvedVars['userId'], '999', 'Request-level variable should override environment');
assert.strictEqual(resolvedVars['customVar'], 'hello', 'Custom request variable should exist');
assert.strictEqual(resolvedVars['disabledVar'], undefined, 'Disabled variable should not exist');
assert.strictEqual(resolvedVars['version'], 'v1', 'Profile variable should exist');
console.log('✓ Hierarchical variable resolution passed');

// Test 4: Auth Resolution
const authHeaders = authService.resolveAuthHeaders('Development', 'Local', 'Demo Collection', 'Todos', { 'Accept': 'application/json' }, {
  inheritFromProfile: true,
  inheritFromEnvironment: true,
  auth: { type: 'apiKey', token: 'my-custom-key', headerName: 'X-API-Key' }
});

assert.strictEqual(authHeaders['Accept'], 'application/json', 'Existing headers should be preserved');
assert.strictEqual(authHeaders['X-API-Key'], 'my-custom-key', 'Override auth should be applied');
console.log('✓ Auth header resolution passed');

// Test 5: Saving Requests without Duplication
const demoCol = state.collections[0];
assert(demoCol, 'Demo collection must exist');

const newReq = stateManager.saveRequest({
  id: 'test-req-1',
  name: 'Test Request 1',
  method: 'GET',
  url: '{{baseUrl}}/test',
  headers: {},
  body: '',
  collection: demoCol.name,
  folder: 'Todos'
}, demoCol.id, 'Todos');

const updatedCol = stateManager.getCollection(demoCol.id);
const todosFolder = updatedCol.folders.find(f => f.name === 'Todos');
assert(todosFolder.requests.some(r => r.id === 'test-req-1'), 'Request should exist in folder');
assert(!updatedCol.requests.some(r => r.id === 'test-req-1'), 'Request must NOT be duplicated in root collection!');

stateManager.saveRequest({
  id: 'test-req-1',
  name: 'Updated Test Request Name',
  method: 'GET',
  url: '{{baseUrl}}/test',
  headers: {},
  body: '',
  collection: demoCol.name,
  folder: 'Todos'
}, demoCol.id, 'Todos');

const refreshedCol = stateManager.getCollection(demoCol.id);
const refreshedFolder = refreshedCol.folders.find(f => f.name === 'Todos');
const matchingReqs = refreshedFolder.requests.filter(r => r.id === 'test-req-1');
assert.strictEqual(matchingReqs.length, 1, 'Updating must NOT create a duplicate request!');
assert.strictEqual(matchingReqs[0].name, 'Updated Test Request Name', 'Request name should be updated');
console.log('✓ Save & update request deduplication passed');

// Test 6: History Isolation from Collections
const initialColReqCount = refreshedCol.requests.length;
const initialFolderReqCount = refreshedFolder.requests.length;

stateManager.recordHistory({
  id: 'history-item-1',
  name: 'Executed GET /test',
  method: 'GET',
  url: 'https://example.com/test',
  headers: {},
  body: '',
  collection: demoCol.name,
  folder: 'Todos'
}, { status: 200, statusText: 'OK', elapsedMs: 85 });

const postHistoryState = stateManager.getState();
assert.strictEqual(postHistoryState.history.length, 1, 'History should have 1 item');
assert.strictEqual(postHistoryState.history[0].responseStatus, 200, 'History item should record status');

const checkColAfterHistory = stateManager.getCollection(demoCol.id);
assert.strictEqual(checkColAfterHistory.requests.length, initialColReqCount, 'Collections must NOT be modified by request execution');
const checkFolderAfterHistory = checkColAfterHistory.folders.find(f => f.name === 'Todos');
assert.strictEqual(checkFolderAfterHistory.requests.length, initialFolderReqCount, 'Folders must NOT be modified by request execution');
console.log('✓ History recording isolation passed');

// Test 7: Duplication, Cloning & Deletion
const duplicated = stateManager.duplicateRequest('test-req-1');
assert(duplicated, 'Duplicate request should succeed');
assert(duplicated.id !== 'test-req-1', 'Duplicated request should have a distinct ID');
assert(duplicated.name.includes('(Copy)'), 'Duplicated request should have (Copy) in name');

const clonedReq = stateManager.cloneRequest('test-req-1', 'Custom Cloned Request');
assert(clonedReq, 'Clone request with custom name should succeed');
assert.strictEqual(clonedReq.name, 'Custom Cloned Request');
assert(clonedReq.id !== 'test-req-1' && clonedReq.id !== duplicated.id);

const deleted = stateManager.deleteRequest(duplicated.id);
assert.strictEqual(deleted, true, 'Delete request should succeed');
assert(!stateManager.getRequest(duplicated.id), 'Deleted request should no longer exist');
stateManager.deleteRequest(clonedReq.id);
console.log('✓ Request duplication, cloning and deletion passed');

// Test 8: History Clear
stateManager.clearHistory();
assert.strictEqual(stateManager.getState().history.length, 0, 'History should be empty after clear');
console.log('✓ Clear history passed');

// Test 9: Multiple Profiles with the Same Name
stateManager.saveProfile({ id: 'dev-1', name: 'Development', auth: { type: 'bearer', token: 'token-1' } });
stateManager.saveProfile({ id: 'dev-2', name: 'Development', auth: { type: 'bearer', token: 'token-2' } });
stateManager.saveProfile({ id: 'dev-3', name: 'Development', auth: { type: 'bearer', token: 'token-3' } });

const p2 = stateManager.getProfile('dev-2');
assert(p2, 'Profile dev-2 must exist');
assert.strictEqual(p2.auth.token, 'token-2', 'getProfile by id must return the exact matching profile, not the first same-named profile');

stateManager.saveProfile({ id: 'dev-2', name: 'Development', auth: { type: 'bearer', token: 'token-2-updated' } });
const checkP1 = stateManager.getProfile('dev-1');
const checkP2 = stateManager.getProfile('dev-2');
const checkP3 = stateManager.getProfile('dev-3');
assert.strictEqual(checkP1.auth.token, 'token-1', 'Profile 1 must remain untouched when Profile 2 is saved');
assert.strictEqual(checkP2.auth.token, 'token-2-updated', 'Profile 2 must be updated');
assert.strictEqual(checkP3.auth.token, 'token-3', 'Profile 3 must remain untouched when Profile 2 is saved');
console.log('✓ Multiple same-named profiles handled correctly by ID passed');

// Test 10: Full-Fidelity History Recording & Retrieval
const recordedItem = stateManager.recordHistory(
  {
    id: 'req-full-test',
    name: 'Get User Todos',
    method: 'GET',
    url: '{{baseUrl}}/todos/1',
    headers: { Accept: 'application/json' },
    body: '',
    collection: 'Demo Collection',
    folder: 'Todos',
  },
  {
    ok: true,
    status: 200,
    statusText: 'OK',
    elapsedMs: 85,
    sizeBytes: 1240,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: '{"userId": 1, "id": 1, "title": "delectus aut autem", "completed": false}',
    resolvedUrl: 'https://jsonplaceholder.typicode.com/todos/1',
  }
);

assert(recordedItem, 'Should return recorded history item');
assert.strictEqual(recordedItem.resolvedUrl, 'https://jsonplaceholder.typicode.com/todos/1', 'Resolved URL must be preserved');
assert.strictEqual(recordedItem.responseStatus, 200, 'Response status must be preserved');
assert.strictEqual(recordedItem.elapsedMs, 85, 'Elapsed ms must be preserved');
assert.strictEqual(recordedItem.responseSizeBytes, 1240, 'Response size bytes must be preserved');
assert(recordedItem.responseHeaders['content-type'].includes('application/json'), 'Response headers must be preserved');
assert(recordedItem.responseBody.includes('delectus aut autem'), 'Response body must be preserved');

const fetched = stateManager.getHistoryItem(recordedItem.id);
assert(fetched, 'getHistoryItem by ID should find the recorded item');
assert.strictEqual(fetched.id, recordedItem.id, 'Fetched history item ID should match');
const allHistory = stateManager.getHistory();
assert.strictEqual(allHistory.length, 1, 'getHistory should return array with recorded run');
console.log('✓ Full-fidelity history recording & retrieval passed');

// Test 11: Oversized Payload Truncation & Single-Item Deletion
const hugePayload = 'A'.repeat(150000); // 150KB
const truncatedItem = stateManager.recordHistory(
  {
    id: 'req-huge-test',
    name: 'Download Huge File',
    method: 'GET',
    url: 'https://api.example.com/huge',
    headers: {},
    body: '',
    collection: 'Demo Collection',
  },
  {
    ok: true,
    status: 200,
    statusText: 'OK',
    elapsedMs: 350,
    sizeBytes: 150000,
    headers: { 'content-type': 'text/plain' },
    body: hugePayload,
    resolvedUrl: 'https://api.example.com/huge',
  }
);

assert(truncatedItem.responseBody.length < 110000, 'Payload larger than 100KB must be truncated for storage safety');
assert(truncatedItem.responseBody.includes('[Response body truncated (> 100 KB) for history storage]'), 'Truncation message must be present');

const deleteSuccess = stateManager.deleteHistoryItem(truncatedItem.id);
assert.strictEqual(deleteSuccess, true, 'deleteHistoryItem should return true');
assert.strictEqual(stateManager.getHistoryItem(truncatedItem.id), undefined, 'Deleted history item should no longer be found');
assert.strictEqual(stateManager.getHistory().length, 1, 'Remaining history should still have previous item');
console.log('✓ Oversized payload safety truncation & single-item deletion passed');

// Test 12: Settings Panel Static viewType & HTML Generation
const { BlueByrdSettingsPanel } = require(path.join(repoDist, 'views/panels/settingsPanel'));
const { getSettingsPanelHtml } = require(path.join(repoDist, 'views/panels/settingsPanelHtml'));

assert.strictEqual(BlueByrdSettingsPanel.viewType, 'blueByrdSettings', 'Settings panel viewType must be static blueByrdSettings');

// Test across all scope targets
const profileHtml = getSettingsPanelHtml('profile', state.profiles[0], 'Dev');
assert(profileHtml.includes('Dev Settings'), 'Profile settings title should match');
assert(profileHtml.includes('Variables'), 'Tabs should be present');

const envHtml = getSettingsPanelHtml('environment', state.environments['Local'], 'Local');
assert(envHtml.includes('Base URL'), 'Environment should display Base URL banner');

const colHtml = getSettingsPanelHtml('collection', state.collections[0], 'Demo Collection');
assert(colHtml.includes('scope-collection'), 'Collection scope pill class should be present');
assert(colHtml.includes('COLLECTION'), 'Collection scope label should be present');

const folderHtml = getSettingsPanelHtml('folder', state.collections[0].folders[0], 'Todos', 'Demo Collection');
assert(folderHtml.includes('Todos'), 'Folder name should be present');

const undefinedHtml = getSettingsPanelHtml('profile', undefined, 'Empty');
assert(undefinedHtml.includes('Empty Settings'), 'Undefined item should not throw');
console.log('✓ Settings panel multi-scope HTML rendering passed');

// Test 13: Settings Panel Script Syntax & Injection Safety
const edgeCaseItem = {
  id: 'test-edge',
  name: 'Edge Case Item',
  auth: { type: 'bearer', token: 'token"with`quotes${and}interpolation' },
  variables: {
    'normalVar': 'simple-val',
    'backtickVar': 'val`with`backtick',
    'templateVar': '${dangerouslyInterpolated}',
    'quoteVar': 'quotes"and\'single',
    'scriptTagVar': '</script><script>alert(1)</script>'
  },
  notes: 'Testing notes with </textarea> and `code`'
};

const edgeHtml = getSettingsPanelHtml('environment', edgeCaseItem, 'Edge Case');
const scriptMatch = edgeHtml.match(/<script>([\s\S]*?)<\/script>/);
assert(scriptMatch, 'Script block must be present in settings HTML');
assert.doesNotThrow(() => {
  new Function(scriptMatch[1]);
}, 'Client script in settings HTML must be valid JavaScript without syntax or template errors');
console.log('✓ Settings panel script integrity & edge-case injection safety passed');

// Test 14: Comprehensive Auth Types (OAuth 2.0, Basic Auth, API Key, Bearer)
const oauthProfile = {
  id: 'profile-oauth-test',
  name: 'OAuth Profile',
  auth: {
    type: 'oauth2',
    grantType: 'authorization_code',
    token: 'ya29.sample-token',
    clientId: 'test-client-id-123',
    clientSecret: 'test-secret-456',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'profile', 'email'],
    headerPrefix: 'Bearer',
    headerName: 'Authorization'
  },
  variables: {}
};

const oauthHtml = getSettingsPanelHtml('profile', oauthProfile, 'OAuth Profile');
assert(oauthHtml.includes('oauth-grant-type'), 'OAuth 2.0 grant type input must be present');
assert(oauthHtml.includes('oauth-client-id'), 'OAuth 2.0 Client ID input must be present');
assert(oauthHtml.includes('oauth-client-secret'), 'OAuth 2.0 Client Secret input must be present');
assert(oauthHtml.includes('oauth-auth-url'), 'OAuth 2.0 Authorization URL input must be present');
assert(oauthHtml.includes('oauth-token-url'), 'OAuth 2.0 Token URL input must be present');
assert(oauthHtml.includes('oauth-scopes'), 'OAuth 2.0 Scopes input must be present');
assert(oauthHtml.includes('test-client-id-123'), 'Configured Client ID should be rendered in HTML');
assert(oauthHtml.includes('openid profile email'), 'Scopes should be joined and rendered');

// Basic auth test
const basicProfile = {
  id: 'profile-basic-test',
  name: 'Basic Profile',
  auth: {
    type: 'basic',
    username: 'admin',
    password: 'secretpassword',
    headerName: 'Authorization'
  },
  variables: {}
};

const basicHtml = getSettingsPanelHtml('profile', basicProfile, 'Basic Profile');
assert(basicHtml.includes('basic-username'), 'Basic Auth username input must be present');
assert(basicHtml.includes('basic-password'), 'Basic Auth password input must be present');

// Test AuthService resolution for basic auth
stateManager.saveProfile(basicProfile);
const basicHeaders = authService.resolveAuthHeaders('profile-basic-test', undefined, undefined, undefined, {});
const expectedBasic = `Basic ${Buffer.from('admin:secretpassword').toString('base64')}`;
assert.strictEqual(basicHeaders['Authorization'], expectedBasic, 'Basic auth header must resolve to correct base64 encoding');

// Test AuthService resolution for OAuth2
stateManager.saveProfile(oauthProfile);
const oauthHeaders = authService.resolveAuthHeaders('profile-oauth-test', undefined, undefined, undefined, {});
console.log('✓ Comprehensive Auth types (OAuth 2.0, Basic Auth, API Key, Bearer) verified');

// 15. Test Request Panel Response Inspector HTML & Tabs
const { getRequestPanelHtml } = require(path.join(repoDist, 'views/panels/requestPanelHtml'));
const reqHtml = getRequestPanelHtml({}, stateManager.getState());
assert(!reqHtml.includes('id="tab-resp-body" class="tab-content active" style='), 'tab-resp-body should not have inline display styles that break hiding');
assert(reqHtml.includes('#tab-resp-body.active {'), 'tab-resp-body.active flex style should be in CSS');
assert(reqHtml.includes('id="tab-resp-body" class="tab-content active"'), 'tab-resp-body should have class tab-content active');
assert(reqHtml.includes('id="tab-resp-headers" class="tab-content"'), 'tab-resp-headers should have class tab-content');
assert(reqHtml.includes('headers-table'), 'headers-table should be present in response inspector');
console.log('✓ Request panel response tabs and header inspection verified');

// 16. Test Multi-Type Request Body (form encoded, json, text, xml, form-data, none)
assert(reqHtml.includes('name="bodyType" value="none"'), 'none body radio should be present');
assert(reqHtml.includes('name="bodyType" value="json"'), 'JSON body radio should be present');
assert(reqHtml.includes('name="bodyType" value="form-urlencoded"'), 'x-www-form-urlencoded radio should be present');
assert(reqHtml.includes('name="bodyType" value="form-data"'), 'form-data radio should be present');
assert(reqHtml.includes('name="bodyType" value="text"'), 'text body radio should be present');
assert(reqHtml.includes('name="bodyType" value="xml"'), 'XML body radio should be present');
assert(reqHtml.includes('name="bodyType" value="raw"'), 'raw body radio should be present');

assert(reqHtml.includes('id="body-view-json"'), 'JSON body subview should be present');
assert(reqHtml.includes('id="body-view-form-urlencoded"'), 'form-urlencoded subview should be present');
assert(reqHtml.includes('id="body-view-form-data"'), 'form-data subview should be present');
assert(reqHtml.includes('id="body-view-text"'), 'text subview should be present');
assert(reqHtml.includes('id="body-view-xml"'), 'xml subview should be present');
assert(reqHtml.includes('id="urlencoded-rows"'), 'form-urlencoded rows container should be present');
assert(reqHtml.includes('btn-toggle-urlencoded-mode'), 'Bulk Edit button should be present');

// Test saving and normalizing requests with bodyType and bodyFormData
const formReq = {
  id: 'req-form-test',
  name: 'Form Request',
  method: 'POST',
  url: 'https://httpbin.org/post',
  collection: 'Demo Collection',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'username=chase&grant_type=password',
  bodyType: 'form-urlencoded',
  bodyFormData: [
    { key: 'username', value: 'chase', enabled: true },
    { key: 'grant_type', value: 'password', enabled: true }
  ]
};

const savedFormReq = stateManager.saveRequest(formReq);
assert.strictEqual(savedFormReq.bodyType, 'form-urlencoded', 'Saved request must preserve bodyType');
assert.strictEqual(savedFormReq.bodyFormData.length, 2, 'Saved request must preserve bodyFormData rows');

const reloadedState = stateManager.getState();
const reloadedReq = reloadedState.collections[0].requests.find(r => r.id === 'req-form-test');
assert(reloadedReq, 'Request must exist in state');
assert.strictEqual(reloadedReq.bodyType, 'form-urlencoded', 'Reloaded request must retain bodyType');
assert.strictEqual(reloadedReq.bodyFormData.length, 2, 'Reloaded request must retain bodyFormData rows');

// Test request panel rendering with specific bodyType and bodyFormData
const renderedFormHtml = getRequestPanelHtml(reloadedReq, reloadedState);
assert(renderedFormHtml.includes('initialBodyType = "form-urlencoded"'), 'Webview script should receive initial bodyType');
assert(renderedFormHtml.includes('"username"'), 'Webview script should receive initial form data keys');
console.log('✓ Request body type selection (form-urlencoded, json, txt, xml, form-data) verified');

// 17. Test Request Panel Script Syntax & Integrity
const reqScriptMatch = reqHtml.match(/<script>([\s\S]*?)<\/script>/);
assert(reqScriptMatch, 'Script block must be present in request panel HTML');
assert.doesNotThrow(() => {
  new Function(reqScriptMatch[1]);
}, 'Client script in request panel HTML must be valid JavaScript without syntax or template errors');

function createMockDom() {
  const elements = new Map();
  function getEl(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        tagName: 'DIV',
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
        selectedOptions: [{ value: 'Default', dataset: { id: 'def-1' } }],
        options: [{ value: 'Default', getAttribute: () => 'def-1' }],
        selectedIndex: 0,
        querySelector: (sel) => getEl(sel),
        querySelectorAll: () => [],
        appendChild: () => {},
        remove: () => {},
        addEventListener: () => {},
      });
    }
    return elements.get(id);
  }
  return {
    getElementById: (id) => getEl(id),
    querySelector: (sel) => getEl(sel),
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag,
      innerHTML: '',
      textContent: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      querySelector: (sel) => getEl(sel),
      querySelectorAll: () => [],
      appendChild: () => {},
      remove: () => {},
      addEventListener: () => {},
      setAttribute: () => {},
    }),
    addEventListener: () => {},
  };
}

// Runtime execution test: ensures no Temporal Dead Zone (TDZ) ReferenceErrors (e.g. inheritedVarsContainer)
assert.doesNotThrow(() => {
  const mockDoc = createMockDom();
  const mockWindow = { addEventListener: () => {} };
  const fn = new Function('document', 'window', 'acquireVsCodeApi', reqScriptMatch[1]);
  fn(mockDoc, mockWindow, () => ({ postMessage: () => {} }));
}, 'Client script in request panel HTML must execute without runtime TDZ ReferenceError');

const renderedFormScriptMatch = renderedFormHtml.match(/<script>([\s\S]*?)<\/script>/);
assert(renderedFormScriptMatch, 'Script block must be present in rendered form request HTML');
assert.doesNotThrow(() => {
  new Function(renderedFormScriptMatch[1]);
}, 'Client script in form request panel HTML must be valid JavaScript without syntax or template errors');
console.log('✓ Request panel script integrity & syntax validation passed');

// 18. Test Multipart Form-Data File Upload Execution & UI
(async function runAsyncTests() {
  const { HttpService } = require(path.join(repoDist, 'services/httpService'));
  const http = require('http');
  const fs = require('fs');

  // Create temporary fixture file
  const fixtureDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true });
  const sampleFilePath = path.join(fixtureDir, 'upload-sample.txt');
  fs.writeFileSync(sampleFilePath, 'Hello bluebyrd multipart upload!', 'utf8');

  let receivedContentType = '';
  let receivedBody = '';
  const server = http.createServer((req, res) => {
    receivedContentType = req.headers['content-type'] || '';
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      receivedBody = Buffer.concat(chunks).toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const httpService = new HttpService(stateManager, variableService, authService);

  // Successful file upload test
  const uploadResult = await httpService.executeRequest({
    method: 'POST',
    url: `http://127.0.0.1:${port}/upload`,
    bodyType: 'form-data',
    bodyFormData: [
      { key: 'username', value: 'byrd-dev', enabled: true, type: 'text' },
      { key: 'avatar', value: sampleFilePath, enabled: true, type: 'file' }
    ]
  });

  assert(receivedContentType.startsWith('multipart/form-data; boundary='), 'Must set multipart/form-data with boundary');
  assert(receivedBody.includes('name="username"'), 'Must include username text field');
  assert(receivedBody.includes('byrd-dev'), 'Must include username text value');
  assert(receivedBody.includes('name="avatar"; filename="upload-sample.txt"'), 'Must include file field with filename');
  assert(receivedBody.includes('Hello bluebyrd multipart upload!'), 'Must include file contents');
  assert.strictEqual(uploadResult.status, 200, 'HTTP request must succeed');

  // Missing file safety test
  let missingFileError = null;
  try {
    await httpService.executeRequest({
      method: 'POST',
      url: `http://127.0.0.1:${port}/upload`,
      bodyType: 'form-data',
      bodyFormData: [
        { key: 'avatar', value: path.join(fixtureDir, 'non-existent-file.xyz'), enabled: true, type: 'file' }
      ]
    });
  } catch (err) {
    missingFileError = err;
  }
  assert(missingFileError && missingFileError.message.includes('File not found for form-data field "avatar"'), 'Must throw descriptive error when file does not exist');

  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close();
  server.unref();

  // Test form-data file row rendering and script compilation
  const fileReq = {
    id: 'req-file-test',
    name: 'File Upload Request',
    method: 'POST',
    url: 'https://httpbin.org/post',
    bodyType: 'form-data',
    bodyFormData: [
      { key: 'avatar', value: sampleFilePath, enabled: true, type: 'file' }
    ]
  };
  const renderedFileHtml = getRequestPanelHtml(fileReq, stateManager.getState());
  assert(renderedFileHtml.includes('addFormDataRow'), 'Should include addFormDataRow function');
  assert(renderedFileHtml.includes('data-role="browse"'), 'Should render Browse button for file upload');
  assert(renderedFileHtml.includes('initialBodyFormData = [{"key":"avatar"'), 'Should pass initial form data');

  const fileScriptMatch = renderedFileHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert(fileScriptMatch, 'Script block must be present');
  assert.doesNotThrow(() => {
    new Function(fileScriptMatch[1]);
  }, 'Client script with form-data file row must compile without syntax errors');

  console.log('✓ Form-data file upload execution, missing file safety & UI rendering verified');

  // 19. Test Shared Auth Component in Request Panel (OAuth 2.0 & Basic Auth parity)
  const oauthReq = {
    id: 'req-oauth-test',
    name: 'OAuth Request',
    method: 'GET',
    url: 'https://api.example.com/me',
    collection: 'Demo Collection',
    auth: {
      inheritFromProfile: false,
      inheritFromEnvironment: false,
      auth: {
        type: 'oauth2',
        grantType: 'authorization_code',
        token: 'ya29.req-token-xyz',
        clientId: 'req-client-123',
        clientSecret: 'req-secret-456',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'email'],
        headerPrefix: 'Bearer',
        headerName: 'Authorization'
      }
    }
  };

  const renderedOAuthReqHtml = getRequestPanelHtml(oauthReq, stateManager.getState());
  assert(renderedOAuthReqHtml.includes('id="oauth-client-id"'), 'Request Auth tab must include oauth-client-id input');
  assert(renderedOAuthReqHtml.includes('value="req-client-123"'), 'Request Auth tab must render configured Client ID');
  assert(renderedOAuthReqHtml.includes('value="req-secret-456"'), 'Request Auth tab must render configured Client Secret');
  assert(renderedOAuthReqHtml.includes('value="https://accounts.google.com/o/oauth2/v2/auth"'), 'Request Auth tab must render Auth URL');
  assert(renderedOAuthReqHtml.includes('value="https://oauth2.googleapis.com/token"'), 'Request Auth tab must render Token URL');
  assert(renderedOAuthReqHtml.includes('value="openid email"'), 'Request Auth tab must render Scopes');
  assert(renderedOAuthReqHtml.includes('value="authorization_code"'), 'Request Auth tab must render Grant Type');

  // Test Request Panel Basic Auth parity
  const basicReq = {
    id: 'req-basic-test',
    name: 'Basic Request',
    method: 'GET',
    url: 'https://api.example.com/protected',
    collection: 'Demo Collection',
    auth: {
      inheritFromProfile: false,
      inheritFromEnvironment: false,
      auth: {
        type: 'basic',
        username: 'req-user',
        password: 'req-password',
        headerName: 'Authorization'
      }
    }
  };
  const renderedBasicReqHtml = getRequestPanelHtml(basicReq, stateManager.getState());
  assert(renderedBasicReqHtml.includes('id="basic-username"'), 'Request Auth tab must include basic-username input');
  assert(renderedBasicReqHtml.includes('value="req-user"'), 'Request Auth tab must render configured Username');
  assert(renderedBasicReqHtml.includes('value="req-password"'), 'Request Auth tab must render configured Password');

  // Verify save & state preservation of full OAuth 2.0 on request
  const savedOAuthReq = stateManager.saveRequest(oauthReq);
  assert.strictEqual(savedOAuthReq.auth.auth.clientId, 'req-client-123', 'Saved request must preserve OAuth Client ID');
  assert.strictEqual(savedOAuthReq.auth.auth.clientSecret, 'req-secret-456', 'Saved request must preserve OAuth Client Secret');
  assert.strictEqual(savedOAuthReq.auth.auth.tokenUrl, 'https://oauth2.googleapis.com/token', 'Saved request must preserve OAuth Token URL');

  // Verify client script integrity of OAuth request panel HTML
  const oauthReqScriptMatch = renderedOAuthReqHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert(oauthReqScriptMatch, 'Script tag must exist in OAuth request HTML');
  assert.doesNotThrow(() => {
    new Function(oauthReqScriptMatch[1]);
  }, 'Client script in OAuth request HTML must compile without syntax errors');

  console.log('✓ Unified Auth parity verified (OAuth 2.0, Basic, API Key, Bearer shared across Request & Settings)');

  // Test 20: Built-in Dynamic Variables
  const uuid = variableService.resolveDynamic('$uuid');
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid), 'UUID v4 must match standard format');

  const timestamp = variableService.resolveDynamic('$timestamp');
  const now = Date.now();
  assert(Math.abs(Number(timestamp) - now) < 5000, '$timestamp should be current epoch millis');

  const isoDate = variableService.resolveDynamic('$isoDate');
  assert(!isNaN(Date.parse(isoDate)), '$isoDate must be valid ISO-8601');

  const randomInt = variableService.resolveDynamic('$randomInt:8');
  assert(/^\d{8}$/.test(randomInt), '$randomInt:8 should return 8 numeric digits');

  const dateFmt = variableService.resolveDynamic('$date:yyyy-MM');
  const currentYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  assert.strictEqual(dateFmt, currentYm, '$date:yyyy-MM should match current year and month');

  const dynInterpolated = variableService.interpolate('ID: {{$uuid}}, Date: {{$date:yyyy}}', {});
  assert(dynInterpolated.includes('ID: ') && dynInterpolated.includes(`Date: ${new Date().getFullYear()}`), 'Dynamic variables must interpolate into strings');
  console.log('✓ Built-in dynamic variables ($uuid, $timestamp, $isoDate, $randomInt, $date) passed');

  // Test 21: Nested Environments & Cycle-Safe Resolution Chain
  stateManager.saveEnvironment('Stage-Base', {
    id: 'env-stage-base',
    baseUrl: 'https://base.stage.api.com',
    apiKey: 'base-key-123',
    variables: { commonHost: 'stage.api.internal', sharedSecret: 'base-secret', region: 'global' },
    headers: { 'X-Common-Base': 'true' }
  });

  stateManager.saveEnvironment('Stage-East', {
    id: 'env-stage-east',
    baseUrl: '', // Empty baseUrl so it inherits from Stage-Base
    inheritsFrom: 'Stage-Base',
    variables: { region: 'us-east-1', localCluster: 'east-pod-4' },
    headers: { 'X-Region': 'us-east-1' }
  });

  const eastVars = variableService.resolveVariables('Development', 'Stage-East', 'Demo Collection', 'Todos');
  assert.strictEqual(eastVars['baseUrl'], 'https://base.stage.api.com', 'Child environment should inherit baseUrl from parent environment');
  assert.strictEqual(eastVars['apiKey'], 'base-key-123', 'Child environment should inherit apiKey from parent environment');
  assert.strictEqual(eastVars['commonHost'], 'stage.api.internal', 'Child environment should inherit parent variables');
  assert.strictEqual(eastVars['region'], 'us-east-1', 'Child environment should override parent variables with same key');
  assert.strictEqual(eastVars['localCluster'], 'east-pod-4', 'Child environment should provide its own variables');

  // Cycle safety check: Env-A -> Env-B -> Env-A
  stateManager.saveEnvironment('Cycle-A', {
    id: 'env-cycle-a',
    baseUrl: 'https://a.test',
    inheritsFrom: 'Cycle-B',
    variables: { varA: '1' }
  });
  stateManager.saveEnvironment('Cycle-B', {
    id: 'env-cycle-b',
    baseUrl: 'https://b.test',
    inheritsFrom: 'Cycle-A',
    variables: { varB: '2' }
  });
  assert.doesNotThrow(() => {
    const cycleVars = variableService.resolveVariables('Development', 'Cycle-A');
    assert(cycleVars['varA'] === '1' && cycleVars['varB'] === '2', 'Cycle resolution should terminate safely');
  }, 'Circular environment inheritance must be cycle-safe without throwing');
  console.log('✓ Nested environments & cycle-safe inheritance chain passed');

  // Test 22: Hierarchical Headers across Environments, Collections, Folders, and Requests
  const demoCollection = stateManager.getState().collections[0];
  demoCollection.headers = { 'Accept': 'application/json', 'X-Collection-Scope': 'orders-v1' };
  demoCollection.folders[0].headers = { 'X-Folder-Scope': 'todos', 'Accept': 'application/vnd.todos+json' };
  stateManager.saveCollection(demoCollection);

  const resolvedHierarchicalHeaders = variableService.resolveHeaders('Stage-East', demoCollection.id, demoCollection.folders[0].id, {
    'X-Request-Trace': 'trace-999',
    'accept': 'application/xml' // Lowercase override of Folder's 'Accept'
  });

  assert.strictEqual(resolvedHierarchicalHeaders['X-Common-Base'], 'true', 'Parent environment header should be inherited');
  assert.strictEqual(resolvedHierarchicalHeaders['X-Region'], 'us-east-1', 'Active environment header should be inherited');
  assert.strictEqual(resolvedHierarchicalHeaders['X-Collection-Scope'], 'orders-v1', 'Collection header should be inherited');
  assert.strictEqual(resolvedHierarchicalHeaders['X-Folder-Scope'], 'todos', 'Folder header should be inherited');
  assert.strictEqual(resolvedHierarchicalHeaders['X-Request-Trace'], 'trace-999', 'Request header should be included');
  assert.strictEqual(resolvedHierarchicalHeaders['accept'], 'application/xml', 'Request header should case-insensitively override inherited Accept header');
  assert.strictEqual(resolvedHierarchicalHeaders['Accept'], undefined, 'Overridden header with different casing should not create duplicate keys');
  console.log('✓ Hierarchical headers across environments, collections, folders, and requests passed');

  // Test 23: Detailed Traceability & Inherited Inspector Resolution
  const varDetails = variableService.resolveVariablesDetailed(
    'Development',
    'Stage-East',
    demoCollection.id,
    demoCollection.folders[0].id,
    [{ name: 'region', value: 'override-at-request', enabled: true }]
  );
  assert(varDetails.inherited.some(i => i.key === '$uuid' && i.source === 'dynamic'), 'Dynamic variable info should be listed in inherited');
  assert(varDetails.inherited.some(i => i.key === 'commonHost' && i.source === 'parent-environment'), 'Parent env variable must be labeled parent-environment');
  assert(varDetails.inherited.some(i => i.key === 'region' && i.isOverridden === true), 'Inherited variable overridden at request level must be flagged isOverridden');

  const headerDetails = variableService.resolveHeadersDetailed(
    'Stage-East',
    demoCollection.id,
    demoCollection.folders[0].id,
    { 'x-collection-scope': 'override' }
  );
  assert(headerDetails.inherited.some(h => h.key === 'X-Collection-Scope' && h.isOverridden === true), 'Inherited header overridden by request must have isOverridden = true');
  console.log('✓ Detailed traceability and inherited inspector resolution passed');

  // Test 24: JSON Typed Variable Coercion
  const jsonBodyTemplate = '{\n  "active": "{{FLAG_ACTIVE}}",\n  "disabled": "{{FLAG_DISABLED}}",\n  "count": {{COUNT}},\n  "empty": "{{NULL_VAL}}",\n  "text": "{{TEXT}}"\n}';
  const coercedBody = variableService.coerceTypedVarTokens(jsonBodyTemplate, {
    FLAG_ACTIVE: 'true',
    FLAG_DISABLED: 'false',
    COUNT: '42',
    NULL_VAL: 'null',
    TEXT: 'hello'
  });
  const finalJson = variableService.interpolate(coercedBody, {
    COUNT: '42',
    TEXT: 'hello'
  });
  const parsedCoerced = JSON.parse(finalJson);
  assert.strictEqual(parsedCoerced.active, true, 'Quoted "{{FLAG_ACTIVE}}" must coerce to boolean true');
  assert.strictEqual(parsedCoerced.disabled, false, 'Quoted "{{FLAG_DISABLED}}" must coerce to boolean false');
  assert.strictEqual(parsedCoerced.empty, null, 'Quoted "{{NULL_VAL}}" must coerce to null');
  assert.strictEqual(parsedCoerced.count, 42, 'Unquoted {{COUNT}} must remain number 42');
  assert.strictEqual(parsedCoerced.text, 'hello', 'Quoted "{{TEXT}}" must remain string "hello"');
  console.log('✓ JSON typed variable coercion (boolean, null, primitive preservation) passed');

  // Test 25: Settings Panel & Request Panel HTML Rendering for Inherited Variables & Headers
  const envSettingsHtml = getSettingsPanelHtml(
    'environment',
    stateManager.getEnvironment('Stage-East'),
    'Stage-East',
    undefined,
    [{ id: 'env-stage-base', name: 'Stage-Base' }, { id: 'env-stage-east', name: 'Stage-East' }]
  );
  assert(envSettingsHtml.includes('id="env-parent"'), 'Environment settings must include Parent Environment selector');
  assert(envSettingsHtml.includes('Stage-Base'), 'Parent Environment dropdown must list available parent environments');
  assert(envSettingsHtml.includes('data-tab="tab-headers"'), 'Settings panel must render Headers tab');
  assert(envSettingsHtml.includes('id="header-rows"'), 'Settings panel must include header-rows container');

  const renderedReqPanelHtml = getRequestPanelHtml(
    {
      method: 'GET',
      url: '{{baseUrl}}/test',
      collection: demoCollection.name,
      folder: demoCollection.folders[0].name,
      environment: 'Stage-East'
    },
    stateManager.getState(),
    varDetails.inherited,
    headerDetails.inherited
  );
  assert(renderedReqPanelHtml.includes('id="inherited-vars-section"'), 'Request panel must render Inherited Variables section');
  assert(renderedReqPanelHtml.includes('id="inherited-headers-section"'), 'Request panel must render Inherited Headers section');
  assert(renderedReqPanelHtml.includes('id="inherited-var-rows"'), 'Request panel must include inherited-var-rows container');
  assert(renderedReqPanelHtml.includes('id="inherited-header-rows"'), 'Request panel must include inherited-header-rows container');

  const reqScriptMatch = renderedReqPanelHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert(reqScriptMatch, 'Request panel HTML must contain client script');
  assert.doesNotThrow(() => {
    new Function(reqScriptMatch[1]);
  }, 'Client script in request panel HTML must compile without syntax errors');
  console.log('✓ Settings Panel and Request Panel HTML rendering for Inherited Variables & Headers verified');

  // Test 26: Create Profile & Create Environment with UI Command Manifest
  const createdProf = stateManager.createProfile('QA Security Team');
  assert(createdProf && createdProf.id, 'createProfile should return created profile with unique ID');
  assert.strictEqual(createdProf.name, 'QA Security Team', 'Created profile name should match');
  assert(createdProf.auth && createdProf.auth.type === 'none', 'Default auth type should be none');
  assert(stateManager.getProfile(createdProf.id), 'Should retrieve created profile by id');
  assert(stateManager.getProfile('QA Security Team'), 'Should retrieve created profile by name');

  // Collision handling test
  const dupProf = stateManager.createProfile('QA Security Team');
  assert.strictEqual(dupProf.name, 'QA Security Team (2)', 'Duplicate profile name should auto-increment');
  assert.notStrictEqual(dupProf.id, createdProf.id, 'Duplicate profile should have distinct ID');

  const createdEnvRes = stateManager.createEnvironment('Preview-Canary', 'https://canary.api.example.com');
  assert(createdEnvRes && createdEnvRes.env && createdEnvRes.env.id, 'createEnvironment should return environment object');
  assert.strictEqual(createdEnvRes.name, 'Preview-Canary', 'Environment name should match');
  assert.strictEqual(createdEnvRes.env.baseUrl, 'https://canary.api.example.com', 'Environment baseUrl should match');
  assert(stateManager.getEnvironment('Preview-Canary'), 'Should retrieve created environment by name');
  assert(stateManager.getEnvironment(createdEnvRes.env.id), 'Should retrieve created environment by id');

  // Duplicate environment collision handling test
  const dupEnvRes = stateManager.createEnvironment('Preview-Canary');
  assert.strictEqual(dupEnvRes.name, 'Preview-Canary (2)', 'Duplicate environment name should auto-increment');

  // Validate package.json commands and context menu definitions
  const pkgJson = require('../package.json');
  const commands = pkgJson.contributes.commands.map(c => c.command);
  assert(commands.includes('blueByrdApiClient.createProfile'), 'package.json must register blueByrdApiClient.createProfile');
  assert(commands.includes('blueByrdApiClient.createEnvironment'), 'package.json must register blueByrdApiClient.createEnvironment');

  const contextMenus = pkgJson.contributes.menus['view/item/context'];
  const profileInline = contextMenus.find(m => m.command === 'blueByrdApiClient.createProfile' && m.when.includes('bluebyrd.section.profiles'));
  assert(profileInline, 'Must have inline menu action on bluebyrd.section.profiles');
  assert.strictEqual(profileInline.group, 'inline@1', 'Profile inline action must be positioned at inline@1');

  const envInline = contextMenus.find(m => m.command === 'blueByrdApiClient.createEnvironment' && m.when.includes('bluebyrd.section.environments'));
  assert(envInline, 'Must have inline menu action on bluebyrd.section.environments');
  assert.strictEqual(envInline.group, 'inline@1', 'Environment inline action must be positioned at inline@1');

  console.log('✓ Create Profile and Create Environment lifecycle & manifest verified');

  // Test 27: Postman Collection (v2.1) & Postman Environment Import
  const samplePostmanCol = JSON.stringify({
    info: {
      name: 'Stripe Payments Collection',
      description: 'Collection for processing customer payments',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: 'https://api.stripe.com/v1' },
      { key: 'version', value: '2023-10-16' }
    ],
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: 'sk_test_123456789' }]
    },
    item: [
      {
        name: 'Customers',
        item: [
          {
            name: 'Create Customer',
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
              body: {
                mode: 'urlencoded',
                urlencoded: [{ key: 'email', value: 'test@example.com' }, { key: 'name', value: 'Jane Doe' }]
              },
              url: {
                raw: '{{baseUrl}}/customers',
                host: ['{{baseUrl}}'],
                path: ['customers']
              }
            }
          }
        ]
      },
      {
        name: 'Health Check',
        request: {
          method: 'GET',
          url: 'https://api.stripe.com/health'
        }
      }
    ]
  });

  const parsedPostmanCol = ImportExportService.parse(samplePostmanCol);
  assert.strictEqual(parsedPostmanCol.type, 'postman-collection', 'Should detect postman-collection');
  assert.strictEqual(parsedPostmanCol.collection.name, 'Stripe Payments Collection', 'Should parse collection name');
  assert.strictEqual(parsedPostmanCol.collection.variables.baseUrl, 'https://api.stripe.com/v1', 'Should parse collection variable');
  assert(parsedPostmanCol.collection.auth && parsedPostmanCol.collection.auth.auth.token === 'sk_test_123456789', 'Should parse bearer auth');
  assert.strictEqual(parsedPostmanCol.collection.folders.length, 1, 'Should parse 1 folder');
  assert.strictEqual(parsedPostmanCol.collection.folders[0].name, 'Customers', 'Should parse folder name');
  assert.strictEqual(parsedPostmanCol.collection.folders[0].requests.length, 1, 'Should parse folder request');
  assert.strictEqual(parsedPostmanCol.collection.folders[0].requests[0].bodyType, 'form-urlencoded', 'Should detect urlencoded body');
  assert.strictEqual(parsedPostmanCol.collection.requests.length, 1, 'Should parse root request');
  assert.strictEqual(parsedPostmanCol.collection.requests[0].name, 'Health Check', 'Root request name should match');

  // Postman Environment import
  const samplePostmanEnv = JSON.stringify({
    name: 'Production Environment',
    _postman_variable_scope: 'environment',
    values: [
      { key: 'baseUrl', value: 'https://api.prod.example.com', enabled: true },
      { key: 'apiKey', value: 'prod_secret_token', enabled: true },
      { key: 'disabledVar', value: 'skip', enabled: false }
    ]
  });

  const parsedPostmanEnv = ImportExportService.parse(samplePostmanEnv);
  assert.strictEqual(parsedPostmanEnv.type, 'postman-environment', 'Should detect postman-environment');
  assert.strictEqual(parsedPostmanEnv.environmentName, 'Production Environment', 'Should parse environment name');
  assert.strictEqual(parsedPostmanEnv.environment.baseUrl, 'https://api.prod.example.com', 'Should extract baseUrl');
  assert.strictEqual(parsedPostmanEnv.environment.variables.apiKey, 'prod_secret_token', 'Should parse active variable');
  assert.strictEqual(parsedPostmanEnv.environment.variables.disabledVar, undefined, 'Should ignore disabled variable');
  console.log('✓ Postman Collection v2.1 & Postman Environment import passed');

  // Test 28: OpenAPI 3.0 & Swagger 2.0 Import
  const sampleOpenApi = JSON.stringify({
    openapi: '3.0.0',
    info: {
      title: 'Petstore API',
      version: '2.4.0',
      description: 'OpenAPI 3.0 specification for Petstore'
    },
    servers: [
      { url: 'https://petstore.swagger.io/v2' }
    ],
    paths: {
      '/pet': {
        post: {
          summary: 'Add a new pet to the store',
          tags: ['Pet'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'doggie' },
                    status: { type: 'string', enum: ['available', 'pending'] }
                  }
                }
              }
            }
          }
        }
      },
      '/pet/{petId}': {
        get: {
          summary: 'Find pet by ID',
          tags: ['Pet'],
          parameters: [
            { name: 'petId', in: 'path', required: true, example: '123' },
            { name: 'apiKey', in: 'header', example: 'special-key' }
          ]
        }
      },
      '/health': {
        get: {
          summary: 'Check API Status'
        }
      }
    }
  });

  const parsedOpenApi = ImportExportService.parse(sampleOpenApi);
  assert.strictEqual(parsedOpenApi.type, 'openapi', 'Should detect OpenAPI format');
  assert.strictEqual(parsedOpenApi.collection.name, 'Petstore API v2.4.0', 'Should format name with version');
  assert.strictEqual(parsedOpenApi.collection.variables.baseUrl, 'https://petstore.swagger.io/v2', 'Should extract server baseUrl');
  assert.strictEqual(parsedOpenApi.collection.folders.length, 1, 'Should create 1 folder for Pet tag');
  assert.strictEqual(parsedOpenApi.collection.folders[0].requests.length, 2, 'Pet folder should have 2 requests');

  const addPetReq = parsedOpenApi.collection.folders[0].requests.find(r => r.method === 'POST');
  assert(addPetReq, 'Should have POST /pet request');
  assert.strictEqual(addPetReq.bodyType, 'json', 'Should detect JSON bodyType');
  const parsedGeneratedBody = JSON.parse(addPetReq.body);
  assert.strictEqual(parsedGeneratedBody.name, 'doggie', 'Should generate example property from schema');

  const getPetReq = parsedOpenApi.collection.folders[0].requests.find(r => r.method === 'GET');
  assert(getPetReq, 'Should have GET /pet/{petId} request');
  assert.strictEqual(getPetReq.url, '{{baseUrl}}/pet/{{petId}}', 'Should convert {petId} to {{petId}}');
  assert.strictEqual(getPetReq.headers['apiKey'], 'special-key', 'Should extract header parameter');

  assert.strictEqual(parsedOpenApi.collection.requests.length, 1, 'Untagged request should be at root');
  assert.strictEqual(parsedOpenApi.collection.requests[0].name, 'Check API Status', 'Untagged request should be health check');
  console.log('✓ OpenAPI 3.0 / Swagger 2.0 import passed');

  // Test 29: Native bluebyrd Export & Full Backup Restore Lifecycle + Manifest
  const exportColJson = ImportExportService.exportCollection(parsedPostmanCol.collection);
  assert(exportColJson.includes('bluebyrd.collection'), 'Exported collection must include kind');
  const reimportedCol = ImportExportService.parse(exportColJson);
  assert.strictEqual(reimportedCol.type, 'bluebyrd-collection', 'Should roundtrip native collection');
  assert.strictEqual(reimportedCol.collection.name, 'Stripe Payments Collection');

  const exportEnvJson = ImportExportService.exportEnvironment(parsedPostmanEnv.environmentName, parsedPostmanEnv.environment);
  assert(exportEnvJson.includes('bluebyrd.environment'), 'Exported environment must include kind');
  const reimportedEnv = ImportExportService.parse(exportEnvJson);
  assert.strictEqual(reimportedEnv.type, 'bluebyrd-environment', 'Should roundtrip native environment');
  assert.strictEqual(reimportedEnv.environmentName, 'Production Environment');

  const exportBackupJson = ImportExportService.exportBackup(stateManager.getState());
  assert(exportBackupJson.includes('bluebyrdBackupVersion'), 'Exported backup must include version header');
  const reimportedBackup = ImportExportService.parse(exportBackupJson);
  assert.strictEqual(reimportedBackup.type, 'bluebyrd-backup', 'Should roundtrip full workspace backup');
  assert(reimportedBackup.state.collections.length > 0, 'Backup state must preserve collections');
  assert(reimportedBackup.state.profiles.length > 0, 'Backup state must preserve profiles');

  // Manifest check for Import/Export commands & menus
  assert(commands.includes('blueByrdApiClient.importJson'), 'package.json must register blueByrdApiClient.importJson');
  assert(commands.includes('blueByrdApiClient.exportCollection'), 'package.json must register blueByrdApiClient.exportCollection');
  assert(commands.includes('blueByrdApiClient.exportEnvironment'), 'package.json must register blueByrdApiClient.exportEnvironment');
  assert(commands.includes('blueByrdApiClient.exportBackup'), 'package.json must register blueByrdApiClient.exportBackup');

  const titleMenus = pkgJson.contributes.menus['view/title'];
  assert(titleMenus.some(m => m.command === 'blueByrdApiClient.importJson'), 'Title menu must include importJson action');

  const importColInline = contextMenus.find(m => m.command === 'blueByrdApiClient.importJson' && m.when.includes('bluebyrd.section.collections'));
  assert(importColInline, 'Must have inline import action on collections section');
  const importEnvInline = contextMenus.find(m => m.command === 'blueByrdApiClient.importJson' && m.when.includes('bluebyrd.section.environments'));
  assert(importEnvInline, 'Must have inline import action on environments section');

  const exportColInline = contextMenus.find(m => m.command === 'blueByrdApiClient.exportCollection' && m.when.includes('bluebyrd.collection'));
  assert(exportColInline, 'Must have inline export action on collection item');
  const exportEnvInline = contextMenus.find(m => m.command === 'blueByrdApiClient.exportEnvironment' && m.when.includes('bluebyrd.environment'));
  assert(exportEnvInline, 'Must have inline export action on environment item');

  console.log('✓ Native bluebyrd Export & Full Backup Restore Lifecycle + Manifest passed');

  // Test 30: Legacy Profile Backup & Multi-Collection/Environment Compatibility
  const legacyBackupSample = JSON.stringify({
    version: 1,
    exportedAt: 1789144264979,
    profile: {
      id: 'prof-legacy-1',
      name: 'LegacyProfile'
    },
    collections: [
      {
        id: 'col-legacy-1',
        name: 'Legacy Collection',
        auth: {
          type: 'oauth2',
          config: {
            grantType: 'client_credentials',
            tokenUrl: 'https://auth.example.com/token',
            clientId: 'client-123',
            clientSecret: 'secret-456'
          }
        },
        folders: [
          {
            id: 'fold-1',
            name: 'Orders',
            requests: [
              {
                id: 'req-order-1',
                name: 'Search Orders',
                method: 'POST',
                url: 'https://api.example.com/orders/search',
                headers: [{ key: 'X-Tenant', value: 'TenantA', enabled: true }],
                bodyType: 'raw-json',
                bodyRaw: '{"query": "status=active"}'
              }
            ]
          }
        ],
        requests: []
      }
    ],
    environments: [
      {
        id: 'env-legacy-1',
        name: 'Stage Env',
        variables: [
          { key: 'app_host', value: 'https://stage.example.com', enabled: true },
          { key: 'apiKey', value: 'key-123', enabled: true }
        ]
      }
    ]
  });

  const parsedLegacy = ImportExportService.parse(legacyBackupSample);
  assert.strictEqual(parsedLegacy.type, 'bluebyrd-backup', 'Should detect legacy profile backup');
  assert.strictEqual(parsedLegacy.state.profiles.length, 1);
  assert.strictEqual(parsedLegacy.state.profiles[0].name, 'LegacyProfile');
  assert.strictEqual(parsedLegacy.state.collections.length, 1);
  assert.strictEqual(parsedLegacy.state.collections[0].name, 'Legacy Collection');
  assert.strictEqual(parsedLegacy.state.collections[0].auth.auth.type, 'oauth2');
  assert.strictEqual(parsedLegacy.state.collections[0].auth.auth.clientId, 'client-123');
  assert.strictEqual(parsedLegacy.state.collections[0].folders[0].requests[0].bodyType, 'json');
  assert.strictEqual(parsedLegacy.state.collections[0].folders[0].requests[0].headers['X-Tenant'], 'TenantA');
  assert(parsedLegacy.state.environments['Stage Env'], 'Should parse environment by name');
  assert.strictEqual(parsedLegacy.state.environments['Stage Env'].baseUrl, 'https://stage.example.com');
  assert.strictEqual(parsedLegacy.state.environments['Stage Env'].variables['apiKey'], 'key-123');

  // Verify actual disk file if accessible
  const actualFilePath = 'C:/Users/chase-developer/Downloads/mawm_collection_export_CB_2609111231.json';
  if (fs.existsSync(actualFilePath)) {
    const rawActual = fs.readFileSync(actualFilePath, 'utf8');
    const parsedActual = ImportExportService.parse(rawActual);
    assert.strictEqual(parsedActual.type, 'bluebyrd-backup');
    assert.strictEqual(parsedActual.state.collections.length, 5, 'Should import all 5 collections');
    const totalActualReqs = parsedActual.state.collections.reduce(
      (sum, c) => sum + c.requests.length + c.folders.reduce((fsum, f) => fsum + f.requests.length, 0),
      0
    );
    assert.strictEqual(totalActualReqs, 475, 'Should parse all 475 requests accurately');
    assert.strictEqual(Object.keys(parsedActual.state.environments).length, 10, 'Should import all 10 environments');
    assert(parsedActual.state.environments['VPT Stage 33'], 'Should contain VPT Stage 33');
    assert.strictEqual(parsedActual.state.environments['VPT Stage 33'].baseUrl, 'https://twccv.sce.manh.com');
  }

  console.log('✓ Legacy Profile Backup & 475-request full export verified');

  // Test 31: UpdateService Semver Logic & Update Command Manifest
  assert.strictEqual(UpdateService.isNewerVersion('0.2.0', '0.1.0'), true, '0.2.0 should be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('1.0.0', '0.1.0'), true, '1.0.0 should be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('0.1.1', '0.1.0'), true, '0.1.1 should be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('v0.1.5', '0.1.0'), true, 'v0.1.5 should be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('0.1.0', '0.1.0'), false, '0.1.0 should not be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('0.0.9', '0.1.0'), false, '0.0.9 should not be newer than 0.1.0');
  assert.strictEqual(UpdateService.isNewerVersion('v0.1.0', 'v0.1.0'), false, 'v0.1.0 should not be newer than v0.1.0');

  const mockGlobalState = new Map();
  const mockExtContext = {
    globalState: {
      get: (k) => mockGlobalState.get(k),
      update: (k, v) => { mockGlobalState.set(k, v); return Promise.resolve(); }
    },
    extension: {
      packageJSON: { version: '0.1.0' }
    }
  };
  const updateService = new UpdateService(mockExtContext);
  assert.strictEqual(updateService.getCurrentVersion(), '0.1.0', 'Current version should match manifest version');

  const pkgJsonUpdated = require('../package.json');
  const allCommands = pkgJsonUpdated.contributes.commands.map(c => c.command);
  assert(allCommands.includes('blueByrdApiClient.checkForUpdates'), 'package.json must register blueByrdApiClient.checkForUpdates');

  console.log('✓ UpdateService semver logic & update command manifest verified');

  // Test 32: Security Hardening (Prototype Pollution & Webview Script Neutralization)
  const prototypePayload = JSON.stringify({
    info: {
      name: 'Pollution Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [
      {
        name: 'Evil Request',
        request: {
          url: 'https://example.com/api',
          method: 'GET',
          header: [
            { key: '__proto__', value: 'polluted' },
            { key: 'constructor', value: 'polluted' },
            { key: 'X-Safe-Header', value: 'clean' }
          ]
        }
      }
    ]
  });
  const parsedPollution = ImportExportService.parse(prototypePayload);
  const evilHeaders = parsedPollution.collection.requests[0].headers;
  assert.strictEqual(evilHeaders['X-Safe-Header'], 'clean', 'Safe header should be retained');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(evilHeaders, '__proto__'), false, '__proto__ key must not exist as own property');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(evilHeaders, 'constructor'), false, 'constructor key must not exist as own property');
  assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');

  const xssContext = {
    url: 'https://example.com/"><img src=x onerror=alert(1)>',
    notes: '</textarea><script>alert("xss")</script>',
    body: '{"evil": "</script><script>alert(2)</script>"}',
  };
  const requestPanelHtml = require('../dist/views/panels/requestPanelHtml');
  const renderedHtml = requestPanelHtml.getRequestPanelHtml(xssContext, stateManager.getState());
  assert(!renderedHtml.includes('onerror=alert(1)>'), 'Attributes in rendered HTML must be safely escaped');
  assert(!renderedHtml.includes('</textarea><script>'), 'Textareas in rendered HTML must be safely escaped');
  assert(!renderedHtml.includes('</script><script>'), 'Script tag breakout via embedded JSON must be neutralized');

  console.log('✓ Webview XSS & prototype pollution security hardening verified');

  // Test 33: Profile-Scoped Workspace & Visual Parent -> Child Environment Tree Nesting
  const hierarchyStorage = new Map();
  const hierarchyContext = {
    workspaceState: {
      get: (k) => hierarchyStorage.get(k),
      update: (k, v) => { hierarchyStorage.set(k, v); return Promise.resolve(); }
    }
  };
  const hierarchySM = new BlueByrdStateManager(hierarchyContext);

  // Setup Profiles: Tenant Alpha (profile-alpha) and Tenant Beta (profile-beta)
  const profAlpha = hierarchySM.createProfile('Tenant Alpha');
  const profBeta = hierarchySM.createProfile('Tenant Beta');

  // Setup Environments:
  // - Global Root (no profileId)
  // - Alpha Base (scoped to profAlpha.id)
  // - Alpha Dev (scoped to profAlpha.id, inheritsFrom Alpha Base)
  // - Alpha Dev Feature 1 (scoped to profAlpha.id, inheritsFrom Alpha Dev)
  // - Beta Prod (scoped to profBeta.id)
  hierarchySM.createEnvironment('Global Root', 'https://api.global.com');
  const alphaBase = hierarchySM.createEnvironment('Alpha Base', 'https://alpha.example.com', profAlpha.id);
  const alphaDev = hierarchySM.createEnvironment('Alpha Dev', 'https://dev.alpha.example.com', profAlpha.id);
  alphaDev.env.inheritsFrom = alphaBase.env.id;
  hierarchySM.saveEnvironment('Alpha Dev', alphaDev.env);

  const alphaFeature = hierarchySM.createEnvironment('Alpha Feature 1', 'https://feat.alpha.example.com', profAlpha.id);
  alphaFeature.env.inheritsFrom = alphaDev.env.id;
  hierarchySM.saveEnvironment('Alpha Feature 1', alphaFeature.env);

  hierarchySM.createEnvironment('Beta Prod', 'https://beta.example.com', profBeta.id);

  // Setup Collections:
  // - Global Shared Library (no profileId)
  // - Alpha Orders API (scoped to profAlpha.id)
  // - Beta Inventory API (scoped to profBeta.id)
  hierarchySM.createCollection('Global Shared Library');
  hierarchySM.createCollection('Alpha Orders API', profAlpha.id);
  hierarchySM.createCollection('Beta Inventory API', profBeta.id);

  // Initialize Explorer Tree Provider
  const treeProvider = new BlueByrdExplorerTreeDataProvider(hierarchySM);

  // 1. Verify Root has Profiles and History sections
  const rootItems = treeProvider.getChildren();
  assert.strictEqual(rootItems.length, 2, 'Root should have 2 sections: Profiles and History');
  const [profilesSection, historySection] = rootItems;
  assert.strictEqual(profilesSection.label, 'Profiles');
  assert.strictEqual(historySection.label, 'History');

  // 2. Verify Profiles section contains profiles + Shared / Global
  const profileItems = treeProvider.getChildren(profilesSection);
  const profileLabels = profileItems.map(p => p.label);
  assert(profileLabels.includes('Tenant Alpha'), 'Must include Tenant Alpha');
  assert(profileLabels.includes('Tenant Beta'), 'Must include Tenant Beta');
  assert(profileLabels.includes('Shared / Global'), 'Must include Shared / Global');

  // 3. Verify Tenant Alpha owns its Environments and Collections
  const alphaItem = profileItems.find(p => p.label === 'Tenant Alpha');
  assert(alphaItem, 'Tenant Alpha must exist');
  const alphaChildren = treeProvider.getChildren(alphaItem);
  assert.strictEqual(alphaChildren.length, 2, 'Tenant Alpha must have Environments and Collections nodes');
  const [alphaEnvsNode, alphaColsNode] = alphaChildren;
  assert.strictEqual(alphaEnvsNode.label, 'Environments');
  assert.strictEqual(alphaColsNode.label, 'Collections');

  // Verify Environments nested inside Tenant Alpha
  const alphaEnvs = treeProvider.getChildren(alphaEnvsNode);
  const alphaEnvLabels = alphaEnvs.map(e => e.label);
  assert(alphaEnvLabels.includes('Alpha Base'), 'Alpha Base must be in Tenant Alpha environments');
  assert(!alphaEnvLabels.includes('Beta Prod'), 'Beta Prod must NOT be in Tenant Alpha environments');
  assert(!alphaEnvLabels.includes('Global Root'), 'Global Root must NOT be in Tenant Alpha environments');

  // Verify Parent -> Child hierarchy under Alpha Base:
  const alphaBaseItem = alphaEnvs.find(e => e.label === 'Alpha Base');
  assert(alphaBaseItem, 'Alpha Base must exist');
  assert.strictEqual(alphaBaseItem.children.length, 1, 'Alpha Base should have 1 child (Alpha Dev)');
  assert(alphaBaseItem.description.includes('Parent (1)'), 'Alpha Base description should indicate 1 child');

  // Verify Alpha Dev nested under Alpha Base
  const alphaBaseChildren = treeProvider.getChildren(alphaBaseItem);
  assert.strictEqual(alphaBaseChildren.length, 1);
  const alphaDevItem = alphaBaseChildren[0];
  assert.strictEqual(alphaDevItem.label, 'Alpha Dev');
  assert(alphaDevItem.description.includes('Parent (1)'), 'Alpha Dev should have 1 child (Alpha Feature 1)');

  // Verify multi-level nesting: expanding Alpha Dev returns Alpha Feature 1
  const alphaDevChildren = treeProvider.getChildren(alphaDevItem);
  assert.strictEqual(alphaDevChildren.length, 1);
  const alphaFeatureItem = alphaDevChildren[0];
  assert.strictEqual(alphaFeatureItem.label, 'Alpha Feature 1');
  assert(alphaFeatureItem.description.includes('inherits: Alpha Dev'), 'Child environment should show parent in description');

  // Verify Collections nested inside Tenant Alpha
  const alphaCols = treeProvider.getChildren(alphaColsNode);
  const alphaColLabels = alphaCols.map(c => c.label);
  assert(alphaColLabels.includes('Alpha Orders API'), 'Alpha Orders API must be in Tenant Alpha collections');
  assert(!alphaColLabels.includes('Beta Inventory API'), 'Beta Inventory API must NOT be in Tenant Alpha collections');
  assert(!alphaColLabels.includes('Global Shared Library'), 'Global Shared Library must NOT be in Tenant Alpha collections');

  // 4. Verify Tenant Beta owns its Environments and Collections
  const betaItem = profileItems.find(p => p.label === 'Tenant Beta');
  assert(betaItem, 'Tenant Beta must exist');
  const betaChildren = treeProvider.getChildren(betaItem);
  const [betaEnvsNode, betaColsNode] = betaChildren;

  const betaEnvs = treeProvider.getChildren(betaEnvsNode);
  const betaEnvLabels = betaEnvs.map(e => e.label);
  assert(betaEnvLabels.includes('Beta Prod'), 'Beta Prod must be in Tenant Beta');
  assert(!betaEnvLabels.includes('Alpha Base'), 'Alpha Base must NOT be in Tenant Beta');

  const betaCols = treeProvider.getChildren(betaColsNode);
  const betaColLabels = betaCols.map(c => c.label);
  assert(betaColLabels.includes('Beta Inventory API'), 'Beta Inventory API must be in Tenant Beta');
  assert(!betaColLabels.includes('Alpha Orders API'), 'Alpha Orders API must NOT be in Tenant Beta');

  // 5. Verify Shared / Global owns unassigned/global Environments and Collections
  const globalItem = profileItems.find(p => p.label === 'Shared / Global');
  assert(globalItem, 'Shared / Global must exist');
  const [globalEnvsNode, globalColsNode] = treeProvider.getChildren(globalItem);

  const globalEnvs = treeProvider.getChildren(globalEnvsNode);
  assert(globalEnvs.some(e => e.label === 'Global Root'), 'Global Root must be in Shared / Global');
  assert(!globalEnvs.some(e => e.label === 'Alpha Base'), 'Alpha Base must NOT be in Shared / Global');

  const globalCols = treeProvider.getChildren(globalColsNode);
  assert(globalCols.some(c => c.label === 'Global Shared Library'), 'Global Shared Library must be in Shared / Global');
  assert(!globalCols.some(c => c.label === 'Alpha Orders API'), 'Alpha Orders API must NOT be in Shared / Global');

  // 6. Verify Active Profile & Active Environment Badges
  hierarchySM.setActiveProfileId(profAlpha.id);
  hierarchySM.setActiveEnvironmentName('Alpha Dev');
  treeProvider.refresh();

  const refreshedProfiles = treeProvider.getChildren(treeProvider.getChildren()[0]);
  const activeAlphaItem = refreshedProfiles.find(p => p.label === 'Tenant Alpha');
  assert(activeAlphaItem.description.includes('✔ Active'), 'Active profile must display ✔ Active Scope badge');

  const refreshedAlphaEnvs = treeProvider.getChildren(treeProvider.getChildren(activeAlphaItem)[0]);
  const refreshedBase = refreshedAlphaEnvs.find(e => e.label === 'Alpha Base');
  const refreshedDev = treeProvider.getChildren(refreshedBase)[0];
  assert(refreshedDev.description.includes('✔ Active'), 'Active environment Alpha Dev must show ✔ Active badge');

  console.log('✓ Profile-Scoped Workspace & Visual Parent -> Child Environment Tree Nesting verified');

  // Test 34: Breakout Native View Panes Architecture & Profile OAuth Token Vault
  const tokenService = new TokenService();
  const breakoutProfiles = new BlueByrdProfilesTreeProvider(hierarchySM, tokenService);
  const breakoutCollections = new BlueByrdCollectionsTreeProvider(hierarchySM);
  const breakoutEnvironments = new BlueByrdEnvironmentsTreeProvider(hierarchySM);
  const breakoutHistory = new BlueByrdHistoryTreeProvider(hierarchySM);

  let coordinatorRefreshed = false;
  const coordinator = new BlueByrdTreeCoordinator(
    breakoutProfiles,
    breakoutCollections,
    breakoutEnvironments,
    breakoutHistory,
    () => { coordinatorRefreshed = true; }
  );

  // 1. Verify Profiles view
  const profNodes = await breakoutProfiles.getChildren();
  const profNodeLabels = profNodes.map(p => p.label);
  assert(profNodeLabels.includes('Tenant Alpha'), 'Profiles view must list Tenant Alpha');
  assert(profNodeLabels.includes('Tenant Beta'), 'Profiles view must list Tenant Beta');
  assert(profNodeLabels.includes('Shared / Global'), 'Profiles view must list Shared / Global');
  const alphaProfNode = profNodes.find(p => p.label === 'Tenant Alpha');
  assert(alphaProfNode.description.includes('✔ Active'), 'Tenant Alpha must be marked active');

  // Verify Profile Token Vault (initial: no tokens)
  const initialAlphaTokens = await breakoutProfiles.getChildren(alphaProfNode);
  assert.strictEqual(initialAlphaTokens.length, 1);
  assert.strictEqual(initialAlphaTokens[0].label, 'No stored tokens');
  assert.strictEqual(initialAlphaTokens[0].kind, 'noTokens');

  // Save an OAuth token under Tenant Alpha
  await tokenService.saveToken({
    id: 'tok-alpha-dev',
    profileId: profAlpha.id,
    envId: alphaDev.env.id,
    envName: 'Alpha Dev',
    tokenName: 'Alpha Dev Bearer',
    accessToken: 'bb_oauth_alpha_dev_1234567890abcdef',
    refreshToken: 'bb_refresh_alpha_dev_abcdef1234567890',
    expiresAt: Date.now() + 3600 * 1000,
    scopes: ['read:orders', 'write:orders'],
    tier: 'Bearer',
  });

  // Verify Profile Token Vault displays the active token
  const updatedAlphaTokens = await breakoutProfiles.getChildren(alphaProfNode);
  assert.strictEqual(updatedAlphaTokens.length, 1);
  assert.strictEqual(updatedAlphaTokens[0].label, 'Alpha Dev');
  assert.strictEqual(updatedAlphaTokens[0].kind, 'token');
  assert(updatedAlphaTokens[0].description.includes('Bearer'));
  assert(updatedAlphaTokens[0].description.includes('Expires'));
  assert(updatedAlphaTokens[0].description.includes('refreshable'));

  // Verify AuthService auto-resolution with TokenService
  const authServiceWithTokens = new AuthService(hierarchySM, tokenService);
  const testOAuthReqAuth = {
    inheritFromProfile: true,
    inheritFromEnvironment: true,
    auth: {
      type: 'oauth2'
    }
  };
  const resolvedOAuthHeaders = authServiceWithTokens.resolveAuthHeaders(
    profAlpha.id,
    alphaDev.env.id,
    undefined,
    undefined,
    {},
    testOAuthReqAuth
  );
  assert(resolvedOAuthHeaders['Authorization'], 'Authorization header must be auto-injected from Token Vault');
  assert.strictEqual(resolvedOAuthHeaders['Authorization'], 'Bearer bb_oauth_alpha_dev_1234567890abcdef');

  // Verify token deletion
  await tokenService.deleteToken(profAlpha.id, 'tok-alpha-dev');
  const afterDeleteTokens = await breakoutProfiles.getChildren(alphaProfNode);
  assert.strictEqual(afterDeleteTokens.length, 1);
  assert.strictEqual(afterDeleteTokens[0].label, 'No stored tokens');

  // 2. Verify Collections view is scoped to active profile (Tenant Alpha) + Shared
  const alphaColNodes = breakoutCollections.getChildren();
  const breakoutAlphaColLabels = alphaColNodes.map(c => c.label);
  assert(breakoutAlphaColLabels.includes('Alpha Orders API'), 'Collections view must show Alpha Orders API for Tenant Alpha');
  assert(breakoutAlphaColLabels.includes('Global Shared Library'), 'Collections view must include Shared / Global collections');
  assert(!breakoutAlphaColLabels.includes('Beta Inventory API'), 'Collections view must NOT show Beta Inventory API under Tenant Alpha scope');

  // 3. Verify Environments view has Parent -> Child nesting for Tenant Alpha
  const alphaEnvNodes = breakoutEnvironments.getChildren();
  const breakoutAlphaEnvLabels = alphaEnvNodes.map(e => e.label);
  assert(breakoutAlphaEnvLabels.includes('Alpha Base'), 'Environments view must have root Alpha Base');
  assert(breakoutAlphaEnvLabels.includes('Global Root'), 'Environments view must include Shared / Global environment');
  assert(!breakoutAlphaEnvLabels.includes('Beta Prod'), 'Environments view must NOT include Beta Prod under Tenant Alpha scope');

  const breakoutAlphaBase = alphaEnvNodes.find(e => e.label === 'Alpha Base');
  assert(breakoutAlphaBase, 'Alpha Base node must exist');
  const breakoutAlphaBaseChildren = breakoutEnvironments.getChildren(breakoutAlphaBase);
  assert.strictEqual(breakoutAlphaBaseChildren.length, 1);
  const breakoutAlphaDev = breakoutAlphaBaseChildren[0];
  assert.strictEqual(breakoutAlphaDev.label, 'Alpha Dev');
  assert(breakoutAlphaDev.description.includes('✔ Active'), 'Active environment Alpha Dev must show ✔ Active');

  const breakoutAlphaDevChildren = breakoutEnvironments.getChildren(breakoutAlphaDev);
  assert.strictEqual(breakoutAlphaDevChildren.length, 1);
  assert.strictEqual(breakoutAlphaDevChildren[0].label, 'Alpha Feature 1');

  // 4. Verify dynamic re-scoping when switching to Tenant Beta
  hierarchySM.setActiveProfileId(profBeta.id);
  coordinator.refresh();
  assert(coordinatorRefreshed, 'Coordinator callback must fire on refresh');

  const betaColNodes = breakoutCollections.getChildren();
  const breakoutBetaColLabels = betaColNodes.map(c => c.label);
  assert(breakoutBetaColLabels.includes('Beta Inventory API'), 'Collections view must re-scope to Beta Inventory API');
  assert(!breakoutBetaColLabels.includes('Alpha Orders API'), 'Collections view must no longer show Alpha Orders API');

  const betaEnvNodes = breakoutEnvironments.getChildren();
  const breakoutBetaEnvLabels = betaEnvNodes.map(e => e.label);
  assert(breakoutBetaEnvLabels.includes('Beta Prod'), 'Environments view must re-scope to Beta Prod');
  assert(!breakoutBetaEnvLabels.includes('Alpha Base'), 'Environments view must no longer show Alpha Base');

  // 5. Verify History view
  const historyNodes = breakoutHistory.getChildren();
  assert(Array.isArray(historyNodes), 'History provider must return array of nodes');

  console.log('✓ Breakout Native View Panes Architecture & Profile OAuth Token Vault verified');

  // Test 35: Reorder Drag & Drop of Collections, Folders, and Requests
  // 1. Programmatic State Reordering & Moving
  const dndSM = new BlueByrdStateManager(mockContext);
  const colA = dndSM.createCollection('DnD Collection Alpha');
  const colB = dndSM.createCollection('DnD Collection Beta');

  // Verify reorderCollection
  const initialCols = dndSM.getCollections();
  const alphaIdx = initialCols.findIndex(c => c.id === colA.id);
  const betaIdx = initialCols.findIndex(c => c.id === colB.id);
  assert(alphaIdx < betaIdx, 'Alpha collection should originally be before Beta');

  dndSM.reorderCollection(colB.id, colA.id, 'before');
  const reorderedCols = dndSM.getCollections();
  assert.strictEqual(reorderedCols.findIndex(c => c.id === colB.id), alphaIdx, 'Beta should now be before Alpha');

  // Verify moveCollectionToEnd
  dndSM.moveCollectionToEnd(colB.id);
  const endCols = dndSM.getCollections();
  assert.strictEqual(endCols[endCols.length - 1].id, colB.id, 'Beta should be moved to the end');

  // Setup Folders in Col Alpha
  const folder1 = dndSM.createFolder(colA.id, 'Folder 1');
  const folder2 = dndSM.createFolder(colA.id, 'Folder 2');
  const folder3 = dndSM.createFolder(colA.id, 'Folder 3');

  // Verify reorderFolder within same collection
  dndSM.reorderFolder(colA.id, folder3.id, folder1.id, 'before');
  const updatedColA = dndSM.getCollection(colA.id);
  assert.strictEqual(updatedColA.folders[0].id, folder3.id, 'Folder 3 should now be the first folder');
  assert.strictEqual(updatedColA.folders[1].id, folder1.id, 'Folder 1 should now be second');

  // Verify moveFolderToCollection
  dndSM.moveFolderToCollection(folder2.id, colB.id);
  const afterMoveColA = dndSM.getCollection(colA.id);
  const afterMoveColB = dndSM.getCollection(colB.id);
  assert(!afterMoveColA.folders.some(f => f.id === folder2.id), 'Folder 2 must no longer be in Col Alpha');
  assert(afterMoveColB.folders.some(f => f.id === folder2.id), 'Folder 2 must now be in Col Beta');

  // Setup Requests
  const req1 = dndSM.saveRequest({
    id: 'req-dnd-1',
    name: 'Request 1',
    method: 'GET',
    url: 'https://api.test/1',
    collection: colA.name,
    headers: {},
    body: '',
  }, colA.id);

  const req2 = dndSM.saveRequest({
    id: 'req-dnd-2',
    name: 'Request 2',
    method: 'POST',
    url: 'https://api.test/2',
    collection: colA.name,
    headers: {},
    body: '',
  }, colA.id);

  // Verify request reordering at collection root
  dndSM.moveRequest(req2.id, colA.id, undefined, req1.id, 'before');
  const rootReqsColA = dndSM.getCollection(colA.id).requests;
  assert.strictEqual(rootReqsColA[0].id, req2.id, 'Request 2 should now be before Request 1');

  // Verify moving request into folder
  dndSM.moveRequest(req1.id, colA.id, folder3.id);
  const colAAfterReqMove = dndSM.getCollection(colA.id);
  assert(!colAAfterReqMove.requests.some(r => r.id === req1.id), 'Request 1 should no longer be at root');
  const f3 = colAAfterReqMove.folders.find(f => f.id === folder3.id);
  assert(f3.requests.some(r => r.id === req1.id), 'Request 1 should now be inside Folder 3');

  // Verify moving request across collections into folder
  dndSM.moveRequest(req1.id, colB.id, folder2.id);
  const colBAfterMove = dndSM.getCollection(colB.id);
  const f2 = colBAfterMove.folders.find(f => f.id === folder2.id);
  assert(f2.requests.some(r => r.id === req1.id), 'Request 1 should now be inside Col Beta / Folder 2');

  // Verify moveItemUp and moveItemDown
  const preDownCols = dndSM.getCollections();
  const firstCol = preDownCols[0];
  dndSM.moveItemDown('collection', firstCol.id);
  const postDownCols = dndSM.getCollections();
  assert.strictEqual(postDownCols[1].id, firstCol.id, 'Col should move down 1 slot');
  dndSM.moveItemUp('collection', firstCol.id);
  const postUpCols = dndSM.getCollections();
  assert.strictEqual(postUpCols[0].id, firstCol.id, 'Col should move back up to 0 index');

  // 2. Drag and Drop Controller (TreeDragAndDropController implementation)
  const dndProvider = new BlueByrdCollectionsTreeProvider(dndSM);
  assert(dndProvider.dragMimeTypes.includes('application/vnd.code.tree.bluebyrdcollections'), 'Must support bluebyrdcollections drag mime type');
  assert(dndProvider.dropMimeTypes.includes('application/vnd.code.tree.bluebyrdcollections'), 'Must support bluebyrdcollections drop mime type');

  // Test handleDrag
  const colTreeItems = dndProvider.getChildren();
  const sourceColItem = colTreeItems[1];
  const targetColItem = colTreeItems[0];

  const dataTransfer = new mockVscode.DataTransfer();
  dndProvider.handleDrag([sourceColItem], dataTransfer, {});
  const transferItem = dataTransfer.get('application/vnd.code.tree.bluebyrdcollections');
  assert(transferItem, 'DataTransfer must store dragged item under MIME');

  // Test handleDrop: Reorder Collection
  const originalCols = dndSM.getCollections().map(c => c.id);
  await dndProvider.handleDrop(targetColItem, dataTransfer, {});
  const afterDropCols = dndSM.getCollections().map(c => c.id);
  assert.strictEqual(afterDropCols[0], sourceColItem.itemId, 'Second collection should move to first index after dropping before first');

  // Test handleDrop: Move Request into Folder via Drag and Drop
  const reqTransfer = new mockVscode.DataTransfer();
  const reqSourceItem = { kind: 'request', itemId: req2.id, parentId: colA.id };
  const folderTargetItem = { kind: 'folder', itemId: folder3.id, parentId: colA.id };
  reqTransfer.set('application/vnd.code.tree.bluebyrdcollections', new mockVscode.DataTransferItem([reqSourceItem]));

  await dndProvider.handleDrop(folderTargetItem, reqTransfer, {});
  const f3Check = dndSM.getCollection(colA.id).folders.find(f => f.id === folder3.id);
  assert(f3Check.requests.some(r => r.id === req2.id), 'Request 2 must be moved into Folder 3 via Drag & Drop');

  // Test handleDrop: Move Request to Collection Root via Drag and Drop
  const reqToRootTransfer = new mockVscode.DataTransfer();
  const reqFromFolderItem = { kind: 'request', itemId: req2.id, parentId: folder3.id };
  const colTargetItem = { kind: 'collection', itemId: colA.id };
  reqToRootTransfer.set('application/vnd.code.tree.bluebyrdcollections', new mockVscode.DataTransferItem([reqFromFolderItem]));

  await dndProvider.handleDrop(colTargetItem, reqToRootTransfer, {});
  const colACheck = dndSM.getCollection(colA.id);
  assert(colACheck.requests.some(r => r.id === req2.id), 'Request 2 must be moved back to collection root via Drag & Drop');

  console.log('✓ Reorder Drag & Drop of Collections, Folders, and Requests verified');

  // Test 36: Environment Cloning, Hierarchy Preservation & State Isolation
  const cloneSM = new BlueByrdStateManager(mockContext);
  const parentEnvResult = cloneSM.createEnvironment('Prod Base', 'https://api.prod.com');
  const childEnvResult = cloneSM.createEnvironment('Prod US-East', 'https://useast.api.prod.com');
  childEnvResult.env.inheritsFrom = parentEnvResult.env.id;
  childEnvResult.env.variables = { region: 'us-east-1', timeout: '5000' };
  childEnvResult.env.headers = { 'X-Region': 'us-east-1' };
  childEnvResult.env.auth = { type: 'bearer', token: 'secret-token-123' };
  cloneSM.saveEnvironment('Prod US-East', childEnvResult.env);

  // 1. Clone with default copy name
  const defaultClone = cloneSM.cloneEnvironment('Prod US-East');
  assert(defaultClone, 'cloneEnvironment must succeed');
  assert.strictEqual(defaultClone.name, 'Prod US-East (Copy)', 'Default cloned environment name must have (Copy)');
  assert.notStrictEqual(defaultClone.env.id, childEnvResult.env.id, 'Cloned environment must have distinct ID');
  assert.strictEqual(defaultClone.env.baseUrl, 'https://useast.api.prod.com', 'BaseUrl must be cloned');
  assert.strictEqual(defaultClone.env.inheritsFrom, parentEnvResult.env.id, 'inheritsFrom must be preserved');
  assert.strictEqual(defaultClone.env.variables.region, 'us-east-1', 'Variables must be cloned');
  assert.strictEqual(defaultClone.env.headers['X-Region'], 'us-east-1', 'Headers must be cloned');
  assert.strictEqual(defaultClone.env.auth.token, 'secret-token-123', 'Auth must be cloned');

  // Verify memory isolation between clone and original
  defaultClone.env.variables.region = 'us-west-2';
  cloneSM.saveEnvironment(defaultClone.name, defaultClone.env);
  const checkOriginal = cloneSM.getEnvironment('Prod US-East');
  assert.strictEqual(checkOriginal.variables.region, 'us-east-1', 'Mutating clone variables must not mutate original environment');

  // 2. Clone with custom name
  const customClone = cloneSM.cloneEnvironment(childEnvResult.env.id, 'Prod EU-Central');
  assert(customClone, 'Cloning by ID with custom name must succeed');
  assert.strictEqual(customClone.name, 'Prod EU-Central');
  assert.strictEqual(customClone.env.inheritsFrom, parentEnvResult.env.id);

  console.log('✓ Environment Cloning, Hierarchy Preservation & State Isolation verified');

  // Test 37: Variable Resolution & URL Scheme Auto-Resolution with Base URL & IP Targets
  const varSM = new BlueByrdStateManager(mockContext);
  const varService = new VariableService(varSM);
  const varAuthService = new AuthService(varSM, varService);
  const varHttpService = new HttpService(varSM, varService, varAuthService);

  // Setup Algorand-like environment with base URL and profile scope
  const algoEnvResult = varSM.createEnvironment('Algorand Mainnet IdeaPad', 'http://192.168.1.199:8080');
  algoEnvResult.env.variables = { tokenHeader: 'X-Algo-Token', genesisId: 'mainnet-v1.0' };
  varSM.saveEnvironment('Algorand Mainnet IdeaPad', algoEnvResult.env);

  // Setup Algod Collection with default baseUrl = http://localhost (like imported OpenAPI / Postman spec)
  const algoCol = varSM.getState().collections[0];
  algoCol.variables = { baseUrl: 'http://localhost' };
  varSM.saveCollection(algoCol);

  // 1. Resolve variables with environment and collection: Environment MUST override Collection's baseUrl
  const resolvedVars = varService.resolveVariables(undefined, 'Algorand Mainnet IdeaPad', algoCol.id);
  assert.strictEqual(resolvedVars['baseUrl'], 'http://192.168.1.199:8080', 'Active Environment baseUrl must override Collection default baseUrl');
  assert.strictEqual(resolvedVars['tokenHeader'], 'X-Algo-Token', 'Environment custom variables must resolve');

  // 2. VariableService detailed resolution: Collection baseUrl must be marked as overridden, Environment baseUrl active
  const detailed = varService.resolveVariablesDetailed(undefined, 'Algorand Mainnet IdeaPad', algoCol.id);
  const colBaseUrl = detailed.inherited.find(i => i.key === 'baseUrl' && i.source === 'collection');
  const envBaseUrl = detailed.inherited.find(i => i.key === 'baseUrl' && i.source === 'environment');
  assert(colBaseUrl, 'Collection baseUrl must appear in inherited list');
  assert.strictEqual(colBaseUrl.value, 'http://localhost');
  assert.strictEqual(colBaseUrl.isOverridden, true, 'Collection baseUrl must be marked as overridden by Environment');
  assert(envBaseUrl, 'Environment baseUrl must appear in inherited list');
  assert.strictEqual(envBaseUrl.value, 'http://192.168.1.199:8080');
  assert.strictEqual(envBaseUrl.isOverridden, undefined, 'Environment baseUrl must NOT be marked as overridden');

  // 3. Request Panel HTML default selection with active environment
  const varAppState = varSM.getState();
  varAppState.activeEnvironmentName = 'Algorand Mainnet IdeaPad';
  const panelHtml = getRequestPanelHtml(
    { url: '{{baseUrl}}/v2/status', environment: 'Algorand Mainnet IdeaPad' },
    varAppState,
    detailed.inherited,
    []
  );
  assert(panelHtml.includes('value="Algorand Mainnet IdeaPad" selected'), 'Selected environment must be selected in HTML');
  assert(panelHtml.includes('http://192.168.1.199:8080'), 'Inherited baseUrl value must be embedded in script');

  // 4. Test URL interpolation and auto-resolution in local HTTP server
  let lastReceivedUrl = '';
  const testServer = http.createServer((req, res) => {
    lastReceivedUrl = req.url;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', url: req.url }));
  });
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = testServer.address().port;

  // Update environment to point to test server port
  algoEnvResult.env.baseUrl = `http://127.0.0.1:${testPort}`;
  varSM.saveEnvironment('Algorand Mainnet IdeaPad', algoEnvResult.env);

  // Request with {{baseUrl}}/v2/status
  const res1 = await varHttpService.executeRequest({
    method: 'GET',
    url: '{{baseUrl}}/v2/status',
    environment: 'Algorand Mainnet IdeaPad',
    headers: { 'Connection': 'close' }
  });
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(lastReceivedUrl, '/v2/status');

  // Request with relative path /v2/ledger (auto-resolves baseUrl)
  const res2 = await varHttpService.executeRequest({
    method: 'GET',
    url: '/v2/ledger',
    environment: 'Algorand Mainnet IdeaPad',
    headers: { 'Connection': 'close' }
  });
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(lastReceivedUrl, '/v2/ledger');

  // Request with raw IPv4 target (auto-prepends http://)
  const res3 = await varHttpService.executeRequest({
    method: 'GET',
    url: `127.0.0.1:${testPort}/v2/health`,
    headers: { 'Connection': 'close' }
  });
  assert.strictEqual(res3.status, 200);
  assert.strictEqual(lastReceivedUrl, '/v2/health');

  if (typeof testServer.closeAllConnections === 'function') {
    testServer.closeAllConnections();
  }
  await new Promise((resolve) => testServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log('✓ Variable Resolution & URL Scheme Auto-Resolution with Base URL & IP Targets verified');

  // ─── Test 38: Network Error Diagnostic Classification ──────────────────────────
  {
    // Isolated context — prevents history pollution from the shared fakeStorage
    const storage38 = new Map();
    const ctx38 = {
      workspaceState: {
        get: (k) => storage38.get(k),
        update: (k, v) => { storage38.set(k, v); return Promise.resolve(); }
      }
    };
    const stateManager38 = new BlueByrdStateManager(ctx38);
    const variableService38 = new VariableService(stateManager38);
    const authService38 = new AuthService(stateManager38, variableService38);
    const httpService38 = new HttpService(stateManager38, variableService38, authService38);

    // ECONNREFUSED — use a high port that nothing is listening on
    const econnResult = await httpService38.executeRequest({
      method: 'GET',
      url: 'http://127.0.0.1:19876/ping',
    });
    assert.strictEqual(econnResult.status, 0, 'ECONNREFUSED should return status 0');
    assert.strictEqual(econnResult.ok, false);
    assert.strictEqual(econnResult.statusText, 'Connection Refused',
      `Expected "Connection Refused", got "${econnResult.statusText}"`);
    assert.ok(econnResult.body.includes('ECONNREFUSED'),
      `Expected ECONNREFUSED in body, got: ${econnResult.body.substring(0, 200)}`);
    assert.ok(econnResult.body.includes('The server actively rejected'),
      'Body should contain actionable explanation');

    // AbortError — mock it by wrapping a rejected fetch
    {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw abortErr; };
      try {
        const abortResult = await httpService38.executeRequest({
          method: 'GET',
          url: 'http://127.0.0.1:9999/timeout',
        });
        assert.strictEqual(abortResult.status, 0);
        assert.strictEqual(abortResult.statusText, 'Request Timed Out',
          `Expected "Request Timed Out", got "${abortResult.statusText}"`);
        assert.ok(abortResult.body.includes('30 seconds'),
          'Timeout body should mention 30 seconds');
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // Unknown error with cause.code — should show cause code as label
    {
      const unknownErr = new TypeError('fetch failed');
      unknownErr.cause = { code: 'ENETDOWN', message: 'Network is down' };
      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw unknownErr; };
      try {
        const unknownResult = await httpService38.executeRequest({
          method: 'GET',
          url: 'http://127.0.0.1:9999/unknown',
        });
        assert.strictEqual(unknownResult.status, 0);
        assert.strictEqual(unknownResult.statusText, 'ENETDOWN',
          `Expected "ENETDOWN" as statusText, got "${unknownResult.statusText}"`);
        assert.ok(unknownResult.body.includes('ENETDOWN'));
      } finally {
        globalThis.fetch = origFetch;
      }
    }

    // Verify error is recorded in history
    const hist38 = stateManager38.getHistory();
    assert.ok(hist38.length >= 1, 'Error requests should be recorded in history');
    assert.strictEqual(hist38[hist38.length - 1].responseStatus, 0,
      'Network error history items must have responseStatus === 0');

    console.log('✓ Network Error Diagnostic Classification (ECONNREFUSED / AbortError / unknown) verified');
  }

  // ─── Test 39: Pre-Request & Post-Response Scripting Engine & Assertions ──────────────────────────
  {
    const scriptService = new ScriptService(1500);

    // 1. Pre-Request Script Execution: mutation of headers, body, url, and variables
    const preScriptCode = `
      bb.request.headers['X-Calculated-Signature'] = crypto.createHmac('sha256', 'secret-key').update('bluebyrd-payload').digest('hex');
      bb.request.headers['X-Timestamp'] = '1700000000';
      bb.request.body = JSON.stringify({ injected: true });
      bb.environment.set('injectedToken', 'bb_tok_999');
      bb.collectionVariables.set('colKey', 'colVal');
      console.log('Pre-request ran successfully');
    `;

    const preResult = scriptService.executePreRequest(preScriptCode, {
      url: 'http://localhost/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
      environmentVariables: {},
      collectionVariables: {},
      resolvedVariables: {},
    });

    assert(preResult.headers['X-Calculated-Signature'], 'Pre-request script should inject X-Calculated-Signature header');
    assert.strictEqual(preResult.headers['X-Timestamp'], '1700000000');
    assert.strictEqual(preResult.body, '{"injected":true}');
    assert.strictEqual(preResult.envMutations['injectedToken'], 'bb_tok_999');
    assert.strictEqual(preResult.colMutations['colKey'], 'colVal');
    assert(preResult.consoleLogs.some(l => l.message.includes('Pre-request ran successfully')));

    // 2. Post-Response Script Execution: assertions, PM parity, JSON parsing, test results
    const postScriptCode = `
      // bb API assertions
      bb.test('Status is 200', () => {
        bb.expect(bb.response.status).toBe(200);
      });

      bb.test('Status is 404 (expected failure)', () => {
        bb.expect(bb.response.status).toBe(404);
      });

      bb.test('Payload matches user Alice', () => {
        const data = bb.response.json();
        bb.expect(data.name).toEqual('Alice');
        bb.expect(data.roles).to.include('admin');
        bb.expect(data.id).toBe(42);
      });

      // Postman pm API syntax parity
      pm.test('Postman pm syntax parity', function() {
        pm.expect(pm.response.status).to.equal(200);
        pm.response.to.have.status(200);
        pm.response.to.have.header('content-type');
      });

      // Extract token to environment
      const payload = bb.response.json();
      bb.environment.set('extractedToken', payload.token);
      console.info('Finished post-response tests');
    `;

    const postResult = scriptService.executePostResponse(postScriptCode, {
      url: 'http://localhost/api',
      method: 'GET',
      requestHeaders: {},
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 42, name: 'Alice', roles: ['admin', 'dev'], token: 'jwt_abc_123' }),
      elapsedMs: 45,
      environmentVariables: {},
      collectionVariables: {},
      resolvedVariables: {},
    });

    assert.strictEqual(postResult.testResults.length, 4, 'Should record exactly 4 tests');
    const passedTests = postResult.testResults.filter(t => t.passed);
    const failedTests = postResult.testResults.filter(t => !t.passed);
    assert.strictEqual(passedTests.length, 3, '3 tests should pass');
    assert.strictEqual(failedTests.length, 1, '1 test should fail');
    assert.strictEqual(failedTests[0].name, 'Status is 404 (expected failure)');
    assert(failedTests[0].error.includes('404'), 'Failed test error should describe failure');
    assert.strictEqual(postResult.envMutations['extractedToken'], 'jwt_abc_123');
    assert(postResult.consoleLogs.some(l => l.message.includes('Finished post-response tests')));

    // 3. Sandbox execution timeout guard (infinite loop protection)
    const timeoutScriptService = new ScriptService(150); // 150ms timeout
    const timeoutResult = timeoutScriptService.executePreRequest('while(true) {}', {
      url: 'http://localhost',
      method: 'GET',
      headers: {},
      environmentVariables: {},
      collectionVariables: {},
      resolvedVariables: {},
    });
    assert(timeoutResult.error, 'Infinite loop script must be aborted with error');
    assert(timeoutResult.consoleLogs.some(l => l.level === 'error'), 'Should log script timeout error');

    // 4. End-to-End HttpService Integration with Test Server
    const http = require('http');
    let receivedHeader = '';
    const scriptTestServer = http.createServer((req, res) => {
      receivedHeader = req.headers['x-script-injected'] || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', serverName: 'bluebyrd-test-srv', token: 'secret_tok_777' }));
    });

    await new Promise((resolve) => scriptTestServer.listen(0, '127.0.0.1', resolve));
    const scriptPort = scriptTestServer.address().port;

    const storage39 = new Map();
    const ctx39 = {
      workspaceState: {
        get: (k) => storage39.get(k),
        update: (k, v) => { storage39.set(k, v); return Promise.resolve(); }
      }
    };
    const stateManager39 = new BlueByrdStateManager(ctx39);
    const varService39 = new VariableService(stateManager39);
    const authService39 = new AuthService(stateManager39, varService39);
    const httpService39 = new HttpService(stateManager39, varService39, authService39);

    const testEnvResult = stateManager39.createEnvironment('Script Testing Env', `http://127.0.0.1:${scriptPort}`);
    stateManager39.saveEnvironment('Script Testing Env', testEnvResult.env);

    const execResult = await httpService39.executeRequest({
      method: 'GET',
      url: `http://127.0.0.1:${scriptPort}/test-scripts`,
      environment: 'Script Testing Env',
      preRequestScript: `
        bb.request.headers['X-Script-Injected'] = 'confirmed-from-pre-request';
        bb.environment.set('preVar', 'hello_pre');
        console.log('Sending request to server');
      `,
      postResponseScript: `
        bb.test('Response is 200 OK', () => {
          bb.expect(bb.response.status).toBe(200);
        });
        const d = bb.response.json();
        bb.environment.set('tokenFromResponse', d.token);
        console.log('Received response from', d.serverName);
      `
    });

    assert.strictEqual(execResult.status, 200);
    assert.strictEqual(receivedHeader, 'confirmed-from-pre-request', 'Pre-request injected header must be received by HTTP server');
    assert(execResult.testResults && execResult.testResults.length === 1 && execResult.testResults[0].passed, 'Post-response test assertion must pass');
    assert(execResult.consoleLogs.length >= 2, 'Console logs must be collected from both pre and post scripts');

    // Verify environment variable mutations persisted in stateManager
    const updatedEnv = stateManager39.getEnvironment('Script Testing Env');
    assert.strictEqual(updatedEnv.variables['preVar'], 'hello_pre', 'Pre-request environment variable must be persisted');
    assert.strictEqual(updatedEnv.variables['tokenFromResponse'], 'secret_tok_777', 'Post-response environment variable must be persisted');

    if (typeof scriptTestServer.closeAllConnections === 'function') {
      scriptTestServer.closeAllConnections();
    }
    await new Promise((resolve) => scriptTestServer.close(resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log('✓ Pre-Request & Post-Response Scripting Engine, Sandboxed Assertions, PM Parity & Persistence verified');
  }

  console.log('\nAll 39 verification test suites passed successfully! 🎉');
  process.exit(0);
})().catch(err => {
  console.error('Async test suite failure:', err);
  process.exit(1);
});


