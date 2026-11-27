/* Runs inline in Electron's existing isolated preload; no new Node privileges. */
function installChineseUI(dictionary, bridge, config) {
  'use strict';
  if (window.__antigravityChineseUI) return;
  // Restrict to the application document, never webview guests or external pages.
  const host = location.hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return;
  config = config || {};
  window.__antigravityChineseUI = { version: config.patchVersion || 'unknown' };
  const remoteDictionary = config.remote || {};
  const dynamicRules = (config.rules || []).map(rule => ({ ...rule, regex: new RegExp(rule.pattern) }));
  let language = 'en';
  let observer;
  let languageRow;
  let languageControl;
  let started = false;
  let latestEvent = 0;
  const textRecords = new Map();
  const attributeRecords = new Map();
  const prefixRecords = new Map();
  const prefixSelector = 'div.flex.flex-row.items-center.gap-1.overflow-hidden.whitespace-nowrap.text-muted-foreground';
  function toolPrefix(element) {
    const row = element.closest(prefixSelector), first = row?.firstElementChild;
    return first?.matches('span.text-muted-foreground:not(.truncate):not(.inline-flex)') && first.contains(element) ? first : null;
  }
  const protectedSelector = [
    'script', 'style', 'pre', 'code', 'kbd', 'textarea', 'input', '[contenteditable]',
    '[data-no-translate]', '[translate="no"]', '.notranslate', '.monaco-editor',
    '.cm-editor', '.xterm', '[class*="markdown"]', '[class*="prose"]',
    '[data-message-author-role]', '[data-testid*="message-content"]',
    '[data-testid="user-input-step"]', '[data-testid="planner-response-text"]',
    '[data-testid="pending-user-messages"]', '[data-testid="markdown-frontmatter"]',
    '[data-testid*="conversation-title"]', '[data-testid*="workspace-name"]',
    '[data-testid^="conversation-row-"] span.truncate.text-left.w-full',
    '[data-testid^="conversation-row-"] > a.absolute.inset-0',
    '[data-testid="project-header"] span.truncate.text-sm', '[data-testid="project-header"] span.truncate.text-base',
    '[data-testid="project-selector-item"] > span.truncate',
    '[data-testid^="project-selector-machine-trigger-"] span.truncate',
    '[data-testid="settings-nav-item-Account"]',
    '[data-testid="plugin-suggested-prompt-row"]', '[data-testid="file-title-name"]',
    '[data-testid="permission-app-header"]', '[data-testid="hover-card-title"]',
    '[data-quotable-inline][data-uri]', '[data-testid="agent-embed"]',
    '[data-testid="queued-messages-card"] span.line-clamp-2',
    '[data-testid="media-modal-title"]', '[data-testid="sidecar-logs-content"]',
    '[data-testid="cloud-trigger-row"] span.text-foreground.truncate',
    '[data-testid="sidecar-row"] span.text-foreground.truncate',
    '[data-testid="cloud-trigger-detail"] span.text-lg.font-medium.truncate',
    '[data-testid^="sidecar-row-"] > span.text-foreground',
    '[role="listbox"][aria-label="Workspace folder suggestions"] [role="option"]',
    '[data-testid="delete-sidecar-modal"] strong',
    '[data-testid="model-selector-effort-group"]',
    '[data-testid="model-selector-item"] span.truncate',
    '[data-testid="browser-autocomplete-option"] span.truncate',
    '[data-testid^="new-tab-result-"] span.truncate',
    '[data-testid="automation-instructions-markdown"]', '[data-testid="automation-run"] span.truncate',
    'button.-ml-1.min-w-0 > span.min-w-0.truncate.whitespace-nowrap',
    '[aria-label^="Shortcut "]:has(> span.text-sm)', '.font-mono'
  ].join(',');
  const attributeProtectedSelector = protectedSelector.split(',').filter(selector => !['input', 'textarea'].includes(selector.trim())).join(',');
  const controlSelector = [
    'button', '[role="button"]', '[role="menuitem"]', '[role="tab"]',
    'label', 'legend', 'option', 'h1', 'h2', 'h3', 'h4', '[data-zh-ui]',
    '[data-testid="new-conversation-button"]', '[data-testid="history-button"]',
    '[data-testid^="mode-option-"]', '[data-testid="voice-settings-name"]',
    'a[href$="/customizations"]', '[data-testid="title-menu-bar"]',
    '[role="option"]',
    '[data-testid="plugins-tabs"]', '[role="dialog"]', '[role="alertdialog"]',
    '[role="alert"]', '[role="status"]', '[role="tooltip"]',
    '[data-testid="sidecar-list-empty"]', '[data-testid="cloud-trigger-list-empty"]',
    '[data-testid="cloud-trigger-editor-panel"]',
    '[data-testid="side-question-history-counter"]',
    '[data-testid^="onboarding-capability-"]',
    '[data-testid="post-onboarding-welcome-modal"]', '[data-testid="webview-downloads-empty"]',
    '[data-testid="automation-runs"] p.m-0.px-3.py-2\\.5',
    '[data-testid="automation-instructions"] p.m-0.text-muted-foreground',
    '.max-w-2xl.mx-auto',
    '.max-w-2xl.mx-auto div.text-sm.text-muted-foreground.bg-transparent',
    '.max-w-2xl.mx-auto .flex.items-center.gap-1.text-xs.text-muted-foreground',
    '.max-w-2xl.mx-auto .flex.items-center.gap-1.mt-0\\.5',
    '.max-w-2xl.mx-auto span.text-xs.text-muted-foreground.whitespace-pre-wrap',
    '.max-w-2xl.mx-auto .flex.items-center.gap-1\\.5 > span.text-sm'
  ].join(',');
  let translated = 0;
  function settingsElement(element) { return !!element.closest('.max-w-2xl.mx-auto,.w-72.max-h-80'); }
  function marketplaceElement(element) {
    const dialog = element.closest('[role="dialog"]');
    if (dialog?.querySelector('[data-testid="plugin-detail-footer"]')) return true;
    const body = element.closest('.max-w-4xl.w-full.mx-auto.px-8.py-6');
    if (!body) return false;
    const title = body.parentElement?.querySelector('h1');
    return title && originalText(title) === 'Customizations';
  }
  function historyNotice(element) {
    const notice = element.closest('.flex.items-start.gap-2\\.5.rounded-lg.border.bg-card');
    const title = notice?.querySelector('span.font-medium.text-foreground');
    return title && originalText(title) === 'This page is going away soon';
  }
  function onboardingGreeting(element) {
    if (!element.matches('p.entrance-step.font-medium')) return false;
    const label = element.nextElementSibling;
    const choices = label?.nextElementSibling;
    return label?.matches('p.entrance-step[id]') && choices?.matches('[role="radiogroup"]')
      && label.id === choices.getAttribute('aria-labelledby')
      && originalText(label) === "Let's tailor the experience for you. What best describes your work?";
  }
  function uiElement(element, key) {
    if (element.closest(controlSelector) || historyNotice(element) || marketplaceElement(element) || toolPrefix(element) || onboardingGreeting(element)) return true;
    // Exact, reviewed full UI sentences can occur in otherwise unmarked empty
    // states/descriptions. Names and arbitrary generated text remain protected.
    return key.length >= 40 && /\s/.test(key) && Object.prototype.hasOwnProperty.call(dictionary, key);
  }
  function duration(value, compact = false) {
    if (compact) {
      if (value === '<1m') return '不到 1 分钟';
      if (!/^(?:\d+[dhm]\s*)+$/.test(value)) return null;
      return value.replace(/(\d+)([dhm])/g, (_, n, unit) => n + ({d:'天',h:'小时',m:'分钟'})[unit]);
    }
    if (!/^(?:\d+(?:\.\d+)?\s+(?:days?|hours?|minutes?|seconds?)(?:,\s*|\s+and\s+|\s*)?)+$/.test(value)) return null;
    return value.replace(/(\d+(?:\.\d+)?)\s+(days?|hours?|minutes?|seconds?)/g, (_, n, unit) => n + (unit.startsWith('day')?'天':unit.startsWith('hour')?'小时':unit.startsWith('minute')?'分钟':'秒')).replace(/,\s*|\s+and\s+/g, '');
  }
  function translate(value, element, attributeName) {
    const key = value.trim();
    let next;
    const greetingName = !attributeName && element.closest('[data-testid="home-greeting"] h1')
      ? /^Hi (\S+), what can we get done today\?$/.exec(key)?.[1] : undefined;
    const onboardingName = !attributeName && onboardingGreeting(element)
      ? /^Hey ([^\r\n]+)!$/.exec(key)?.[1] : undefined;
    if (greetingName) next = `你好，${greetingName}，今天想做些什么？`;
    else if (onboardingName) next = `你好，${onboardingName}！`;
    else if (key === 'Press' && element.closest('[data-testid="post-onboarding-welcome-tip"]')) next = '按';
    else if (key === 'Type' && element.closest('[data-testid="plan-command-fyi-alert"]')) next = '输入';
    else if (historyNotice(element) && key === '(') next = '（';
    else if (historyNotice(element) && key === '.') next = '。';
    else if (Object.prototype.hasOwnProperty.call(dictionary, key)) next = dictionary[key];
    else if ((settingsElement(element) || marketplaceElement(element)) && Object.prototype.hasOwnProperty.call(remoteDictionary, key)) next = remoteDictionary[key];
    else for (const rule of dynamicRules) {
      if (rule.scope === 'attribute' ? !attributeName : attributeName ||
        (rule.scope === 'settings' ? !settingsElement(element) : rule.scope === 'title-menu' ? !element.closest('[data-testid="title-menu-bar"]') : rule.scope === 'marketplace' ? !marketplaceElement(element) : !uiElement(element, key))) continue;
      const match = key.match(rule.regex);
      if (!match) continue;
      let valid = true;
      for (const group of rule.durationGroups || []) { const parsed = duration(match[group]); if (parsed === null) valid = false; else match[group] = parsed; }
      for (const group of rule.compactDurationGroups || []) { const parsed = duration(match[group], true); if (parsed === null) valid = false; else match[group] = parsed; }
      for (const group of rule.limitGroups || []) match[group] = match[group] === 'weekly' ? '每周' : '五小时';
      for (const [group, labels] of Object.entries(rule.labelGroups || {})) { if (!(match[group] in labels)) valid = false; else match[group] = labels[match[group]]; }
      if (!valid) continue;
      next = rule.replacement.replace(/\{(\d+)\}/g, (_, group) => match[Number(group)]);
      break;
    }
    if (next === undefined) return value;
    return value.slice(0, value.indexOf(key)) + next + value.slice(value.indexOf(key) + key.length);
  }
  function originalText(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let value = '';
    while (walker.nextNode()) {
      const node = walker.currentNode, record = textRecords.get(node);
      value += record && node.nodeValue === record.applied ? record.original : node.nodeValue;
    }
    return value.trim();
  }
  function userOwnedElement(element) {
    if (marketplaceElement(element) && element.closest('div.font-medium.text-sm.text-foreground.truncate')) return true;
    if (element.matches('[data-testid="model-selector-item"][data-model-label]')) return true;
    const modelTrigger = element.closest('[data-testid="model-selector-trigger"]');
    const modelName = modelTrigger?.querySelector(':scope > span:first-of-type');
    if (modelName?.contains(element) && !element.closest('span.opacity-70')) return true;
    if (element.closest(prefixSelector) && !toolPrefix(element)) return true;
    if (settingsElement(element) && element.closest('span.text-sm.font-medium.truncate,span.text-lg.font-medium.truncate')) return true;
    // 发行版名称是用户数据，即使恰好与 Default 等界面词条同名。
    const settingRow = element.closest('.w-full.justify-between.gap-4:has([data-testid^="wsl-connect-"])');
    if (settingRow?.firstElementChild?.querySelector(':scope > div > span:first-child')?.contains(element)) return true;
    if (element.closest('[data-file-uri] .truncate')) return true;
    const suggestions = element.closest('[role="listbox"]');
    if (suggestions) {
      const record = attributeRecords.get(suggestions)?.get('aria-label');
      const label = record && suggestions.getAttribute('aria-label') === record.applied ? record.original : suggestions.getAttribute('aria-label');
      if (label === 'Workspace folder suggestions') return true;
    }
    // Q3 renders both fixed settings tabs and arbitrary project/workspace names.
    // Its test ID alone cannot distinguish them (a project may be named Models).
    const nav = element.closest('[data-testid^="settings-nav-item-"]');
    if (nav) {
      const heading = nav.parentElement?.previousElementSibling?.querySelector('h2');
      if (heading && ['Projects', 'Workspaces', 'Ungrouped Projects', 'Unassigned Projects'].includes(originalText(heading))) return true;
    }
    // Override links and their portaled menu entries contain user project names.
    if (element.closest('[data-testid$="-overrides-trigger"]')) return true;
    const menu = element.closest('[role="menu"]');
    if (menu) {
      const labelledBy = (menu.getAttribute('aria-labelledby') || '').split(/\s+/);
      if (labelledBy.some(id => document.getElementById(id)?.matches('[data-testid$="-overrides-trigger"]'))) return true;
      if ([...document.querySelectorAll('[data-testid$="-overrides-trigger"][aria-controls]')].some(trigger => trigger.getAttribute('aria-controls') === menu.id)) return true;
    }
    return false;
  }
  function protectedElement(element) { return !element || !!element.closest(protectedSelector) || userOwnedElement(element); }
  const fragments = new Set(['Modified in', 'Learn more about', 'and select', 'to have the agent generate a plan.', 'projects', 'Search conversations with', 'in the top left.', 'View archived in the sidebar', 'menu)']);
  const grammarFragments = new Set(['A','an','the','of','for','and','including','need','two','three','insertion','deletion']);
  const countFragments = new Set(['files','image','images','result','results','question','attempt','finding','resources','subagent','comment']);
  function fragmentAllowed(node, key) {
    const element = node.parentElement;
    if (grammarFragments.has(key)) return settingsElement(element) || !!element.closest('[role="dialog"],[role="alertdialog"],[data-testid="side-question-history-counter"]');
    if (countFragments.has(key)) return /^\d[\d,.]*\s/.test(originalText(element)) && uiElement(element, key);
    if (['Search conversations with', 'in the top left.', 'View archived in the sidebar', 'menu)'].includes(key)) return !!historyNotice(element);
    if (['Type', 'and select', 'to have the agent generate a plan.'].includes(key)) return !!element.closest('[data-testid="plan-command-fyi-alert"]');
    if (!element.closest('.max-w-2xl.mx-auto')) return false;
    if (key === 'Learn more about') return !!element.closest('.flex.items-center.gap-1.mt-0\\.5');
    const composite = element.closest('span.inline-block');
    return !!composite?.querySelector('[data-testid$="-overrides-trigger"]') &&
      (key === 'Modified in' ? element === composite : !!element.closest('[data-testid$="-overrides-trigger"]'));
  }
  function text(node) {
    if (language !== 'zh-CN') return;
    const element = node.parentElement;
    if (toolPrefix(element)?.querySelector('[data-slot]')) return;
    const previous = textRecords.get(node);
    const original = node.nodeValue;
    const key = original.trim();
    const sourceKey = previous && original === previous.applied ? previous.original.trim() : key;
    // Only the count suffix inside the override trigger is UI; its project names
    // stay untouched. A named project "projects" is not a numeric count suffix.
    const countSuffix = sourceKey === 'projects' && fragmentAllowed(node, sourceKey) &&
      /^\d+\s*$/.test(node.previousSibling?.nodeValue || '');
    if (protectedElement(element) && !(countSuffix && !element.closest(protectedSelector))) {
      if (previous && original === previous.applied) node.nodeValue = previous.original;
      textRecords.delete(node);
      return;
    }
    if (previous && original === previous.applied) return;
    if (fragments.has(key) || grammarFragments.has(key) || countFragments.has(key) ? !fragmentAllowed(node, key) : !uiElement(element, key)) return;
    const next = translate(original, element);
    if (next !== original) { node.nodeValue = next; textRecords.set(node, { original, applied: next }); translated++; }
    else textRecords.delete(node);
  }
  const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
  function attribute(element) {
    if (language !== 'zh-CN') return;
    if (!element) return;
    if (element.closest(attributeProtectedSelector) || userOwnedElement(element)) {
      for (const [name, record] of attributeRecords.get(element) || []) {
        if (element.getAttribute(name) === record.applied) element.setAttribute(name, record.original);
      }
      attributeRecords.delete(element);
      return;
    }
    for (const name of attributes) {
      const current = element.getAttribute(name);
      const previous = attributeRecords.get(element)?.get(name);
      if (previous && current === previous.applied) continue;
      if (current === null) { attributeRecords.get(element)?.delete(name); continue; }
      const next = fragments.has(current?.trim()) ? current : translate(current, element, name);
      if (current !== next) {
        element.setAttribute(name, next);
        if (!attributeRecords.has(element)) attributeRecords.set(element, new Map());
        attributeRecords.get(element).set(name, { original: current, applied: next });
        translated++;
      } else attributeRecords.get(element)?.delete(name);
    }
  }
  function scan(root) {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    animatedPrefixes(root);
    compoundDescriptions(root);
    if (root.nodeType === 1) attribute(root);
    for (const element of root.querySelectorAll('*')) attribute(element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
  }
  function animatedPrefixes(root) {
    const rows = [...root.querySelectorAll(prefixSelector)];
    if (root.nodeType === 1) { const row = root.closest(prefixSelector); if (row) rows.push(row); }
    for (const row of rows) {
      const prefix = row.firstElementChild;
      if (!prefix || toolPrefix(prefix) !== prefix || protectedElement(prefix)) continue;
      const key = originalText(prefix), next = dictionary[key];
      if (!prefix.querySelector('[data-slot]') || !next) {
        prefix.removeAttribute('data-antigravity-zh-prefix'); prefixRecords.delete(prefix); continue;
      }
      // Cvb splits fixed verbs across animated spans, and outgoing text lives
      // in CSS attrs. Render the complete localized fixed prefix through CSS
      // while keeping React's children and animation inputs intact. Content,
      // paths and custom titles in the other columns are never included.
      prefix.setAttribute('data-antigravity-zh-prefix', next); prefixRecords.set(prefix, next);
    }
  }
  function compoundDescriptions(root) {
    // Marketplace VV wraps search hits in spans. Match the complete reviewed
    // description, then edit only text nodes; keep its elements and listeners.
    const selector = '.text-xs.text-muted-foreground.truncate,.text-xs.text-muted-foreground.line-clamp-2';
    const candidates = [...root.querySelectorAll(selector)];
    if (root.nodeType === 1 && root.matches(selector)) candidates.unshift(root);
    for (const element of candidates) {
      if (!marketplaceElement(element) || protectedElement(element)) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      if (nodes.length < 2) continue;
      const original = nodes.map(node => { const record = textRecords.get(node); return record && node.nodeValue === record.applied ? record.original : node.nodeValue; }).join('');
      const next = translate(original, element);
      if (next === original) {
        for (const node of nodes) {
          const record = textRecords.get(node);
          if (record && node.nodeValue === record.applied) node.nodeValue = record.original;
          textRecords.delete(node);
        }
        continue;
      }
      // Distribute characters across the original inline spans so highlights
      // and the structure stay present, while English can restore byte-for-byte.
      let consumed = 0, offset = 0;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i], record = textRecords.get(node);
        const value = record && node.nodeValue === record.applied ? record.original : node.nodeValue;
        consumed += value.length;
        const end = i === nodes.length - 1 ? next.length : Math.round(next.length * consumed / original.length);
        const applied = next.slice(offset, end); offset = end;
        textRecords.set(node, {original:value, applied});
        if (node.nodeValue !== applied) node.nodeValue = applied;
      }
    }
  }
  function observe() {
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  }
  function applyLanguage(next) {
    if (next !== 'zh-CN' && next !== 'en') return;
    language = next;
    if (!started) return;
    observer.disconnect();
    // Restore exact originals only while our applied value is still present.
    // Application updates made meanwhile must never be overwritten.
    for (const [node, record] of textRecords) if (node.isConnected && node.nodeValue === record.applied) node.nodeValue = record.original;
    for (const [element, records] of attributeRecords) {
      if (!element.isConnected) continue;
      for (const [name, record] of records) if (element.getAttribute(name) === record.applied) element.setAttribute(name, record.original);
    }
    textRecords.clear(); attributeRecords.clear();
    for (const [prefix, applied] of prefixRecords) if (prefix.getAttribute('data-antigravity-zh-prefix') === applied) prefix.removeAttribute('data-antigravity-zh-prefix');
    prefixRecords.clear();
    document.documentElement.lang = language;
    if (language === 'zh-CN') scan(document.body);
    syncLanguageRow();
    languageControl?.update();
    observe();
  }
  function createLanguageRow() {
    const row = document.createElement('div');
    row.id = 'antigravity-language-switcher';
    row.className = 'agy-card bg-transparent rounded-xl border border-border';
    row.setAttribute('data-no-translate', '');
    row.innerHTML = `
      <div class="py-2 px-3 w-full bg-transparent flex justify-between gap-4 items-center">
        <div class="flex-1 flex flex-col gap-0.5">
          <span id="antigravity-language-label"></span>
          <span id="antigravity-language-description" class="text-sm text-muted-foreground whitespace-pre-wrap" role="status"></span>
        </div>
        <div class="shrink-0">
          <button type="button" class="agy-select-trigger appearance-none px-2 py-1 bg-secondary text-secondary-foreground hover:text-foreground rounded-md border-none cursor-pointer flex items-center gap-1 justify-between min-w-[140px]" aria-labelledby="antigravity-language-label antigravity-language-value" aria-describedby="antigravity-language-description" aria-haspopup="listbox" aria-controls="antigravity-language-options" aria-expanded="false">
            <span id="antigravity-language-value" class="truncate"></span>
            <svg aria-hidden="true" class="w-3 h-3 shrink-0 opacity-70 ml-auto" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="antigravity-language-options" popover="auto" role="listbox" aria-labelledby="antigravity-language-label" class="agy-overlay surface-glass border rounded-lg bg-card text-foreground shadow-md p-1"></div>
        </div>
      </div>`;
    const label = row.querySelector('#antigravity-language-label');
    const status = row.querySelector('#antigravity-language-description');
    const value = row.querySelector('#antigravity-language-value');
    const trigger = row.querySelector('button');
    const list = row.querySelector('[role="listbox"]');
    const choices = [['zh-CN', '简体中文'], ['en', 'English']];
    const options = choices.map(([code, caption]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.dataset.language = code;
      option.setAttribute('role', 'option');
      option.className = 'agy-overlay-item w-full text-left whitespace-nowrap transition-colors duration-150 select-none rounded-md flex items-center justify-between gap-2 px-2 py-1 text-compact outline-none cursor-pointer focus:bg-secondary focus:text-foreground hover:bg-secondary';
      option.innerHTML = '<span class="truncate"></span><svg aria-hidden="true" class="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      option.firstElementChild.textContent = caption;
      option.addEventListener('click', () => choose(code));
      list.append(option);
      return option;
    });
    const index = () => Number(language === 'en');
    const isOpen = () => list.matches(':popover-open');
    function update() {
      label.textContent = language === 'zh-CN' ? '界面语言' : 'Interface language';
      status.textContent = language === 'zh-CN' ? '当前界面立即切换，原生菜单重启后生效。' : 'The interface changes immediately. Native menus update after restart.';
      value.textContent = choices[index()][1];
      for (const [i, option] of options.entries()) {
        option.setAttribute('aria-selected', String(i === index()));
        option.toggleAttribute('data-selected', i === index());
        option.lastElementChild.style.visibility = i === index() ? '' : 'hidden';
      }
    }
    function close(restoreFocus) {
      if (isOpen()) list.hidePopover();
      if (restoreFocus) trigger.focus();
    }
    function position() {
      if (!isOpen()) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(rect.width, list.offsetWidth);
      const height = list.offsetHeight;
      const below = rect.bottom + 6;
      const above = rect.top - height - 6;
      list.style.left = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)) + 'px';
      list.style.top = Math.max(8, below + height <= innerHeight - 8 || above < 8 ? below : above) + 'px';
      list.style.minWidth = rect.width + 'px';
    }
    function open() {
      if (trigger.disabled || isOpen()) return;
      Object.assign(list.style, { position: 'fixed', inset: 'auto', margin: '0', minWidth: trigger.offsetWidth + 'px' });
      list.showPopover({ source: trigger });
      position();
      options[index()].focus({ preventScroll: true });
    }
    async function choose(requested) {
      close(false);
      if (requested === language) { trigger.focus(); return; }
      const eventAtRequest = latestEvent;
      trigger.disabled = true;
      try {
        const saved = await bridge.setLanguage(requested);
        if (latestEvent === eventAtRequest) applyLanguage(saved);
      }
      catch { status.textContent = language === 'zh-CN' ? '保存语言失败，请重试。' : 'Could not save the language. Please try again.'; }
      finally {
        trigger.disabled = false;
        if (row.isConnected && [document.body, trigger].includes(document.activeElement)) trigger.focus();
      }
    }
    trigger.addEventListener('click', () => isOpen() ? close(true) : open());
    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      open();
    });
    list.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(isOpen())));
    list.addEventListener('keydown', event => {
      const current = options.indexOf(document.activeElement);
      if (event.key === 'Tab') { close(true); return; }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const target = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: options.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      options[(target + options.length) % options.length].focus({ preventScroll: true });
    });
    return { row, update, position, close };
  }
  function syncLanguageRow() {
    // 两代设置页的常规面板都用这个标记；它在切换到其他页时卸载。
    const anchor = document.querySelector('.max-w-2xl.mx-auto .space-y-6 > #agent-permissions');
    if (!anchor) {
      languageRow?.remove();
      languageRow = null;
      languageControl = null;
      return;
    }
    if (languageRow?.nextElementSibling === anchor) return;
    languageControl?.close(false);
    languageRow?.remove();
    languageControl = createLanguageRow();
    languageRow = languageControl.row;
    languageControl.update();
    anchor.before(languageRow);
  }
  function start() {
    const prefixStyle = document.createElement('style');
    prefixStyle.textContent = '[data-antigravity-zh-prefix]>*{display:none!important}[data-antigravity-zh-prefix]::after{content:attr(data-antigravity-zh-prefix)}';
    document.head.append(prefixStyle);
    window.addEventListener('resize', () => languageControl?.position());
    document.addEventListener('scroll', () => languageControl?.position(), { capture: true, passive: true });
    observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') { if (record.target.parentElement) animatedPrefixes(record.target.parentElement); text(record.target); if (record.target.parentElement) compoundDescriptions(record.target.parentElement.closest('.text-xs.text-muted-foreground.truncate,.text-xs.text-muted-foreground.line-clamp-2') || record.target.parentElement); }
        else if (record.type === 'attributes') attribute(record.target);
        else for (const node of record.addedNodes) roots.add(node);
      }
      for (const root of roots) scan(root);
      if (records.some(record => record.type === 'childList')) syncLanguageRow();
      for (const record of records) if (record.type === 'childList' && record.target.nodeType === 1) animatedPrefixes(record.target);
      if (records.some(record => record.removedNodes?.length)) {
        for (const node of textRecords.keys()) if (!node.isConnected) textRecords.delete(node);
        for (const element of attributeRecords.keys()) if (!element.isConnected) attributeRecords.delete(element);
        for (const element of prefixRecords.keys()) if (!element.isConnected) prefixRecords.delete(element);
      }
    });
    started = true;
    applyLanguage(language);
  }
  bridge.onLanguageChanged(next => { latestEvent++; applyLanguage(next); });
  const initialEvent = latestEvent;
  bridge.getLanguage().then(next => {
    if (latestEvent === initialEvent) applyLanguage(next);
  }).catch(() => applyLanguage('zh-CN')).finally(() => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  });
}
if (typeof module !== 'undefined') module.exports = { installChineseUI };
