'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { readAsar, sha } = require('../../engines/localization/src/asar.cjs');
const { _electron: electron, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
function option(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  return index < 0 ? fallback : process.argv[index + 1];
}
function isolatedDirectory(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  assert.match(relative, /^(artifacts|output)[\\/]/, '运行验证仅允许工作区内的隔离目录');
  assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..'));
  return resolved;
}
const portable = isolatedDirectory(option('portable', 'artifacts/adaptation/2.23.1/portable'));
const output = isolatedDirectory(option('output', 'artifacts/adaptation/2.23.1/runtime'));
const launcherPath = option('launcher');
const wcv = process.argv.includes('--wcv');
const checkModernUi = process.argv.includes('--check-modern-ui');
const windowArguments = wcv ? ['--enable-wcv-browser'] : [];
const home = path.join(output, 'home');
const profile = path.join(output, 'profile');
const asarPath = path.join(portable, 'resources/app.asar');
const originalBytes = fs.readFileSync(asarPath);
const archive = readAsar(originalBytes);
const applicationVersion = JSON.parse(archive.files.get('package.json').data.toString()).version;
if (process.platform === 'win32') {
  const mainSource = archive.files.get('dist/main.js')?.data.toString() || '';
  assert.equal(mainSource.split('/* isolated runtime: preserve protocol association */').length - 1, 2,
    '先使用 prepare-runtime-asar.cjs 制作不会登记系统协议关联的运行样本');
  assert.ok(!mainSource.includes('.app.setAsDefaultProtocolClient(PROTOCOL'), '隔离样本不得修改系统协议关联');
}
const constants = archive.files.get('dist/ideInstall/constants.js').data.toString();
const wizardKey = constants.match(/exports\.WIZARD_SHOWN_KEY = '([^']+)'/)[1];
for (const directory of [output, home, profile, path.join(home, 'AppData/Roaming'), path.join(home, 'AppData/Local')]) fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(profile, 'app_storage.json'), JSON.stringify({ [wizardKey]: 'true' }));

async function launch(language) {
  if (language === 'zh-CN') fs.writeFileSync(path.join(profile, 'ui-language.json'), JSON.stringify({ language }));
  else assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'ui-language.json'))).language, 'en', '英文重启必须沿用上次保存的偏好');
  const env = {
    ...process.env,
    USERPROFILE: home,
    HOME: home,
    APPDATA: path.join(home, 'AppData/Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData/Local'),
    ANTIGRAVITY_WSL_DISTRO: ''
  };
  delete env.DEV_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  // 独立 home 同时隔离语言服务的 .gemini 数据，只有 user-data-dir 不足以隔离。
  if (launcherPath) {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const reportPath = path.join(output, 'launcher-' + language + '.json');
    const executablePath = path.join(portable, 'Antigravity.exe');
    const child = spawn(path.resolve(launcherPath), ['--executable', executablePath, '--report', reportPath, '--', '--user-data-dir=' + profile, '--wsl-distro=', ...windowArguments, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port, '--enable-automation', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], { cwd: portable, env, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error('启动器失败，退出码：' + code))); });
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.action, 'started', '启动器必须创建隔离进程，不能复用真实实例');
    assert.equal(path.resolve(report.executablePath).toLowerCase(), executablePath.toLowerCase());
    let browser;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); break; } catch { await new Promise(resolve => setTimeout(resolve, 300)); }
    }
    assert.ok(browser, '隔离进程的专用调试端口不可连接');
    const session = await browser.newBrowserCDPSession();
    const commandLine = await session.send('Browser.getBrowserCommandLine');
    assert.ok(commandLine.arguments.includes('--user-data-dir=' + profile), '调试端口必须属于测试用户目录');
    assert.equal(commandLine.arguments.includes('--enable-wcv-browser'), wcv, '启动器必须透传窗口模式参数');
    fs.writeFileSync(path.join(output, 'command-line-' + language + '.json'), JSON.stringify(commandLine, null, 2) + '\n');
    return {
      report,
      async firstWindow() {
        for (let attempt = 0; attempt < 200; attempt++) {
          const page = browser.contexts()[0]?.pages().find(value => /^https?:\/\/(127\.0\.0\.1|localhost):\d+\//.test(value.url()));
          if (page) return page;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        throw Error('真实服务未打开应用页面');
      },
      async close() {
        await Promise.race([session.send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
        await Promise.race([browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
      }
    };
  }
  return electron.launch({
    executablePath: path.join(portable, 'Antigravity.exe'),
    args: ['--user-data-dir=' + profile, '--wsl-distro=', ...windowArguments],
    cwd: portable,
    env,
    timeout: 60000
  });
}

async function readMenus(application) {
  return application.evaluate(({ Menu }) => {
    function items(menu) {
      return (menu?.items || []).map(item => ({ id: item.id, label: item.label, checked: item.checked, submenu: item.submenu ? items(item.submenu) : undefined }));
    }
    return items(Menu.getApplicationMenu());
  });
}

async function verifyModernUi(page) {
  await page.evaluate(() => {
    const sample = document.createElement('section');
    sample.id = 'localization-scope-check';
    sample.hidden = true;
    sample.innerHTML = '<div data-testid="home-greeting"><h1>Hi Downloads, what can we get done today?</h1></div>' +
      '<button>Downloads</button>' +
      '<div data-testid="browser-autocomplete-option"><span class="truncate">Downloads</span></div>' +
      '<div data-testid="conversation-row-sample"><span class="truncate text-left w-full">Downloads</span></div>' +
      '<div data-testid="automation-run"><span class="truncate">Downloads</span></div>' +
      '<div class="entrance-title">Welcome to Antigravity!</div>' +
      '<div class="entrance-auth-panel"><button>Continue with Google</button><button>Use Business Account</button></div>' +
      '<div data-localization-sample="sign-in-help"><button>Having trouble signing in?</button></div>';
    document.body.append(sample);
  });
  const sample = page.locator('#localization-scope-check');
  await page.waitForFunction(() => document.querySelector('#localization-scope-check h1')?.textContent === '你好，Downloads，今天想做些什么？');
  assert.equal(await sample.locator(':scope > button').textContent(), '下载内容');
  assert.equal(await sample.locator('.entrance-title').textContent(), '欢迎使用 Antigravity！');
  const dictionary = require('../../engines/localization/translations/zh-CN.json');
  assert.deepEqual(await sample.locator('.entrance-auth-panel button, [data-localization-sample="sign-in-help"] button').allTextContents(),
    ['Continue with Google', 'Use Business Account', 'Having trouble signing in?'].map(key => dictionary[key]));
  assert.deepEqual(await sample.locator('span').allTextContents(), ['Downloads', 'Downloads', 'Downloads']);
  await sample.locator('h1').evaluate(heading => { heading.firstChild.nodeValue = 'Hi Release, what can we get done today?'; });
  await page.waitForFunction(() => document.querySelector('#localization-scope-check h1')?.textContent === '你好，Release，今天想做些什么？');
  return sample;
}

async function verify(language) {
  let application;
  let page;
  try {
    application = await launch(language);
    page = await application.firstWindow({ timeout: 60000 });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL(/https?:\/\/(127\.0\.0\.1|localhost):\d+\//, { timeout: 65000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(expected => document.documentElement.lang === expected, language);
    await page.waitForTimeout(2000);
    const state = launcherPath ? { version: applicationVersion, userData: profile, home, processId: application.report.processId, proxy: application.report.httpProxy, sources: { version: 'ASAR package.json', userData: 'verified CDP process arguments', home: 'declared isolated environment' } } : await application.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath('userData'), home: app.getPath('home') }));
    assert.equal(state.version, applicationVersion);
    assert.equal(path.resolve(state.home), home);
    assert.equal(path.resolve(state.userData), profile);
    const menus = launcherPath ? [] : await readMenus(application);
    fs.writeFileSync(path.join(output, 'menus-' + language + '.json'), JSON.stringify(menus, null, 2) + '\n');
    if (!launcherPath) assert.ok(menus.some(menu => menu.id === 'antigravity-language'), '原生语言切换菜单存在');
    const mainAsset = await page.evaluate(async () => { const response = await fetch('/main.js'); return { status: response.status, text: await response.text() }; });
    assert.equal(mainAsset.status, 200);
    const mainAssetSha256 = sha(Buffer.from(mainAsset.text));
    const expectedAsset = fs.readdirSync(path.join(root, 'artifacts/adaptation', applicationVersion, 'embedded')).find(name => name.endsWith('-main.js'));
    assert.equal(mainAssetSha256, sha(fs.readFileSync(path.join(root, 'artifacts/adaptation', applicationVersion, 'embedded', expectedAsset))), '实际服务必须提供新版本原始前端资源');
    const dictionary = require('../../engines/localization/translations/zh-CN.json');
    const welcome = ['Build new features', 'Hand off a feature and come back to working code.', 'Debug and fix', 'Automatically reproduce bugs, trace causes, test fixes.', 'Research anything', 'Ask about your code or any topic, get clear answers.', 'Write and edit docs', 'Draft documents, emails, and notes that sound like you.'];
    const signInTitle = 'Welcome to Antigravity!';
    const introScreens = [
      { id: 'sign-in', keys: [signInTitle, 'Continue with Google', 'Use Business Account', 'Having trouble signing in?'] },
      {
        id: 'persona',
        keys: ["Let's tailor the experience for you. What best describes your work?", 'Software Engineering', 'Knowledge Work', 'Data & Analytics', 'Science', 'Design'],
        chinese: ['我们来为你定制使用体验。以下哪项最符合你的工作？', '软件工程', '知识工作', '数据与分析', '科学', '设计']
      },
      { id: 'welcome', keys: welcome },
      { id: 'privacy', keys: ['Security Notice & Data Use', 'Get started'] },
      { id: 'terms', keys: ['Terms of Service & Data Use', 'Terms and Privacy:'] }
    ];
    const expectedScreens = introScreens.map(screen => language === 'en' ? screen.keys :
      screen.chinese ?? screen.keys.map(key => key === signInTitle ? '欢迎使用 Antigravity！' : dictionary[key]));
    assert.ok(expectedScreens.flat().every(key => typeof key === 'string' && key), '欢迎页的预期文案不得为空');
    await page.waitForFunction(screens => screens.some(keys => keys.every(key => document.body.innerText.includes(key))), expectedScreens);
    const text = await page.locator('body').innerText();
    const screen = introScreens[expectedScreens.findIndex(keys => keys.every(key => text.includes(key)))];
    assert.ok(screen, '未找到已知的登录、欢迎、首次设置或数据使用提示页面');
    fs.writeFileSync(path.join(output, 'page-' + language + '.txt'), text);
    await page.screenshot({ path: path.join(output, 'product-' + language + '.png'), fullPage: true, animations: 'disabled', timeout: 30000 });
    const evidence = { language, screen: screen.id, url: page.url(), state, menus, text, errors, mainAssetSha256 };
    if (language === 'zh-CN') {
      const audit = require('./verify-audit.cjs');
      const sample = checkModernUi ? await verifyModernUi(page) : null;
      if (checkModernUi) {
        await audit.verifyComposerWithoutLanguageOverlay(page);
        await audit.verifySettingsLanguageEntry(page);
      }
      const settings = await audit.mountLanguageSettingsFixture(page);
      await audit.switchLanguageFromSettings(settings, 'en');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'ui-language.json'))).language, 'en');
      await settings.evaluate(element => element.remove());
      evidence.switchedEnglishText = await page.locator('body').innerText();
      for (const key of screen.keys) assert.ok(evidence.switchedEnglishText.includes(key), '切回原文：' + key);
      if (sample) {
        assert.equal(await sample.locator('h1').textContent(), 'Hi Release, what can we get done today?');
        assert.equal(await sample.locator(':scope > button').textContent(), 'Downloads');
        assert.equal(await sample.locator('.entrance-title').textContent(), signInTitle);
        assert.deepEqual(await sample.locator('.entrance-auth-panel button, [data-localization-sample="sign-in-help"] button').allTextContents(),
          ['Continue with Google', 'Use Business Account', 'Having trouble signing in?']);
        assert.deepEqual(await sample.locator('span').allTextContents(), ['Downloads', 'Downloads', 'Downloads']);
        await sample.evaluate(element => element.remove());
        evidence.modernUiScopeVerified = true;
      }
      await page.screenshot({ path: path.join(output, 'product-switched-en.png'), fullPage: true, animations: 'disabled', timeout: 30000 });
    }
    return evidence;
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(output, 'failure-' + language + '.png') }).catch(() => {});
      fs.writeFileSync(path.join(output, 'failure-' + language + '.txt'), await page.locator('body').innerText().catch(() => '页面不可读取'));
    }
    throw error;
  } finally {
    if (application) await application.close();
  }
}

async function main() {
  const chinese = await verify('zh-CN');
  const english = await verify('en');
  const chineseFile = chinese.menus.find(item => item.label === '文件');
  const englishFile = english.menus.find(item => item.label === 'File');
  if (!launcherPath) {
    assert.ok(chineseFile, '中文启动时原生 File 菜单应为中文');
    assert.ok(englishFile, '英文重启时原生 File 菜单应恢复英文');
  }
  assert.equal(sha(fs.readFileSync(asarPath)), sha(originalBytes), '运行验证不得改变被测 ASAR');
  const result = {
    success: true,
    scope: '真实 Electron 和语言服务页面；全新隔离用户目录，未登录',
    applicationVersion,
    wcvRequested: wcv,
    asarSha256: sha(originalBytes),
    chinese,
    english,
    limitations: ['未登录页面不能证明登录后会话、配额和市场内容已覆盖；组件 fixture 验证单独记录。', ...(launcherPath ? ['启动器运行使用浏览器调试接口，未读取实际原生菜单；原生分支测试单独记录。'] : [])]
  };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ success: true, applicationVersion, output }));
}
main().catch(error => {
  fs.writeFileSync(path.join(output, 'error.txt'), error.stack + '\n');
  console.error(error);
  process.exitCode = 1;
});
