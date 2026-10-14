'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { readAsar } = require('../src/asar.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/txyc_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'translations/zh-CN.json'), 'utf8'));
const portable = path.join(root, 'output/portable');
const profile = path.join(root, 'output/smoke-profile');
const checkEnglish = process.argv.includes('--check-english');
fs.mkdirSync(profile, { recursive: true });
if (!checkEnglish) fs.writeFileSync(path.join(profile, 'ui-language.json'), JSON.stringify({ language: 'zh-CN' }));
const archive = readAsar(fs.readFileSync(path.join(portable, 'resources/app.asar')));
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
</body></html>`;
const assetMap = { '/main.js': '142809195-main.js', '/prism_bundle.js': '145690865-prism_bundle.js', '/jetbox.css': '142785440-jetbox.css', '/compiled_tailwind.css': '142736347-compiled_tailwind.css', '/diff_worker.js': '142773510-diff_worker.js', '/audio_processor.js': '142735456-audio_processor.js' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/actual') {
    const html = fs.readFileSync(path.join(root, 'analysis/embedded/142783784-index.html'), 'utf8').replace('<head>', '<head><script>window.__APP_CONFIG__={productName:"Antigravity",appVersion:"2.23.0",csrfToken:"local-fixture-only",devMode:false};</script>');
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  } else if (assetMap[url.pathname]) {
    res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css');
    res.end(fs.readFileSync(path.join(root, 'analysis/embedded', assetMap[url.pathname])));
  } else if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); }
  else { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"offline verification fixture"}'); }
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const child = spawn(path.join(portable, 'Antigravity.exe'), ['--remote-debugging-port=9231', '--user-data-dir=' + profile], {
    env: { ...process.env, DEV_URL: url }, windowsHide: true, stdio: 'ignore'
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 35; attempt++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9231'); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!browser) throw Error('Packaged Electron did not start');
    const context = browser.contexts()[0];
    let page;
    for (let attempt = 0; attempt < 25; attempt++) {
      page = context.pages().find(p => p.url().startsWith(url));
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!page) throw Error('Main window did not load verification fixture');
    if (checkEnglish) {
      await page.waitForSelector('#antigravity-language-switcher');
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      assert.equal(await page.locator('#settings').textContent(), 'Settings');
      assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Search conversations...');
      await page.locator('#antigravity-language-switcher summary').click();
      assert.equal(await page.locator('#antigravity-language-switcher select').inputValue(), 'en');
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
    fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output/playwright/preload-smoke.png') });
    console.log('PASS: packaged preload, context isolation, dynamic changes, control events, protected chat/code/input.');
    await page.locator('#antigravity-language-switcher summary').click();
    const languageSelect = page.locator('#antigravity-language-switcher select');
    await languageSelect.selectOption('en');
    await page.waitForFunction(() => document.querySelector('#settings')?.textContent === 'Settings');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#new').textContent(), 'Cancel');
    assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Search conversations...');
    assert.equal(await page.locator('#actual-name').textContent(), 'Settings');
    await page.evaluate(() => document.querySelector('#new').firstChild.nodeValue = 'Settings');
    await languageSelect.selectOption('zh-CN');
    await page.waitForFunction(() => document.querySelector('#new')?.textContent === '设置');
    // Application changes after translation must survive a later switch back.
    await page.evaluate(() => { document.querySelector('#new').firstChild.nodeValue = 'Custom value'; document.querySelector('#input').setAttribute('placeholder', 'Custom hint'); });
    await languageSelect.selectOption('en');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('#new').textContent(), 'Custom value');
    assert.equal(await page.locator('#input').getAttribute('placeholder'), 'Custom hint');
    assert.equal(await page.locator('#input').inputValue(), 'Settings');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'ui-language.json'))).language, 'en');
    await page.reload();
    await page.waitForSelector('#antigravity-language-switcher');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#settings').textContent(), 'Settings');
    await page.screenshot({ path: path.join(root, 'output/playwright/language-switch-en.png') });
    console.log('PASS: Chinese ↔ English, original text/attributes, application updates, persisted setting and reload.');
  } finally {
    if (browser) { try { const session = await browser.newBrowserCDPSession(); await Promise.race([session.send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]); } catch {} }
    child.kill();
    server.closeAllConnections();
    server.close();
  }
}
main().then(() => process.exit(0), error => { console.error(error); server.closeAllConnections(); server.close(); process.exit(1); });
