/* Runs inline in Electron's existing isolated preload; no new Node privileges. */
function installChineseUI(dictionary, bridge) {
  'use strict';
  if (window.__antigravityChineseUI) return;
  // Restrict to the application document, never webview guests or external pages.
  const host = location.hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return;
  window.__antigravityChineseUI = { version: '0.2.0' };
  let language = 'en';
  let observer;
  let selector;
  let status;
  let started = false;
  let latestEvent = 0;
  const textRecords = new Map();
  const attributeRecords = new Map();
  const protectedSelector = [
    'script', 'style', 'pre', 'code', 'textarea', 'input', '[contenteditable]',
    '[data-no-translate]', '[translate="no"]', '.notranslate', '.monaco-editor',
    '.cm-editor', '.xterm', '[class*="markdown"]', '[class*="prose"]',
    '[data-message-author-role]', '[data-testid*="message-content"]',
    '[data-testid="user-input-step"]', '[data-testid="planner-response-text"]',
    '[data-testid="pending-user-messages"]', '[data-testid="markdown-frontmatter"]',
    '[data-testid*="conversation-title"]', '[data-testid*="workspace-name"]',
    '[data-testid^="conversation-row-"] span.truncate.text-left.w-full.text-sm',
    '[data-testid="project-header"] span.truncate.text-sm',
    '[data-testid="project-selector-item"] > span.truncate'
  ].join(',');
  const attributeProtectedSelector = protectedSelector.split(',').filter(selector => !['input', 'textarea'].includes(selector.trim())).join(',');
  const controlSelector = [
    'button', '[role="button"]', '[role="menuitem"]', '[role="tab"]',
    'label', 'legend', 'option', 'h1', 'h2', 'h3', 'h4', '[data-zh-ui]',
    '.max-w-2xl.mx-auto span.text-xs.text-muted-foreground.whitespace-pre-wrap',
    '.max-w-2xl.mx-auto .flex.items-center.gap-1\\.5 > span.text-sm'
  ].join(',');
  let translated = 0;
  function translate(value) {
    const key = value.trim();
    if (!Object.prototype.hasOwnProperty.call(dictionary, key)) return value;
    return value.slice(0, value.indexOf(key)) + dictionary[key] + value.slice(value.indexOf(key) + key.length);
  }
  function protectedElement(element) { return !element || !!element.closest(protectedSelector); }
  function text(node) {
    if (language !== 'zh-CN') return;
    const element = node.parentElement;
    if (protectedElement(element)) return;
    // Only controls and explicitly marked UI are translated by default.
    if (!element.closest(controlSelector)) return;
    const previous = textRecords.get(node);
    const original = node.nodeValue;
    if (previous && original === previous.applied) return;
    const next = translate(original);
    if (next !== original) { node.nodeValue = next; textRecords.set(node, { original, applied: next }); translated++; }
    else textRecords.delete(node);
  }
  const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
  function attribute(element) {
    if (language !== 'zh-CN') return;
    if (!element || element.closest(attributeProtectedSelector)) return;
    for (const name of attributes) {
      const current = element.getAttribute(name);
      const previous = attributeRecords.get(element)?.get(name);
      if (previous && current === previous.applied) continue;
      if (current === null) { attributeRecords.get(element)?.delete(name); continue; }
      const next = translate(current);
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
    if (root.nodeType === 1) attribute(root);
    for (const element of root.querySelectorAll('*')) attribute(element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
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
    document.documentElement.lang = language;
    if (language === 'zh-CN') scan(document.body);
    selector.value = language;
    status.textContent = language === 'zh-CN' ? '网页立即生效；原生菜单下次启动生效' : 'Page applies now; native menus apply after restart';
    observe();
  }
  function addSwitcher() {
    const host = document.createElement('div');
    host.id = 'antigravity-language-switcher';
    host.setAttribute('data-no-translate', '');
    host.setAttribute('translate', 'no');
    Object.assign(host.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' });
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{font:12px system-ui;color:#eee}details{background:#24262b;border:1px solid #62666f;border-radius:8px;padding:8px;box-shadow:0 2px 10px #0005}summary{cursor:pointer;user-select:none}label{display:flex;align-items:center;gap:8px;padding-top:10px}select{font:inherit;padding:4px;border-radius:4px;background:#17191d;color:#eee;border:1px solid #62666f}p{max-width:240px;margin:8px 0 0;line-height:1.5}';
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Language / 语言';
    const label = document.createElement('label'); label.textContent = 'Language / 语言';
    selector = document.createElement('select'); selector.setAttribute('aria-label', 'Language / 语言');
    for (const [value, caption] of [['zh-CN', '简体中文'], ['en', 'English']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = caption; selector.append(option);
    }
    selector.addEventListener('change', async () => {
      const requested = selector.value;
      const eventAtRequest = latestEvent;
      selector.disabled = true;
      try {
        const saved = await bridge.setLanguage(requested);
        if (latestEvent === eventAtRequest) applyLanguage(saved);
      }
      catch { selector.value = language; status.textContent = '保存失败，请重试 / Could not save. Please retry.'; }
      finally { selector.disabled = false; }
    });
    status = document.createElement('p'); status.setAttribute('role', 'status');
    label.append(selector); details.append(summary, label, status); shadow.append(style, details); document.body.append(host);
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.altKey && event.code === 'KeyL') { event.preventDefault(); details.open = true; selector.focus(); }
    });
  }
  function start() {
    addSwitcher();
    observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') text(record.target);
        else if (record.type === 'attributes') attribute(record.target);
        else for (const node of record.addedNodes) roots.add(node);
      }
      for (const root of roots) scan(root);
      if (records.some(record => record.removedNodes?.length)) {
        for (const node of textRecords.keys()) if (!node.isConnected) textRecords.delete(node);
        for (const element of attributeRecords.keys()) if (!element.isConnected) attributeRecords.delete(element);
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
