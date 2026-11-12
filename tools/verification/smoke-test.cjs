'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { readAsar } = require('../../engines/localization/src/asar.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'engines/localization/translations/zh-CN.json'), 'utf8'));
function option(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  return index < 0 ? fallback : process.argv[index + 1];
}
function isolatedDirectory(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !/^artifacts[\\/]/.test(relative)) {
    throw Error('验证目录必须位于工作区 artifacts/ 中：' + resolved);
  }
  return resolved;
}
const portable = isolatedDirectory(option('portable', process.env.SMOKE_PORTABLE || 'artifacts/playwright/portable'));
const profile = isolatedDirectory(option('profile', process.env.SMOKE_PROFILE || 'artifacts/playwright/profile'));
const output = isolatedDirectory(option('output', process.env.SMOKE_OUTPUT || 'artifacts/playwright/results'));
const embedded = path.resolve(root, option('embedded', process.env.SMOKE_EMBEDDED || 'analysis/embedded'));
const checkEnglish = process.argv.includes('--check-english');
fs.mkdirSync(profile, { recursive: true });
if (!checkEnglish) fs.writeFileSync(path.join(profile, 'ui-language.json'), JSON.stringify({ language: 'zh-CN' }));
const archive = readAsar(fs.readFileSync(path.join(portable, 'resources/app.asar')));
const applicationVersion = JSON.parse(archive.files.get('package.json').data.toString()).version;
const constants = archive.files.get('dist/ideInstall/constants.js').data.toString();
const wizardKey = constants.match(/exports\.WIZARD_SHOWN_KEY = '([^']+)'/)[1];
fs.writeFileSync(path.join(profile, 'app_storage.json'), JSON.stringify({ [wizardKey]: 'true' }));
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Antigravity 中文验证</title></head><body style="background:#17191d;color:#eee;font:16px system-ui;padding:36px">
<h1>Settings</h1><button id="settings">Settings</button><button id="cancel">Cancel</button>
<button id="nested"><span>New Window</span></button><input id="input" placeholder="Search conversations..." value="Settings">
<textarea id="textarea">Settings</textarea><div contenteditable="true" id="editable">Settings</div>
<pre id="code">Settings</pre><div data-testid="planner-response-text"><button id="response">Settings</button></div>
<div data-testid="user-input-step"><h3 id="user">Settings</h3></div><div data-testid="conversation-title"><button id="name">Settings</button></div>
<div data-testid="conversation-row-abc"><button><span id="actual-name" title="Settings" class="truncate text-left w-full text-sm">Settings</span></button><button id="row-action">Cancel</button></div>
<button data-testid="project-selector-item"><span id="project-name" title="Settings" class="truncate">Settings</span></button>
<div id="dynamic"></div><script>window.clickCount=0;document.querySelector('#settings').onclick=()=>window.clickCount++;</script>
${fs.readFileSync(path.join(root, 'engines/localization/tests/fixtures/ui-coverage.html'), 'utf8')}
${fs.readFileSync(path.join(root, 'engines/localization/tests/fixtures/full-audit.html'), 'utf8')}
</body></html>`;
function embeddedFile(name) {
  const matches = fs.readdirSync(embedded).filter(file => file.endsWith('-' + name));
  assert.equal(matches.length, 1, '嵌入资源须唯一匹配：' + name);
  return path.join(embedded, matches[0]);
}
const assetMap = Object.fromEntries(['main.js', 'prism_bundle.js', 'jetbox.css', 'compiled_tailwind.css', 'diff_worker.js', 'audio_processor.js'].map(name => ['/' + name, embeddedFile(name)]));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/actual') {
    const html = fs.readFileSync(embeddedFile('index.html'), 'utf8').replace('<head>', '<head><script>window.__APP_CONFIG__=' + JSON.stringify({productName:'Antigravity',appVersion:applicationVersion,csrfToken:'local-fixture-only',devMode:false}) + ';</script>');
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  } else if (assetMap[url.pathname]) {
    res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css');
    res.end(fs.readFileSync(assetMap[url.pathname]));
  } else if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); }
  else { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"offline verification fixture"}'); }
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const debuggingPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(path.join(portable, 'Antigravity.exe'), ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debuggingPort, '--user-data-dir=' + profile], {
    env: { ...process.env, DEV_URL: url }, windowsHide: true, stdio: 'ignore'
  });
  let browser;
  let childError, childExit, connectionError;
  child.on('error', error => { childError = error.message; });
  child.on('exit', (code, signal) => { childExit = { code, signal }; });
  try {
    for (let attempt = 0; attempt < 35; attempt++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + debuggingPort); break; }
      catch (error) { connectionError = error.message.split('\n')[0]; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!browser) throw Error('Packaged Electron did not start: ' + JSON.stringify({ childError, childExit, connectionError }));
    const context = browser.contexts()[0];
    let page;
    for (let attempt = 0; attempt < 25; attempt++) {
      page = context.pages().find(p => p.url().startsWith(url));
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!page) throw Error('Main window did not load verification fixture');
    const audit = require('./verify-audit.cjs');
    if (checkEnglish) {
      const settings = await audit.mountLanguageSettingsFixture(page);
      const select = settings.getByRole('combobox', { name: 'Interface Language' });
      await select.waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      assert.equal(await page.locator('#settings').textContent(), 'Settings');
      assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Search conversations...');
      assert.equal(await select.textContent(), 'English');
      console.log('PASS: new Electron process restores the persisted English preference.');
      return;
    }
    await page.waitForFunction(() => document.querySelector('#settings')?.textContent === '设置');
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert.equal(await page.locator('#cancel').textContent(), '取消');
    assert.equal(await page.locator('#nested').textContent(), '新建窗口');
    for (const id of ['textarea', 'editable', 'code', 'response', 'user', 'name', 'actual-name', 'project-name']) assert.equal(await page.locator('#' + id).textContent(), 'Settings', id);
    assert.equal(await page.locator('#actual-name').getAttribute('title'), 'Settings');
    assert.equal(await page.locator('#project-name').getAttribute('title'), 'Settings');
    assert.equal(await page.locator('#row-action').textContent(), '取消');
    assert.equal(await page.locator('#input').inputValue(), 'Settings');
    assert.equal(await page.locator('#input').getAttribute('placeholder'), dictionary['Search conversations...']);
    await page.locator('#settings').click();
    assert.equal(await page.evaluate(() => window.clickCount), 1);
    await page.evaluate(() => { const b = document.createElement('button'); b.id = 'new'; b.textContent = 'Settings'; document.querySelector('#dynamic').append(b); });
    await page.waitForFunction(() => document.querySelector('#new')?.textContent === '设置');
    await page.evaluate(() => document.querySelector('#new').firstChild.nodeValue = 'Cancel');
    await page.waitForFunction(() => document.querySelector('#new')?.textContent === '取消');
    assert.equal(await page.evaluate(() => typeof window.electronNative.minimize), 'function');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const expected = {
      'title-file': 'File', 'title-view': 'View', 'title-window': 'Window',
      'sidebar-new': 'New Conversation', 'sidebar-history': 'Conversation History',
      'sidebar-automations': 'Automations', 'sidebar-customizations': 'Customizations',
      'sidebar-projects': 'Projects', 'nav-application': 'Application', 'nav-models': 'Models',
      'not-in-project': 'Not in Project', 'nav-conversations': 'Conversations',
      'general-description': 'Configure agent execution, queued message delivery, and permissions.',
      'execution-title': 'Execution', 'queue': 'Queue', 'send-immediately': 'Send Immediately',
      'keyboard-shortcuts': 'Keyboard shortcuts', 'default-preset': 'Default',
      'open-permissions': 'Open', 'tool-description': 'Modify permissions for file, terminal, and MCP tools.'
    };
    for (const [id, key] of Object.entries(expected)) assert.equal(await page.locator('#' + id).textContent(), dictionary[key], id);
    for (const id of ['user-project-models', 'user-project-default', 'user-workspace', 'account-name', 'user-override', 'user-override-menu', 'unrelated-link', 'unrelated-div']) {
      assert.equal(await page.locator('#' + id).textContent(), await page.evaluate(id => window.coverageOriginals[id], id), id);
    }
    assert.equal(await page.locator('#user-project-models').getAttribute('title'), 'Models');
    assert.equal(await page.locator('#unrelated-fragment').textContent(), '类型');
    await require('./verify-audit.cjs').verifyChinese(page);
    assert.equal(await page.locator('#modified').textContent(), '已在以下项目中修改： Default');
    assert.equal(await page.locator('#modified-many').textContent(), '已在以下项目中修改： 3 个项目');
    assert.equal(await page.locator('#preset-help').textContent(), '了解更多： 默认');
    assert.equal(await page.locator('#plan-help').textContent(), '输入 / 并选择 plan ，让代理生成计划。');
    assert.deepEqual(await page.locator('#plan-help code').allTextContents(), ['/', 'plan']);
    assert.equal(await page.locator('#title-option').textContent(), '新建窗口Ctrl+Shift+N');
    await page.locator('#user-override').click();
    assert.equal(await page.evaluate(() => window.overrideClicks), 1);
    // Names and mixed text updates after initial render must remain independent.
    await page.evaluate(() => {
      document.querySelector('#user-override').firstChild.nodeValue = 'Models';
      document.querySelector('#project-count').firstChild.nodeValue = '5';
      document.querySelector('#project-count').lastChild.nodeValue = ' projects';
      document.querySelector('#tool-description').firstChild.nodeValue = 'Modify permissions for file and terminal tools.';
      const button = document.createElement('button'); button.id = 'later-project'; button.dataset.testid = 'settings-nav-item-Default'; button.textContent = 'Default';
      document.querySelector('#user-project-models').parentElement.append(button);
      const option = document.createElement('div'); option.id = 'later-option'; option.setAttribute('role', 'option'); option.textContent = 'Queue'; document.body.append(option);
    });
    await page.waitForFunction(() => document.querySelector('#later-option')?.textContent === '排队');
    assert.equal(await page.locator('#later-project').textContent(), 'Default');
    assert.equal(await page.locator('#user-override').textContent(), 'Models');
    assert.equal(await page.locator('#modified-many').textContent(), '已在以下项目中修改： 5 个项目');
    assert.equal(await page.locator('#tool-description').textContent(), dictionary['Modify permissions for file and terminal tools.']);
    // React may reuse a control in a protected user-name group. Restore both
    // translated text and attributes when it moves into that group.
    await page.evaluate(() => {
      const button = document.createElement('button'); button.id = 'moving-name'; button.dataset.testid = 'settings-nav-item-Models'; button.title = 'Models'; button.textContent = 'Models';
      document.querySelector('#nav-models').parentElement.append(button);
    });
    await page.waitForFunction(() => document.querySelector('#moving-name')?.textContent === '模型');
    await page.evaluate(() => document.querySelector('#user-project-models').parentElement.append(document.querySelector('#moving-name')));
    await page.waitForFunction(() => document.querySelector('#moving-name')?.textContent === 'Models');
    assert.equal(await page.locator('#moving-name').getAttribute('title'), 'Models');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'preload-smoke.png') });
    console.log('PASS: packaged preload, context isolation, dynamic changes, control events, protected chat/code/input.');
    await audit.verifyComposerWithoutLanguageOverlay(page);
    await audit.verifySettingsLanguageEntry(page);
    const settings = await audit.mountLanguageSettingsFixture(page);
    await audit.switchLanguageFromSettings(settings, 'en');
    await page.waitForFunction(() => document.querySelector('#settings')?.textContent === 'Settings');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#new').textContent(), 'Cancel');
    assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Search conversations...');
    assert.equal(await page.locator('#actual-name').textContent(), 'Settings');
    // Every untouched fixture node restores its exact original, including nested
    // fragments, shortcut/code nodes, and portaled project names.
    const restored = await page.evaluate(() => Object.entries(window.coverageOriginals)
      .filter(([id]) => !['dynamic', 'modified', 'modified-many', 'many-projects', 'project-count', 'tool-description', 'user-override'].includes(id))
      .filter(([id, value]) => document.getElementById(id)?.textContent !== value).map(([id]) => id));
    assert.deepEqual(restored, []);
    await require('./verify-audit.cjs').verifyEnglish(page);
    assert.equal(await page.locator('#modified-many').textContent(), 'Modified in 5 projects');
    assert.equal(await page.locator('#modified').textContent(), 'Modified in Models');
    await page.evaluate(() => document.querySelector('#new').firstChild.nodeValue = 'Settings');
    await audit.switchLanguageFromSettings(settings, 'zh-CN');
    await page.waitForFunction(() => document.querySelector('#new')?.textContent === '设置');
    assert.equal(await page.locator('#plan-help').textContent(), '输入 / 并选择 plan ，让代理生成计划。');
    // Application changes after translation must survive a later switch back.
    await page.evaluate(() => { document.querySelector('#new').firstChild.nodeValue = 'Custom value'; document.querySelector('#input').setAttribute('placeholder', 'Custom hint'); });
    await audit.switchLanguageFromSettings(settings, 'en');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('#new').textContent(), 'Custom value');
    assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Custom hint');
    assert.equal(await page.locator('#input').inputValue(), 'Settings');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'ui-language.json'))).language, 'en');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('#settings').textContent(), 'Settings');
    await page.screenshot({ path: path.join(output, 'language-switch-en.png') });
    console.log('PASS: Chinese ↔ English, original text/attributes, application updates, persisted setting and reload.');
    console.log('PASS: screenshot component coverage, composite fragments, dynamic options, project-name collisions and exact English restoration.');
  } finally {
    if (browser) { try { const session = await browser.newBrowserCDPSession(); await Promise.race([session.send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]); } catch {} }
    child.kill();
    server.closeAllConnections();
    server.close();
  }
}
main().then(() => process.exit(0), error => { console.error(error); server.closeAllConnections(); server.close(); process.exit(1); });
