using AntigravityManager.Core;
using AntigravityManager.Infrastructure;

namespace AntigravityManager.Modules.Localization;

public sealed class LocalizationModule(NodeEngineClient engine) : IManagerModule
{
    public ModuleDescriptor Descriptor { get; } = new("localization", "简体中文", "检查兼容性、安装汉化、管理备份与恢复原版", engine.PatchVersion);
    public Task<EngineResult> ExecuteAsync(string operation, string applicationDirectory, CancellationToken cancellationToken = default)
    {
        if (operation is not ("inspect" or "compare" or "install" or "restore" or "backups"))
            throw new ArgumentOutOfRangeException(nameof(operation));
        return engine.ExecuteAsync(operation, applicationDirectory, cancellationToken);
    }
}
