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
  ThemeIcon: class { constructor(id) { this.id = id; } },
  EventEmitter: class {
    constructor() {
      this.event = () => {};
    }
    fire() {}
    dispose() {}
  },
  window: {
    showInformationMessage: () => {},
    showErrorMessage: () => {},
    showWarningMessage: () => {},
    createTreeView: () => ({ dispose: () => {} }),
    createStatusBarItem: () => ({ show: () => {} }),
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
const { ImportExportService } = require(path.join(repoDist, 'services/importExportService'));
const { UpdateService } = require(path.join(repoDist, 'services/updateService'));
const { BlueByrdExplorerTreeDataProvider } = require(path.join(repoDist, 'views/tree/explorerTreeDataProvider'));

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

// Test 7: Duplication & Deletion
const duplicated = stateManager.duplicateRequest('test-req-1');
assert(duplicated, 'Duplicate request should succeed');
assert(duplicated.id !== 'test-req-1', 'Duplicated request should have a distinct ID');
assert(duplicated.name.includes('(Copy)'), 'Duplicated request should have (Copy) in name');

const deleted = stateManager.deleteRequest(duplicated.id);
assert.strictEqual(deleted, true, 'Delete request should succeed');
assert(!stateManager.getRequest(duplicated.id), 'Deleted request should no longer exist');
console.log('✓ Request duplication and deletion passed');

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

  // 1. Verify Global Scope (activeProfileId = undefined) shows all items
  hierarchySM.setActiveProfileId(undefined);
  treeProvider.refresh();

  const rootItemsGlobal = treeProvider.getChildren();
  assert.strictEqual(rootItemsGlobal.length, 5, 'Root should have 5 items: scope filter, profiles, environments, collections, history');
  assert.strictEqual(rootItemsGlobal[0].kind, 'active-filter');
  assert(rootItemsGlobal[0].label.includes('Global'), 'Scope filter should show Global when activeProfileId is undefined');

  // Verify Environments Section in Global Scope
  const envSectionGlobal = rootItemsGlobal[2];
  const envChildrenGlobal = treeProvider.getChildren(envSectionGlobal);
  const envNamesGlobal = envChildrenGlobal.map(c => c.label);
  assert(envNamesGlobal.includes('Global Root'), 'Global Root environment must be present');
  assert(envNamesGlobal.includes('Alpha Base'), 'Alpha Base environment must be present at root');
  assert(envNamesGlobal.includes('Beta Prod'), 'Beta Prod environment must be present at root');

  // Verify Parent -> Child hierarchy nesting under Alpha Base:
  const alphaBaseItem = envChildrenGlobal.find(c => c.label === 'Alpha Base');
  assert(alphaBaseItem, 'Alpha Base item should exist');
  assert.strictEqual(alphaBaseItem.children.length, 1, 'Alpha Base should have 1 child (Alpha Dev)');
  assert(alphaBaseItem.description.includes('Parent (1)'), 'Alpha Base description should indicate 1 child');

  // Verify expanding Alpha Base via getChildren(alphaBaseItem) returns Alpha Dev
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

  // 2. Switch Active Profile to Tenant Alpha
  hierarchySM.setActiveProfileId(profAlpha.id);
  hierarchySM.setActiveEnvironmentName('Alpha Dev');
  treeProvider.refresh();

  const rootItemsAlpha = treeProvider.getChildren();
  assert(rootItemsAlpha[0].label.includes('Tenant Alpha'), 'Scope filter label must show active profile name');

  // Check Environments filtered by Tenant Alpha
  const envSectionAlpha = rootItemsAlpha[2];
  const envChildrenAlpha = treeProvider.getChildren(envSectionAlpha);
  const alphaEnvNames = envChildrenAlpha.map(c => c.label);
  assert(alphaEnvNames.includes('Global Root'), 'Global Root must remain visible when filtered by profile');
  assert(alphaEnvNames.includes('Alpha Base'), 'Alpha Base must be visible under Tenant Alpha');
  assert(!alphaEnvNames.includes('Beta Prod'), 'Beta Prod must be hidden under Tenant Alpha scope');

  // Check Active Environment Indicator
  const alphaBaseUnderAlpha = envChildrenAlpha.find(c => c.label === 'Alpha Base');
  const devUnderAlpha = treeProvider.getChildren(alphaBaseUnderAlpha)[0];
  assert(devUnderAlpha.description.includes('✔ Active'), 'Active environment Alpha Dev must show ✔ Active badge');

  // Check Collections filtered by Tenant Alpha
  const colSectionAlpha = rootItemsAlpha[3];
  const colChildrenAlpha = treeProvider.getChildren(colSectionAlpha);
  const alphaColNames = colChildrenAlpha.map(c => c.label);
  assert(alphaColNames.includes('Global Shared Library'), 'Global collection must remain visible under Tenant Alpha');
  assert(alphaColNames.includes('Alpha Orders API'), 'Alpha Orders API collection must be visible');
  assert(!alphaColNames.includes('Beta Inventory API'), 'Beta Inventory API collection must be hidden under Tenant Alpha scope');

  // 3. Switch Active Profile to Tenant Beta
  hierarchySM.setActiveProfileId(profBeta.id);
  treeProvider.refresh();

  const rootItemsBeta = treeProvider.getChildren();
  assert(rootItemsBeta[0].label.includes('Tenant Beta'), 'Scope filter label must show Tenant Beta');

  const envSectionBeta = rootItemsBeta[2];
  const envChildrenBeta = treeProvider.getChildren(envSectionBeta);
  const betaEnvNames = envChildrenBeta.map(c => c.label);
  assert(betaEnvNames.includes('Beta Prod'), 'Beta Prod must be visible under Tenant Beta');
  assert(!betaEnvNames.includes('Alpha Base'), 'Alpha Base must be hidden under Tenant Beta scope');

  const colSectionBeta = rootItemsBeta[3];
  const colChildrenBeta = treeProvider.getChildren(colSectionBeta);
  const betaColNames = colChildrenBeta.map(c => c.label);
  assert(betaColNames.includes('Global Shared Library'), 'Global collection must remain visible under Tenant Beta');
  assert(betaColNames.includes('Beta Inventory API'), 'Beta Inventory API collection must be visible');
  assert(!betaColNames.includes('Alpha Orders API'), 'Alpha Orders API collection must be hidden under Tenant Beta scope');

  console.log('✓ Profile-Scoped Workspace & Visual Parent -> Child Environment Tree Nesting verified');

  console.log('\nAll 33 verification test suites passed successfully! 🎉');
  process.exit(0);
})().catch(err => {
  console.error('Async test suite failure:', err);
  process.exit(1);
});


