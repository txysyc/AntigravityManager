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
  const layoutLabels = new Set(['Knowledge Work', 'Software Engineering']);
  const layoutDescriptions = new Set([
    'Simplified interface for research, writing, and everyday tasks.',
    'Full interface for coding, developer tools, and managing agents.'
  ]);
  const starterQuota = 'Antigravity Starter Quota';
  const starterDescription = 'Free users and Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.';
  const scopedRemoteKeys = new Set([...layoutLabels, ...layoutDescriptions, starterQuota, starterDescription]);
  const dynamicRules = (config.rules || []).map(rule => ({ ...rule, regex: new RegExp(rule.pattern) }));
  let language = 'en';
  let observer;
  let selector;
  let status;
  let settingsEntry;
  let settingsLabel;
  let updateLanguageChoice;
  let closeLanguageChoices;
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
    'script', 'style', 'pre', 'code', 'textarea', 'input', '[contenteditable]',
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
    '.font-mono'
  ].join(',');
  const attributeProtectedSelector = protectedSelector.split(',').filter(selector => !['input', 'textarea'].includes(selector.trim())).join(',');
  const controlSelector = [
    'button', '[role="button"]', '[role="menuitem"]', '[role="tab"]',
    'label', 'legend', 'option', 'h1', 'h2', 'h3', 'h4', '[data-zh-ui]',
    '[data-testid="new-conversation-button"]', '[data-testid="history-button"]',
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
  const personaLabels = {
    'Software Engineering': '软件工程', 'Knowledge Work': '知识工作',
    'Data & Analytics': '数据与分析', Science: '科学', Design: '设计'
  };
  function onboardingTranslation(element, key) {
    if (key === 'Welcome to Antigravity!' && element.matches('div.entrance-title')) return '欢迎使用 Antigravity！';
    if (key === 'Business Account Sign In' &&
      element.matches('.entrance-auth-panel div.text-lg.font-medium.text-center')) return dictionary[key];
    if (element.matches('p.entrance-step.text-xl') &&
      element.parentElement?.querySelector('[role="radiogroup"] [role="radio"][data-testid^="persona-option-"]')) {
      const name = /^Hey (\S+)!$/.exec(key)?.[1];
      if (name) return name === 'there' ? '你好！' : `你好，${name}！`;
    }
    if (element.matches('[role="radiogroup"] [role="radio"][data-testid^="persona-option-"] > span.line-clamp-2') &&
      Object.prototype.hasOwnProperty.call(personaLabels, key)) return personaLabels[key];
  }
  function settingsTranslation(element, key, attributeName) {
    const isLayoutLabel = layoutLabels.has(key);
    if (isLayoutLabel || layoutDescriptions.has(key)) {
      const layoutCard = element.closest('#project4kMode [data-testid^="mode-option-"]');
      if (layoutCard && (attributeName === 'aria-label' && element === layoutCard && isLayoutLabel ||
        !attributeName && (isLayoutLabel || element.id.includes('-mode-description-')))) return remoteDictionary[key];
      return;
    }
    if (!['Chat', 'Verbose', 'External Browser', starterQuota, starterDescription, 'Your Plan: ' + starterQuota].includes(key)) return;
    if (attributeName || !settingsElement(element)) return;
    if (key === 'Chat' && element.matches('h3.m-0.font-medium')) return '对话';
    if (element.closest('button,[role="button"],[role="radio"]')) {
      if (key === 'Verbose') return '详细';
      if (key === 'External Browser') return '外部浏览器';
    }
    // 套餐名称和说明由服务返回，仅翻译套餐行中已核对的固定文本。
    if (key === 'Your Plan: ' + starterQuota && element.matches('div.font-medium')) return '当前方案：' + remoteDictionary[starterQuota];
    if (key !== starterQuota && key !== starterDescription) return;
    const row = element.closest('.flex-1.flex.flex-col.gap-0\\.5');
    const plan = row?.querySelector('div.font-medium');
    if (plan?.firstChild?.nodeType !== 3 || !originalText(plan).startsWith('Your Plan:')) return;
    if (key === starterQuota && plan.contains(element)) return remoteDictionary[key];
    if (key === starterDescription &&
      element.matches('span.text-sm.text-muted-foreground.whitespace-pre-wrap')) return remoteDictionary[key];
  }
  function uiElement(element, key) {
    if (element.closest(controlSelector) || historyNotice(element) || marketplaceElement(element) || toolPrefix(element)) return true;
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
  function translate(value, element, attributeName, scopedTranslation) {
    const key = value.trim();
    let next;
    const greetingName = !attributeName && element.closest('[data-testid="home-greeting"] h1')
      ? /^Hi (\S+), what can we get done today\?$/.exec(key)?.[1] : undefined;
    if (scopedTranslation !== undefined) next = scopedTranslation;
    else if (greetingName) next = `你好，${greetingName}，今天想做些什么？`;
    else if (key === 'Press' && element.closest('[data-testid="post-onboarding-welcome-tip"]')) next = '按';
    else if (key === 'Type' && element.closest('[data-testid="plan-command-fyi-alert"]')) next = '输入';
    else if (historyNotice(element) && key === '(') next = '（';
    else if (historyNotice(element) && key === '.') next = '。';
    else if (Object.prototype.hasOwnProperty.call(dictionary, key)) next = dictionary[key];
    else if (!scopedRemoteKeys.has(key) && (settingsElement(element) || marketplaceElement(element)) &&
      Object.prototype.hasOwnProperty.call(remoteDictionary, key)) next = remoteDictionary[key];
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
      if (heading && ['Projects', 'Workspaces'].includes(originalText(heading))) return true;
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
    const scopedTranslation = onboardingTranslation(element, sourceKey) ?? settingsTranslation(element, sourceKey);
    // Only the count suffix inside the override trigger is UI; its project names
    // stay untouched. A named project "projects" is not a numeric count suffix.
    const countSuffix = sourceKey === 'projects' && fragmentAllowed(node, sourceKey) &&
      /^\d+\s*$/.test(node.previousSibling?.nodeValue || '');
    if ((protectedElement(element) && !(countSuffix && !element.closest(protectedSelector))) ||
      (previous?.scoped && original === previous.applied && scopedTranslation === undefined)) {
      if (previous && original === previous.applied) node.nodeValue = previous.original;
      textRecords.delete(node);
      return;
    }
    if (previous && original === previous.applied) return;
    if (scopedTranslation === undefined &&
      (fragments.has(key) || grammarFragments.has(key) || countFragments.has(key) ? !fragmentAllowed(node, key) : !uiElement(element, key))) return;
    const next = translate(original, element, undefined, scopedTranslation);
    if (next !== original) { node.nodeValue = next; textRecords.set(node, { original, applied: next, scoped: scopedTranslation !== undefined }); translated++; }
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
      if (current === null) { attributeRecords.get(element)?.delete(name); continue; }
      const source = previous && current === previous.applied ? previous.original : current;
      const scopedTranslation = settingsTranslation(element, source.trim(), name);
      if (previous && current === previous.applied) {
        if (previous.scoped && scopedTranslation === undefined) {
          element.setAttribute(name, previous.original);
          attributeRecords.get(element).delete(name);
        }
        continue;
      }
      const next = fragments.has(current.trim()) ? current : translate(current, element, name, scopedTranslation);
      if (current !== next) {
        element.setAttribute(name, next);
        if (!attributeRecords.has(element)) attributeRecords.set(element, new Map());
        attributeRecords.get(element).set(name, { original: current, applied: next, scoped: scopedTranslation !== undefined });
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
    updateLanguageChoice();
    status.hidden = true;
    settingsLabel.textContent = language === 'zh-CN' ? '界面语言' : 'Interface Language';
    mountSettingsEntry();
    observe();
  }
  function mountSettingsEntry() {
    const headers = document.querySelectorAll('.max-w-2xl.mx-auto > :first-child');
    for (const header of headers) {
      const title = header.querySelector('h2');
      const description = title?.nextElementSibling;
      // 同名的项目设置或聊天标题不能作为入口挂载点。
      if (!description || protectedElement(title) || originalText(title) !== 'General' ||
        originalText(description) !== 'Configure agent execution, queued message delivery, and permissions.') continue;
      if (header.nextElementSibling !== settingsEntry) header.after(settingsEntry);
      return;
    }
    closeLanguageChoices();
    settingsEntry.remove();
  }
  function createLanguageSetting() {
    const prefixStyle = document.createElement('style');
    prefixStyle.textContent = '[data-antigravity-zh-prefix]>*{display:none!important}[data-antigravity-zh-prefix]::after{content:attr(data-antigravity-zh-prefix)}';
    document.head.append(prefixStyle);
    settingsEntry = document.createElement('div');
    settingsEntry.id = 'antigravity-language-setting';
    settingsEntry.setAttribute('data-no-translate', '');
    const settingsShadow = settingsEntry.attachShadow({ mode: 'open' });
    const settingsStyle = document.createElement('style');
    settingsStyle.textContent = `
      :host{display:block}
      .row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem 1rem;padding:.625rem .75rem;border:1px solid var(--color-border,#80808055);border-radius:.75rem}
      button{appearance:none;cursor:pointer;font:inherit}
      .trigger{display:flex;align-items:center;justify-content:space-between;gap:.5rem;min-width:min(120px,100%);max-width:100%;padding:.25rem .625rem;border:0;border-radius:999px;background:var(--color-secondary,#80808024);color:var(--color-secondary-foreground,inherit)}
      .trigger:hover{color:var(--color-foreground,inherit)}
      .trigger:focus-visible{outline:2px solid var(--color-ring,#3b82f6);outline-offset:2px}
      .arrow{width:.75rem;height:.75rem;opacity:.7;flex-shrink:0}
      .panel{box-sizing:border-box;position:fixed;inset:auto;margin:0;z-index:6000;padding:.25rem;border:1px solid var(--glass-border,var(--color-border,#80808040));border-radius:.75rem;background:var(--glass,var(--color-card,#fff));color:var(--color-foreground,#18181b);backdrop-filter:blur(20px) saturate(1.6);box-shadow:var(--glass-shadow,0 4px 10px #0002);overflow:auto;overscroll-behavior:contain}
      :host-context(.dark) .panel{background:var(--glass,var(--color-card,#24262b));color:var(--color-foreground,#eee)}
      .option{width:100%;display:flex;align-items:center;justify-content:space-between;gap:.5rem;text-align:left;padding:.375rem .5rem;border:0;border-radius:.375rem;background:transparent;color:inherit}
      .option[data-active],.option:hover{background:var(--color-secondary,#80808024)}
      .check{width:1rem;height:1rem;flex-shrink:0;visibility:hidden}
      .option[aria-selected="true"] .check{visibility:visible}
      .status{flex-basis:100%;font-size:.875em}
    `;
    const row = document.createElement('div'); row.className = 'row';
    settingsLabel = document.createElement('label');
    settingsLabel.id = 'interface-language-label'; settingsLabel.htmlFor = 'interface-language';
    selector = document.createElement('button'); selector.id = 'interface-language'; selector.type = 'button'; selector.className = 'trigger';
    selector.setAttribute('role', 'combobox'); selector.setAttribute('aria-haspopup', 'listbox');
    selector.setAttribute('aria-labelledby', settingsLabel.id); selector.setAttribute('aria-expanded', 'false');
    const caption = document.createElement('span');
    function icon(className, path) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg'); const line = document.createElementNS(ns, 'path');
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', className); svg.setAttribute('aria-hidden', 'true');
      line.setAttribute('d', path); line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round');
      svg.append(line); return svg;
    }
    selector.append(caption, icon('arrow', 'M4 6l4 4 4-4'));
    const panel = document.createElement('div'); panel.id = 'interface-language-options'; panel.className = 'panel'; panel.hidden = true;
    panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-labelledby', settingsLabel.id);
    selector.setAttribute('aria-controls', panel.id);
    const topLayer = typeof panel.showPopover === 'function';
    if (topLayer) panel.setAttribute('popover', 'manual');
    const choices = [['zh-CN', '简体中文'], ['en', 'English']].map(([value, text]) => {
      const option = document.createElement('button'); option.id = 'interface-language-' + value;
      option.type = 'button'; option.className = 'option'; option.tabIndex = -1; option.setAttribute('role', 'option');
      option.append(text, icon('check', 'M2.5 8l3.5 3.5 7-7'));
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => chooseLanguage(value));
      panel.append(option); return { value, text, option };
    });
    let activeChoice = 0;
    let open = false;
    function highlight(index) {
      activeChoice = index;
      for (const [i, { option }] of choices.entries()) option.toggleAttribute('data-active', i === index);
      selector.setAttribute('aria-activedescendant', choices[index].option.id);
    }
    updateLanguageChoice = () => {
      caption.textContent = choices.find(choice => choice.value === language).text;
      for (const { value, option } of choices) option.setAttribute('aria-selected', String(value === language));
    };
    closeLanguageChoices = () => {
      if (!open) return;
      open = false;
      if (topLayer && panel.matches(':popover-open')) panel.hidePopover();
      panel.hidden = true;
      selector.setAttribute('aria-expanded', 'false');
      selector.removeAttribute('aria-activedescendant');
    };
    function openLanguageChoices(index = choices.findIndex(choice => choice.value === language)) {
      if (open || pendingLanguage) return;
      panel.hidden = false;
      if (topLayer) panel.showPopover();
      const rect = selector.getBoundingClientRect(), gutter = 8, gap = 4;
      const width = Math.max(0, Math.min(Math.max(144, rect.width), innerWidth - gutter * 2));
      panel.style.width = width + 'px';
      panel.style.left = Math.max(gutter, Math.min(rect.right - width, innerWidth - gutter - width)) + 'px';
      panel.style.maxHeight = '';
      const height = panel.offsetHeight, below = innerHeight - rect.bottom - gap - gutter, above = rect.top - gap - gutter;
      const flip = below < height && above > below;
      const available = Math.max(0, flip ? above : below);
      panel.style.maxHeight = available + 'px';
      panel.style.top = (flip ? rect.top - gap - Math.min(height, available) : rect.bottom + gap) + 'px';
      open = true;
      selector.setAttribute('aria-expanded', 'true');
      highlight(index);
    }
    selector.addEventListener('click', () => open ? closeLanguageChoices() : openLanguageChoices());
    selector.addEventListener('keydown', event => {
      const key = event.key;
      if (key === 'Tab') { closeLanguageChoices(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key) && !(open && ['Escape', 'Enter', ' '].includes(key))) return;
      event.preventDefault(); event.stopPropagation();
      if (key === 'Escape') closeLanguageChoices();
      else if (key === 'Enter' || key === ' ') chooseLanguage(choices[activeChoice].value);
      else if (!open) openLanguageChoices(key === 'Home' ? 0 : key === 'End' ? choices.length - 1 : undefined);
      else highlight(key === 'Home' ? 0 : key === 'End' ? choices.length - 1 :
        Math.max(0, Math.min(choices.length - 1, activeChoice + (key === 'ArrowDown' ? 1 : -1))));
    });
    for (const type of ['pointerdown', 'focusin']) document.addEventListener(type, event => {
      if (!event.composedPath().includes(settingsEntry)) closeLanguageChoices();
    }, true);
    window.addEventListener('resize', closeLanguageChoices);
    window.addEventListener('scroll', event => {
      if (!event.composedPath().includes(panel)) closeLanguageChoices();
    }, true);
    status = document.createElement('span'); status.className = 'status'; status.setAttribute('role', 'status'); status.hidden = true;
    let pendingLanguage;
    async function chooseLanguage(requested) {
      closeLanguageChoices();
      if (pendingLanguage || requested === language) return;
      const eventAtRequest = latestEvent;
      pendingLanguage = requested;
      selector.setAttribute('aria-busy', 'true');
      status.hidden = true;
      try {
        const saved = await bridge.setLanguage(requested);
        if (latestEvent === eventAtRequest) applyLanguage(saved);
      }
      catch {
        status.textContent = language === 'zh-CN' ? '保存语言失败，请重试。' : 'Could not save the language. Try again.';
        status.hidden = false;
      }
      finally {
        pendingLanguage = undefined;
        selector.removeAttribute('aria-busy');
      }
    }
    row.append(settingsLabel, selector, panel, status); settingsShadow.append(settingsStyle, row);
    document.addEventListener('keydown', event => {
      if (event.isComposing || !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey || event.code !== 'KeyL') return;
      if (selector.getClientRects().length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      selector.focus();
    }, true);
  }
  function start() {
    createLanguageSetting();
    observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') { if (record.target.parentElement) animatedPrefixes(record.target.parentElement); text(record.target); if (record.target.parentElement) compoundDescriptions(record.target.parentElement.closest('.text-xs.text-muted-foreground.truncate,.text-xs.text-muted-foreground.line-clamp-2') || record.target.parentElement); }
        else if (record.type === 'attributes') attribute(record.target);
        else for (const node of record.addedNodes) roots.add(node);
      }
      for (const root of roots) scan(root);
      for (const record of records) if (record.type === 'childList' && record.target.nodeType === 1) animatedPrefixes(record.target);
      const settingsSelector = '.max-w-2xl.mx-auto';
      if ([...roots].some(node => node.nodeType === 1 && (node.matches(settingsSelector) || node.querySelector(settingsSelector))) ||
        records.some(record => record.type !== 'attributes' && (record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest(settingsSelector))) mountSettingsEntry();
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
