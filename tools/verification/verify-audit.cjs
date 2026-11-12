'use strict';
const assert = require('node:assert/strict');
const dictionary = require('../../engines/localization/translations/zh-CN.json');
const remote = require('../../engines/localization/translations/zh-CN.remote.json');
exports.verifyChinese = async page => {
  const fixed = {
    'audit-update':'Check for Updates','audit-palette':'Command Palette','audit-minimize':'Minimize','audit-maximize':'Maximize',
    'audit-models':'Models & Usage','audit-notification':'Notification Settings','audit-preferences':'Open System Preferences',
    'audit-wsl':'Windows Subsystem for Linux','audit-connect':'Connect','audit-create-prompt':'Create with Prompt','audit-new':'New',
    'audit-history-title':'This page is going away soon','audit-build':'Build with Google',
    'audit-docs-description':'Read, draft, and edit docs.','audit-sheets-description':'Read, write, and format spreadsheets.',
    'audit-slides-description':'Read, edit, and export presentations.','audit-drive-description':'Search, upload, download, and share files.',
    'audit-calendar-description':'Check availability, schedule events, and RSVP.','audit-weekly':'Weekly limit Remaining','audit-five-hour':'Five Hour Limit Remaining',
    'audit-gemini':'Gemini Models','audit-claude':'Claude and GPT models',
    'audit-theme-label':'Theme','audit-theme-contrast':'Contrast','audit-theme-strong':'Strong',
    'audit-theme-light':'Light Theme','audit-theme-dark':'Dark Theme','audit-theme-preset-label':'Preset',
    'audit-theme-preset':'Default Light','audit-theme-default-dark':'Default Dark','audit-theme-reset':'Reset to preset',
    'audit-theme-background':'Background','audit-theme-foreground':'Foreground','audit-theme-accent':'Accent',
    'audit-theme-mode-light':'Light','audit-theme-mode-dark':'Dark','audit-theme-system':'System','audit-theme-inherit':'Inherit Editor',
    'audit-onboarding-title':'Build new features','audit-onboarding-description':'Hand off a feature and come back to working code.'
  };
  for (const [id, key] of Object.entries(fixed)) assert.equal(await page.locator('#'+id).textContent(),dictionary[key]||remote[key],id);
  const dynamic = {
    'audit-version':'版本 2.23.0','audit-manage':'管理 Antigravity 应用设置。','audit-plan':'当前方案： Google AI Pro',
    'audit-weekly-description':'已使用部分每周额度，将在 4天19小时后完全恢复。',
    'audit-hour-description':'已使用部分五小时额度，将在 1小时56分钟后完全恢复。','audit-send-all':'全部发送（3）',
    'audit-history-search':'使用  在左上角搜索对话。','audit-history-archive':'在侧栏查看已归档对话 （ 菜单）。'
  };
  for (const [id, value] of Object.entries(dynamic)) assert.equal(await page.locator('#'+id).textContent(),value,id);
  const settings = {
    'audit-knowledge-label': '知识工作', 'audit-engineering-label': '软件工程',
    'audit-mode-description-non-technical': '适用于研究、写作和日常任务的简洁界面。',
    'audit-mode-description-developer': '提供编程、开发者工具和代理管理的完整界面。',
    'audit-chat-section': '对话', 'audit-verbose': '详细', 'audit-external-browser': '外部浏览器',
    'audit-starter-name': 'Antigravity 基础额度',
    'audit-starter-description': '免费用户和 Google AI Plus 用户享有 Antigravity 的基础额度。升级至 Google AI Pro 或更高等级可获得更高的使用限额。'
  };
  for (const [id, value] of Object.entries(settings)) assert.equal(await page.locator('#' + id).textContent(), value, id);
  for (const [id, value, label] of [['audit-layout-knowledge','2','知识工作'], ['audit-layout-engineering','1','软件工程'],
    ['audit-verbose','true',null], ['audit-external-browser','external',null]]) {
    const option = page.locator('#' + id);
    assert.equal(await option.getAttribute('value'), value);
    if (label) assert.equal(await option.getAttribute('aria-label'), label);
  }
  for (const id of ['audit-unknown-plan','audit-unrelated-knowledge','audit-unrelated-quota','audit-user-chat','audit-user-verbose']) {
    assert.equal(await page.locator('#' + id).textContent(), await page.evaluate(id => window.auditOriginals[id], id), id);
  }
  const protectedIds=['audit-rule-name','audit-command','audit-workspace-name','audit-automation-name','audit-queued-message','audit-plugin-name','audit-file-name','audit-generated','audit-percentage','audit-distro','audit-market-brand','audit-invalid-duration','audit-custom-model','audit-browser-title','audit-market-name'];
  for(const id of protectedIds) assert.equal(await page.locator('#'+id).textContent(),await page.evaluate(id=>window.auditOriginals[id],id),id);
  for (const id of ['audit-onboarding-user-content', 'audit-onboarding-unrelated']) assert.equal(await page.locator('#' + id).textContent(), 'Build new features', id);
  const signIn = {
    'audit-sign-in-heading': '欢迎使用 Antigravity！', 'audit-business-sign-in-heading': '企业账号登录',
    'audit-sign-in-google': '通过 Google 继续', 'audit-sign-in-business': '使用企业账号', 'audit-sign-in-help': '登录遇到问题？',
    'audit-auth-code-hint': '请在浏览器中登录，然后粘贴回调页面显示的授权码。', 'audit-auth-code-submit': '提交授权码',
    'audit-persona-title': '我们来为你定制使用体验。以下哪项最符合你的工作？',
    'audit-persona-greeting': '你好，Alex！', 'audit-persona-option': '科学'
  };
  for (const [id, value] of Object.entries(signIn)) assert.equal(await page.locator('#' + id).textContent(), value, id);
  for (const id of ['audit-sign-in-user-content', 'audit-persona-user-content', 'audit-persona-unrelated']) {
    assert.equal(await page.locator('#' + id).textContent(), await page.evaluate(id => window.auditOriginals[id], id), id);
  }
  const authorization = page.locator('#audit-auth-code');
  assert.equal(await authorization.getAttribute('placeholder'), '粘贴授权码');
  assert.equal(await authorization.inputValue(), 'Test-value-not-a-credential');
  await page.evaluate(() => {
    const heading = document.querySelector('#audit-sign-in-heading');
    document.querySelector('#audit-sign-in-reparenting').append(heading.firstChild);
    document.querySelector('#audit-persona-greeting').firstChild.nodeValue = 'Hey there!';
  });
  await page.waitForFunction(() => document.querySelector('#audit-sign-in-reparenting').textContent === 'Welcome to Antigravity!' &&
    document.querySelector('#audit-persona-greeting').textContent === '你好！');
  await page.evaluate(() => {
    document.querySelector('#audit-sign-in-heading').append(document.querySelector('#audit-sign-in-reparenting').firstChild);
    document.querySelector('#audit-persona-greeting').firstChild.nodeValue = 'Hey Alex!';
  });
  await page.waitForFunction(() => document.querySelector('#audit-sign-in-heading').textContent === '欢迎使用 Antigravity！' &&
    document.querySelector('#audit-persona-greeting').textContent === '你好，Alex！');
  assert.equal(await page.locator('#audit-search').getAttribute('placeholder'),dictionary['Search automations...']);
  assert.equal(await page.locator('#audit-search').inputValue(),'New');
  assert.equal(await page.locator('#audit-model-name').evaluate(el=>el.firstChild.nodeValue),'Custom');
  assert.equal(await page.locator('#audit-model-name span').textContent(),' '+dictionary.High);
  assert.equal(await page.locator('#audit-animated-prefix').getAttribute('data-antigravity-zh-prefix'),dictionary.Reading);
  assert.equal(await page.locator('#audit-animated-prefix').evaluate(el=>getComputedStyle(el,'::after').content),JSON.stringify(dictionary.Reading));
  assert.equal(await page.locator('#audit-tool-path').textContent(),'/tmp/New');
  assert.equal(await page.locator('#audit-theme-warning').textContent(),'对比度过低（2.3:1），文字可能难以阅读。');
  assert.equal(await page.locator('#audit-theme-mode-light').getAttribute('title'),dictionary.Light);
  assert.equal(await page.locator('#audit-theme-reset').getAttribute('title'),dictionary['Reset to preset']);
  assert.equal(await page.locator('#audit-theme-color').inputValue(),'F9F9F9');
  for(const id of ['audit-theme-brand','audit-theme-code']) assert.equal(await page.locator('#'+id).textContent(),await page.evaluate(id=>window.auditOriginals[id],id));
  await page.locator('#audit-theme-preset').click();
  assert.equal(await page.evaluate(()=>window.auditSelectedPreset),'Default Light');
  await page.locator('#audit-docs-description span').click();assert.equal(await page.evaluate(()=>window.auditHighlightClicks),1);
  // A partial React text update in a highlighted description must not leave a
  // stale mixture of translated and newly supplied English content.
  await page.evaluate(()=>{document.querySelector('#audit-docs-description').firstChild.nodeValue='Read, ';document.querySelector('#audit-docs-description span').firstChild.nodeValue='draft';document.querySelector('#audit-docs-description').lastChild.nodeValue=', and edit docs.';document.querySelector('#audit-weekly-description').firstChild.nodeValue='You have used some of your weekly limit, it will fully refresh in 1 day, 1 hour.';});
  await page.waitForFunction(()=>document.querySelector('#audit-weekly-description').textContent.includes('1天1小时'));
  assert.equal(await page.locator('#audit-docs-description').textContent(),remote['Read, draft, and edit docs.']);
  await page.evaluate(()=>window.auditMountDropdowns());
  await page.waitForFunction(()=>document.querySelector('[data-menu="security"] [data-value="machine"] [data-dropdown-label]').textContent==='整台计算机');
  const dropdownOriginals={default:'Default',machine:'Full machine',turbo:'Turbo mode',custom:'Custom'};
  for(const [value,key] of Object.entries(dropdownOriginals)) {
    const item=page.locator('[data-menu="security"] [data-value="'+value+'"]');
    assert.equal(await item.locator('[data-dropdown-label]').textContent(),dictionary[key]);
    await item.click();
    assert.deepEqual(await page.evaluate(()=>window.auditDropdownSelected),{menu:'security',value});
  }
  for(const key of ['Catppuccin','Gruvbox Material','One Light','Solarized Light','One Dark Pro','Solarized Dark']) {
    const item=page.locator('[data-menu="theme"] [data-value="'+key+'"]');
    assert.equal(await item.textContent(),dictionary[key]||key);
    await item.click();
    assert.deepEqual(await page.evaluate(()=>window.auditDropdownSelected),{menu:'theme',value:key});
  }
  for(const [value,key] of Object.entries({default:'Requires manual review for all terminal commands and file accesses outside of the working folders.',machine:'All terminal commands require review. The agent can read or write to any file in the machine.',turbo:'Disables all safety barriers for maximal iteration velocity.'})) {
    assert.equal(await page.locator('[data-menu="security"] [data-value="'+value+'"] span').textContent(),dictionary[key]);
  }
  // portal 在设置容器之外挂载；再次创建仍须汉化，切回英文后精确还原。
  await page.evaluate(()=>window.auditMountDropdowns());
  await page.waitForFunction(()=>document.querySelector('[data-menu="security"] [data-value="turbo"] [data-dropdown-label]').textContent==='完全放行模式');
  for(const id of ['audit-dropdown-project','audit-dropdown-response','audit-dropdown-code']) assert.equal(await page.locator('#'+id).textContent(),await page.evaluate(id=>window.auditOriginals[id],id),id);
  console.log('PASS: late-mounted portal options, permission descriptions, theme brands, original values, events and user-content protection.');
  console.log('PASS: full-audit menu/settings/quota/marketplace/history/automation fixtures, strict dynamic values and user-data protection.');
};
exports.verifyEnglish = async page => {
  const failures=await page.evaluate(()=>Object.entries(window.auditOriginals).filter(([id,value])=>id!=='audit-weekly-description'&&document.getElementById(id).textContent!==value).map(([id])=>id));
  assert.deepEqual(failures,[]);
  assert.equal(await page.locator('#audit-layout-knowledge').getAttribute('aria-label'), 'Knowledge Work');
  assert.equal(await page.locator('#audit-layout-engineering').getAttribute('aria-label'), 'Software Engineering');
  const authorization = page.locator('#audit-auth-code');
  assert.equal(await authorization.getAttribute('placeholder'), 'Paste authorization code');
  assert.equal(await authorization.inputValue(), 'Test-value-not-a-credential');
  for(const [value,key] of Object.entries({default:'Default',machine:'Full machine',turbo:'Turbo mode',custom:'Custom'})) assert.equal(await page.locator('[data-menu="security"] [data-value="'+value+'"] [data-dropdown-label]').textContent(),key);
  for(const key of ['Catppuccin','Gruvbox Material','One Light','Solarized Light','One Dark Pro','Solarized Dark']) assert.equal(await page.locator('[data-menu="theme"] [data-value="'+key+'"]').textContent(),key);
  assert.equal(await page.locator('[data-menu="security"] [data-value="machine"] span').textContent(),'All terminal commands require review. The agent can read or write to any file in the machine.');
  assert.equal(await page.locator('#audit-animated-prefix').getAttribute('data-antigravity-zh-prefix'),null);
  assert.equal(await page.locator('#audit-theme-mode-light').getAttribute('title'),'Light');
  assert.equal(await page.locator('#audit-theme-reset').getAttribute('title'),'Reset to preset');
  assert.equal(await page.locator('#audit-theme-color').inputValue(),'F9F9F9');
  assert.equal(await page.locator('#audit-weekly-description').textContent(),'You have used some of your weekly limit, it will fully refresh in 1 day, 1 hour.');
};
exports.verifyComposerWithoutLanguageOverlay = async page => {
  const previous = page.viewportSize();
  if (previous) await page.setViewportSize({ width: 350, height: 360 });
  await page.evaluate(() => {
    const composer = document.createElement('section');
    composer.id = 'audit-narrow-composer';
    Object.assign(composer.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '9999' });
    composer.innerHTML = '<textarea aria-label="fixture input"></textarea><button>Test action</button>';
    composer.querySelector('button').onclick = () => { composer.dataset.clicked = 'yes'; };
    document.body.append(composer);
  });
  const composer = page.locator('#audit-narrow-composer');
  const input = composer.locator('textarea');
  try {
    assert.equal(await page.locator('#antigravity-language-setting, #antigravity-language-switcher').count(), 0);
    await input.click();
    await page.keyboard.type('fixture draft');
    await composer.locator('button').click();
    assert.equal(await composer.getAttribute('data-clicked'), 'yes');
    await input.focus();
    await page.keyboard.press('Control+Alt+l');
    assert.equal(await page.locator('#antigravity-language-setting, #antigravity-language-switcher').count(), 0);
    assert.equal(await input.evaluate(el => document.activeElement === el), true);
    await page.keyboard.type(' remains editable');
    assert.equal(await input.inputValue(), 'fixture draft remains editable');
  } finally {
    await composer.evaluate(el => el.remove());
    if (previous) await page.setViewportSize(previous);
  }
};
exports.mountLanguageSettingsFixture = async page => {
  await page.evaluate(() => {
    const mount = document.createElement('section');
    mount.id = 'audit-general-screen';
    mount.innerHTML = '<div class="max-w-2xl mx-auto"><div><div><h2>General</h2>' +
      '<div class="text-muted-foreground bg-transparent">Configure agent execution, queued message delivery, and permissions.</div>' +
      '</div></div><div>Settings body</div></div>';
    document.body.append(mount);
  });
  return page.locator('#audit-general-screen');
};
exports.switchLanguageFromSettings = async (settings, value) => {
  const select = settings.getByRole('combobox');
  await select.click();
  await settings.getByRole('option', { name: value === 'en' ? 'English' : '简体中文', exact: true }).click();
  await settings.locator('[role="combobox"]:not([aria-busy])').waitFor();
};
exports.verifySettingsLanguageEntry = async page => {
  const mount = await exports.mountLanguageSettingsFixture(page);
  const entry = mount.locator('#antigravity-language-setting');
  const select = entry.getByRole('combobox');
  await entry.getByRole('combobox', { name: '界面语言' }).waitFor();
  assert.equal(await entry.evaluate(el => getComputedStyle(el).position), 'static');
  assert.equal(await select.textContent(), '简体中文');
  await page.keyboard.press('Control+Alt+l');
  assert.equal(await select.evaluate(el => el.getRootNode().activeElement === el), true);
  await page.keyboard.press('ArrowDown');
  const options = entry.getByRole('listbox');
  await options.waitFor();
  const selected = options.getByRole('option', { name: '简体中文', selected: true });
  assert.equal(await selected.locator('svg').evaluate(el => getComputedStyle(el).visibility), 'visible');
  assert.equal(await options.getByRole('option', { name: 'English' }).locator('svg').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.keyboard.press('Escape');
  await options.waitFor({ state: 'hidden' });
  assert.equal(await select.evaluate(el => el.getRootNode().activeElement === el), true);
  await select.click();
  await mount.locator('h2').click();
  await options.waitFor({ state: 'hidden' });
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await entry.getByRole('combobox', { name: 'Interface Language' }).waitFor();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await entry.locator('[role="combobox"]:not([aria-busy])').waitFor();
  assert.equal(await select.textContent(), 'English');
  assert.equal(await page.locator('#antigravity-language-switcher').count(), 0);
  await exports.switchLanguageFromSettings(mount, 'zh-CN');
  await entry.getByRole('combobox', { name: '界面语言' }).waitFor();
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await mount.locator('h2').evaluate(el => { el.nextElementSibling.textContent = 'Settings for this project.'; });
  await entry.waitFor({ state: 'detached' });
  await mount.locator('h2').evaluate(el => {
    el.nextElementSibling.textContent = 'Configure agent execution, queued message delivery, and permissions.';
  });
  await entry.getByText('界面语言', { exact: true }).waitFor();
  assert.equal(await entry.count(), 1);
  await mount.evaluate(el => el.remove());
  await page.locator('#antigravity-language-setting').waitFor({ state: 'detached' });
};
