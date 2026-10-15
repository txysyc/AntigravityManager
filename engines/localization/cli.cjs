'use strict';
const { defaultApplicationDirectory, defaultDataDirectory } = require('./src/paths.cjs');
function main(args) {
  const operation = args[0] || 'inspect', options = {};
  for (let i = 1; i < args.length; i += 2) {
    if (!['--app-dir', '--data-dir'].includes(args[i]) || !args[i + 1]) throw Error('参数格式：<inspect|compare|install|restore|backups> --app-dir <目录> --data-dir <目录>');
    options[args[i]] = args[i + 1];
  }
  const app = options['--app-dir'] || defaultApplicationDirectory(), data = options['--data-dir'] || defaultDataDirectory();
  const manager = require('./src/manager.cjs');
  if (operation === 'inspect') return { success: true, message: '检查完成。', snapshot: manager.inspect(app, data) };
  if (operation === 'compare') return { success: true, message: '差异检查完成。', ...manager.compare(app, data) };
  if (operation === 'backups') return { success: true, message: '备份检查完成。', backups: manager.backups(data) };
  if (operation === 'install' || operation === 'restore') return { success: true, message: operation === 'install' ? '汉化安装完成，请重新打开应用。' : '原版恢复完成，请重新打开应用。', snapshot: manager.mutate(operation, app, data) };
  throw Error('不支持的操作。');
}
function errorResult(error) {
  const guidance = {
    EEXIST: '已有操作或未清理的临时文件，请检查任务状态后重试。',
    ENOENT: '找不到所需文件或目录，请检查安装位置与管理器数据位置。',
    EACCES: '访问文件或目录失败，请检查权限与文件占用。',
    EPERM: '当前操作未获允许，请检查权限与文件占用。',
    EBUSY: '文件或目录正在使用，请关闭相关程序后重试。',
    ENOSPC: '磁盘空间不足，请清理空间后重试。'
  }[error.code];
  const original = error.message || String(error);
  return { success: false, message: guidance
    ? guidance + '\n原始信息：' + original
    : /[\u3400-\u9fff]/.test(original) ? original : '操作失败，请查看原始信息：' + original };
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify(errorResult(error)) + '\n'); process.exitCode = 1; }
}
module.exports = { main, errorResult };
