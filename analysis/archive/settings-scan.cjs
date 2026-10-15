const fs = require('fs');
const parser = require('C:/Users/txyc_/AppData/Local/npm-cache/_npx/9b9809298fe40d2c/node_modules/@babel/parser/lib/index.js');
const source=fs.readFileSync('analysis/embedded/142809195-main.js','utf8');
const dictionary=JSON.parse(fs.readFileSync('translations/zh-CN.json','utf8'));
const ast=parser.parse(source,{sourceType:'unambiguous'});
const literals=[],templates=[];
function walk(n,parent){
 if(!n||typeof n!=='object')return;
 const inRange = (n.start>=3480000&&n.start<=3520000)||(n.start>=5580000&&n.start<=6073500);
 if(inRange&&n.type==='StringLiteral'&&/[A-Za-z]/.test(n.value)&&!dictionary[n.value]&&n.value.length<1200&&!/^(?:flex|text-|bg-|border|p[xytrbl]?-|w-|h-|m[xytrbl]?-|absolute|relative|rounded|group|cursor|select-none|transition|pointer|shrink|min-w|max-w|appearance|opacity|truncate|sticky|grid|linear-gradient|!?placeholder|font-|space-|overflow|inline-|justify|z-|box-shadow|polygon|padding|height|width|ring-|disabled|can-hover|items-|inset-|bottom-|top-|left-|right-|grow)/.test(n.value)&&(/\s/.test(n.value)||/^[A-Z][a-z]+$/.test(n.value)))literals.push({offset:n.start,text:n.value,parentType:parent?.type,context:source.slice(Math.max(0,n.start-75),n.end+95)});
 if(inRange&&n.type==='TemplateLiteral'&&n.quasis.some(q=>/\b[A-Za-z]{3,}\b/.test(q.value.cooked)))templates.push({offset:n.start,source:source.slice(n.start,n.end),context:source.slice(Math.max(0,n.start-75),n.end+80)});
 for(const [k,v] of Object.entries(n))if(k!=='loc'&&k!=='extra') {if(Array.isArray(v))for(const a of v)walk(a,n);else if(v&&typeof v==='object'&&v.type)walk(v,n);}
}
walk(ast);
fs.writeFileSync('analysis/audits/settings-source-literals.json',JSON.stringify(literals,null,2)+'\n');
fs.writeFileSync('analysis/audits/settings-source-templates.json',JSON.stringify(templates,null,2)+'\n');
for(const l of literals)if(l.offset>=5827000)console.log(l.offset,JSON.stringify(l.text));
