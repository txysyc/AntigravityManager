using System.Text.Json;
using System.Security.Cryptography;

namespace AntigravityManager.Infrastructure;

public sealed class ManagerEnvironment
{
    public string WorkspaceRoot { get; }
    public string DataDirectory { get; private set; }
    public string BootstrapDirectory { get; }
    public string LocationPath => Path.Combine(BootstrapDirectory, "location.json");
    public string EnginePath => Path.Combine(WorkspaceRoot, "engines", "localization", "cli.cjs");
    public string SettingsPath => Path.Combine(DataDirectory, "settings.json");

    public ManagerEnvironment(string? workspaceRoot = null, string? dataDirectory = null, string? bootstrapDirectory = null)
    {
        WorkspaceRoot = workspaceRoot ?? FindWorkspaceRoot(AppContext.BaseDirectory);
        BootstrapDirectory = Path.GetFullPath(bootstrapDirectory ?? (dataDirectory is null ? DefaultDataDirectory : dataDirectory + ".bootstrap"));
        DataDirectory = Path.GetFullPath(dataDirectory ?? ReadLocation() ?? DefaultDataDirectory);
    }

    public static string DefaultDataDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AntigravityManager");

    private string? ReadLocation()
    {
        if (!File.Exists(LocationPath)) return null;
        var location = JsonSerializer.Deserialize<DataLocation>(File.ReadAllText(LocationPath));
        if (location is null || string.IsNullOrWhiteSpace(location.DataDirectory) || !Path.IsPathFullyQualified(location.DataDirectory) || !Directory.Exists(location.DataDirectory))
            throw new IOException("已配置的数据目录不可用，请恢复目录或检查 location.json。");
        return location.DataDirectory;
    }

    public FileStream AcquireDataAccess()
    {
        Directory.CreateDirectory(BootstrapDirectory);
        var lease = new FileStream(Path.Combine(BootstrapDirectory, ".manager.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        try
        {
            if (ReadLocation() is { } selected && !SamePath(selected, DataDirectory))
                throw new IOException("数据目录已被其他管理器切换，请重新打开管理器。");
            return lease;
        }
        catch { lease.Dispose(); throw; }
    }

    public void MigrateDataDirectory(string destination)
    {
        if (!Path.IsPathFullyQualified(destination)) throw new IOException("请选择完整的数据目录路径。");
        var target = Path.TrimEndingDirectorySeparator(Path.GetFullPath(destination));
        var source = Path.TrimEndingDirectorySeparator(DataDirectory);
        if (SamePath(source, target)) return;
        if (IsWithin(source, target) || IsWithin(target, source)) throw new IOException("新旧数据目录不能相互包含。");
        if (Path.GetPathRoot(target) == target) throw new IOException("请使用专用子目录保存管理器数据。");
        using var lease = AcquireDataAccess();
        CheckParents(target); CheckParents(source);
        if (Directory.Exists(target) && Directory.EnumerateFileSystemEntries(target).Any()) throw new IOException("目标目录非空，请选择新的或空的数据目录，避免覆盖现有文件。");
        Directory.CreateDirectory(source);
        // The engine uses the same exclusive lock for install/restore operations.
        using var engineLock = new FileStream(Path.Combine(source, "localization.lock"), FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose);
        var parent = Path.GetDirectoryName(target)!;
        Directory.CreateDirectory(parent);
        var staging = Path.Combine(parent, ".manager-migration-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        // On failure retain the original data and any staged copy for recovery.
        CopyVerified(source, staging, source);
        if (Directory.Exists(target)) Directory.Delete(target, recursive: false);
        Directory.Move(staging, target);
        var temporary = LocationPath + ".new";
        File.WriteAllText(temporary, JsonSerializer.Serialize(new DataLocation(target), new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, LocationPath, overwrite: true);
        DataDirectory = target;
    }

    private void CopyVerified(string source, string target, string root)
    {
        foreach (var entry in Directory.EnumerateFileSystemEntries(source))
        {
            if (SamePath(entry, Path.Combine(root, "localization.lock")) || SamePath(entry, LocationPath) || SamePath(entry, Path.Combine(BootstrapDirectory, ".manager.lock"))) continue;
            if ((File.GetAttributes(entry) & FileAttributes.ReparsePoint) != 0) throw new IOException("数据目录包含链接或重解析点，无法安全迁移：" + entry);
            var output = Path.Combine(target, Path.GetFileName(entry));
            if (Directory.Exists(entry)) { Directory.CreateDirectory(output); CopyVerified(entry, output, root); }
            else
            {
                using var input = new FileStream(entry, FileMode.Open, FileAccess.Read, FileShare.Read);
                using (var copy = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None)) input.CopyTo(copy);
                input.Position = 0;
                using var verified = File.OpenRead(output);
                if (!SHA256.HashData(input).AsSpan().SequenceEqual(SHA256.HashData(verified))) throw new IOException("迁移副本校验失败：" + entry);
            }
        }
    }

    private static void CheckParents(string path)
    {
        for (var directory = new DirectoryInfo(path); directory is not null; directory = directory.Parent)
            if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("数据目录不能经过链接或重解析点：" + directory.FullName);
    }
    private static bool SamePath(string left, string right) => string.Equals(Path.TrimEndingDirectorySeparator(Path.GetFullPath(left)), Path.TrimEndingDirectorySeparator(Path.GetFullPath(right)), StringComparison.OrdinalIgnoreCase);
    private static bool IsWithin(string parent, string child) => child.StartsWith(parent + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private sealed record DataLocation(string DataDirectory);

    public static string FindWorkspaceRoot(string startDirectory)
    {
        var explicitRoot = Environment.GetEnvironmentVariable("ANTIGRAVITY_MANAGER_HOME");
        if (!string.IsNullOrWhiteSpace(explicitRoot) && File.Exists(Path.Combine(explicitRoot, "engines", "localization", "cli.cjs")))
            return Path.GetFullPath(explicitRoot);
        for (var directory = new DirectoryInfo(startDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "engines", "localization", "cli.cjs"))) return directory.FullName;
        throw new DirectoryNotFoundException("找不到汉化引擎，请使用完整的管理器目录。");
    }

    public ManagerSettings LoadSettings()
    {
        try { return JsonSerializer.Deserialize<ManagerSettings>(File.ReadAllText(SettingsPath)) ?? new(); }
        catch (Exception error) when (error is IOException or JsonException) { return new(); }
    }

    public void SaveSettings(ManagerSettings settings)
    {
        using var lease = AcquireDataAccess();
        Directory.CreateDirectory(DataDirectory);
        var temporary = SettingsPath + ".new";
        File.WriteAllText(temporary, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, SettingsPath, overwrite: true);
    }

    public static string DefaultApplicationDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "antigravity");
}

public sealed class ManagerSettings
{
    public string ApplicationDirectory { get; set; } = ManagerEnvironment.DefaultApplicationDirectory;
    public string Theme { get; set; } = "Light";
}
