namespace AntigravityManager.Core;

public sealed record ModuleDescriptor(string Id, string Name, string Description, string Version);

public interface IManagerModule
{
    ModuleDescriptor Descriptor { get; }
    Task<EngineResult> ExecuteAsync(string operation, string applicationDirectory, CancellationToken cancellationToken = default);
}

public sealed class ModuleRegistry
{
    private readonly Dictionary<string, IManagerModule> modules = new(StringComparer.Ordinal);
    public IReadOnlyCollection<IManagerModule> Modules => modules.Values;
    public void Register(IManagerModule module)
    {
        if (!modules.TryAdd(module.Descriptor.Id, module))
            throw new InvalidOperationException($"模块已注册：{module.Descriptor.Id}");
    }
    public IManagerModule Get(string id) => modules.TryGetValue(id, out var module)
        ? module : throw new KeyNotFoundException($"模块不存在：{id}");
}

public sealed class EngineResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
    public ApplicationSnapshot? Snapshot { get; set; }
    public CompatibilityReport? Report { get; set; }
    public List<BackupEntry> Backups { get; set; } = [];
}

public sealed class ApplicationSnapshot
{
    public string AppDirectory { get; set; } = "";
    public string Version { get; set; } = "";
    public string Fingerprint { get; set; } = "";
    public string Status { get; set; } = "unknown";
    public string PatchVersion { get; set; } = "";
    public string BaselineVersion { get; set; } = "";
    public bool CanInstall { get; set; }
    public bool CanRestore { get; set; }
}

public sealed class CompatibilityReport
{
    public string Summary { get; set; } = "";
    public List<ModuleComparison> Modules { get; set; } = [];
    public List<string> Limitations { get; set; } = [];
}

public sealed class ModuleComparison
{
    public string File { get; set; } = "";
    public string Status { get; set; } = "";
    public int MatchedAnchors { get; set; }
    public int ExpectedAnchors { get; set; }
}

public sealed class BackupEntry
{
    public string Version { get; set; } = "";
    public string OriginalSha256 { get; set; } = "";
    public string Path { get; set; } = "";
    public bool Valid { get; set; }
}
