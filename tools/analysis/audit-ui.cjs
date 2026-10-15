'use strict';
// Development audit of the recovered shipped bundle. Never rewrites that bundle.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf('--' + name);
  return index < 0 ? fallback : args[index + 1];
}
const parserPath = (args[0] && !args[0].startsWith('--') ? args[0] : null) || process.env.BABEL_PARSER_MODULE || '@babel/parser';
const parser = require(parserPath);
const sourcePath = path.resolve(root, option('source', 'analysis/embedded/142809195-main.js'));
const outputPath = path.resolve(root, option('output', 'artifacts/analysis/ui-audit.json'));
const source = fs.readFileSync(sourcePath, 'utf8');
const ast = parser.parse(source, { sourceType: 'unambiguous' });
const fields = new Set(['label', 'title', 'description', 'displayName', 'shortDisplayName', 'shortDescription', 'longDescription', 'placeholder', 'tooltip', 'message', 'subtitle', 'emptyMessage', 'searchPlaceholder', 'aria-label', 'plainTextFallback', 'upgradeButtonText', 'header', 'sidebarLabel']);
const entries = new Map(), templates = new Map();
function add(text, offset, kind) {
  if (!/[A-Za-z]/.test(text) || text.length < 2 || text.length > 1500 || /^https?:|^[\w.-]+:\/\//.test(text)) return;
  const value = text.trim();
  if (!entries.has(value)) entries.set(value, { text: value, occurrences: [] });
  entries.get(value).occurrences.push({ offset, kind });
}
function strings(node, kind) {
  if (!node) return;
  if (node.type === 'StringLiteral') add(node.value, node.start, kind);
  else if (node.type === 'TemplateLiteral') {
    const value = source.slice(node.start, node.end);
    if (node.expressions.length === 0) add(node.quasis[0].value.cooked, node.start, kind);
    else templates.set(node.start, { template: value, offset: node.start, kind });
  } else if (node.type === 'ConditionalExpression') { strings(node.consequent, kind); strings(node.alternate, kind); }
  else if (node.type === 'LogicalExpression') strings(node.right, kind);
  else if (node.type === 'BinaryExpression' && node.operator === '+') { strings(node.left, kind + '-fragment'); strings(node.right, kind + '-fragment'); }
}
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectProperty') {
    const key = node.key.name || node.key.value;
    if (fields.has(key)) strings(node.value, 'field:' + key);
  }
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'createElement') {
    for (const child of node.arguments.slice(2)) strings(child, 'react-child');
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast.program);
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'engines/localization/translations/zh-CN.json'), 'utf8'));
const list = [...entries.values()];
const report = {
  source: path.relative(root, sourcePath).split(path.sep).join('/'),
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  candidateCount: list.length, knownDictionaryCandidates: list.filter(e => dictionary[e.text]).length,
  dynamicTemplateCount: templates.size,
  limitations: ['AST candidates include configuration metadata and third-party text; candidate presence is not proof of visible UI.', 'Service-returned catalog and quota descriptions are absent from this static inventory.', 'Dictionary presence does not prove DOM scope or runtime translation.'],
  entries: list, templates: [...templates.values()]
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ candidateCount: report.candidateCount, knownDictionaryCandidates: report.knownDictionaryCandidates, dynamicTemplateCount: report.dynamicTemplateCount, output: outputPath }));
