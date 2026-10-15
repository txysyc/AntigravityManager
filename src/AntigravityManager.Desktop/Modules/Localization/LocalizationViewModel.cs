using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using AntigravityManager.Core;
using AntigravityManager.Infrastructure;

using AntigravityManager.Desktop.ViewModels;

namespace AntigravityManager.Desktop.Modules.Localization;

public sealed record TaskEntry(string Time, string Operation, string Result, string Message);
public sealed record ComparisonRow(string File, string Status, string Anchors);
public sealed record ModuleTab(string Id, string Title);

public sealed class LocalizationViewModel : ObservableObject
{
    private readonly ManagerEnvironment environment;
    private readonly IManagerModule module;
    private readonly Func<string> applicationDirectory;
    private readonly Func<bool> hostBusy;
    private readonly Action<string> publishStatus;
    private ApplicationSnapshot? snapshot;
    private string reportSummary = "检查版本变化后，在这里查看差异。";
    private bool isBusy;
    private ModuleTab selectedTab;
    public ObservableCollection<ModuleTab> Tabs { get; } = [new("status", "汉化概况"), new("compatibility", "版本检查"), new("backups", "备份与恢复"), new("history", "操作记录")];
    public ObservableCollection<ComparisonRow> Comparisons { get; } = [];
    public ObservableCollection<BackupEntry> Backups { get; } = [];
    public ObservableCollection<TaskEntry> History { get; } = [];
    public AsyncCommand InspectCommand { get; }
    public AsyncCommand CompareCommand { get; }
    public AsyncCommand InstallCommand { get; }
    public AsyncCommand RestoreCommand { get; }
    public AsyncCommand RefreshBackupsCommand { get; }
    public event Action? StateChanged;

    public LocalizationViewModel(ManagerEnvironment environment, IManagerModule module, Func<string> applicationDirectory, Func<bool> hostBusy, Action<string> publishStatus)
    {
        this.environment = environment; this.module = module; this.applicationDirectory = applicationDirectory; this.hostBusy = hostBusy; this.publishStatus = publishStatus;
        selectedTab = Tabs[0];
        InspectCommand = new(() => RunAsync("inspect"), () => !Busy);
        CompareCommand = new(() => RunAsync("compare"), () => !Busy);
        InstallCommand = new(() => RunAsync("install"), () => !Busy && snapshot?.CanInstall == true);
        RestoreCommand = new(() => RunAsync("restore"), () => !Busy && snapshot?.CanRestore == true);
        RefreshBackupsCommand = new(() => RunAsync("backups"), () => !Busy);
        try
        {
            var file = HistoryPath;
            if (!File.Exists(file)) file = Path.Combine(environment.DataDirectory, "tasks.json"); // Read records from preview 0.1.0.
            if (File.Exists(file)) foreach (var entry in JsonSerializer.Deserialize<List<TaskEntry>>(File.ReadAllText(file)) ?? []) History.Add(entry);
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException) { publishStatus("汉化操作记录无法读取，可以继续检查应用。"); }
    }
    public bool IsBusy => isBusy;
    private string HistoryPath => Path.Combine(environment.DataDirectory, "localization", "tasks.json");
    private bool Busy => isBusy || hostBusy();
    public ModuleTab SelectedTab { get => selectedTab; set { if (value is not null) { selectedTab = value; NotifyAll(); } } }
    public string AvailablePatch => "v" + module.Descriptor.Version;
    public bool HasSnapshot => snapshot is not null;
    public string InstalledPatch => snapshot is null ? "待检查" : string.IsNullOrEmpty(snapshot.PatchVersion) ? "未安装" : "v" + snapshot.PatchVersion;
    public string VersionLabel => snapshot?.Version ?? "待检查";
    public string SupportedVersion => string.IsNullOrWhiteSpace(snapshot?.BaselineVersion) ? "2.23.0" : snapshot.BaselineVersion;
    public string BackupCount => Backups.Count.ToString();
    public string StatusLabel => snapshot?.Status switch { "patched" => "已汉化", "unpatched" => "可以安装", "unsupported" => "等待适配", _ => "尚未检查" };
    public string StatusDetail => snapshot?.Status switch
    {
        "unsupported" => $"Antigravity {snapshot.Version} 尚未通过兼容性验证，安装暂不可用。可以在“版本检查”中查看变化。",
        "patched" => "已识别安装的汉化补丁。应用更新后请重新检查兼容性。",
        "unpatched" => "已匹配受支持的原始文件，可以安装简体中文补丁。",
        _ => "先检查应用状态，确认当前版本与补丁的兼容性。"
    };
    public string Fingerprint => snapshot?.Fingerprint ?? "检查后显示 SHA-256";
    public string ReportSummary => reportSummary;
    public Visibility StatusVisibility => Visible("status");
    public Visibility CompatibilityVisibility => Visible("compatibility");
    public Visibility BackupsVisibility => Visible("backups");
    public Visibility HistoryVisibility => Visible("history");
    public Visibility EmptyBackupsVisibility => Backups.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    private Visibility Visible(string id) => SelectedTab.Id == id ? Visibility.Visible : Visibility.Collapsed;
    public void InvalidateApplication() { snapshot = null; Comparisons.Clear(); reportSummary = "安装目录已改变，请重新检查。"; Changed(); }
    public void RefreshCommands() { foreach (var command in new[] { InspectCommand, CompareCommand, InstallCommand, RestoreCommand, RefreshBackupsCommand }) command.Refresh(); }
    private void Changed() { NotifyAll(); RefreshCommands(); StateChanged?.Invoke(); }
    public async Task RunAsync(string operation)
    {
        if (Busy) return;
        if (operation is "install" or "restore")
        {
            var action = operation == "install" ? "安装汉化" : "恢复原版";
            if (MessageBox.Show($"将对以下安装执行{action}：\n{applicationDirectory()}\n\n请先完全退出 Antigravity。", action, MessageBoxButton.OKCancel, MessageBoxImage.Information) != MessageBoxResult.OK) return;
        }
        var operationName = operation switch { "inspect" => "检查状态", "compare" => "检查版本变化", "install" => "安装汉化", "restore" => "恢复原版", "backups" => "检查备份", _ => operation };
        isBusy = true; publishStatus($"正在{operationName}…"); Changed();
        try
        {
            var result = await module.ExecuteAsync(operation, applicationDirectory());
            if (result.Snapshot is not null) snapshot = result.Snapshot;
            if (result.Report is not null)
            {
                reportSummary = result.Report.Summary + "\n" + string.Join("\n", result.Report.Limitations);
                Comparisons.Clear();
                foreach (var row in result.Report.Modules) Comparisons.Add(new(row.File, row.Status switch { "same" => "未变化", "changed" => "已变化", "missing" => "不存在", _ => row.Status }, row.ExpectedAnchors == 0 ? "—" : $"{row.MatchedAnchors} / {row.ExpectedAnchors}"));
            }
            if (operation is "backups" or "install" or "restore")
            {
                var backupResult = operation == "backups" ? result : await module.ExecuteAsync("backups", applicationDirectory());
                Backups.Clear(); foreach (var backup in backupResult.Backups) Backups.Add(backup);
            }
            publishStatus(result.Message);
            if (!result.Success && operation != "backups") { snapshot = null; Comparisons.Clear(); }
            AddHistory(operationName, result.Success, result.Message);
        }
        catch (Exception error) { publishStatus(error.Message); snapshot = null; AddHistory(operationName, false, error.Message); }
        finally { isBusy = false; Changed(); }
    }
    private void AddHistory(string operation, bool success, string message)
    {
        History.Insert(0, new(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss"), operation, success ? "完成" : "失败", message));
        while (History.Count > 200) History.RemoveAt(History.Count - 1);
        try
        {
            using var lease = environment.AcquireDataAccess();
            var file = HistoryPath;
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            File.WriteAllText(file + ".new", JsonSerializer.Serialize(History, new JsonSerializerOptions { WriteIndented = true }));
            File.Move(file + ".new", file, overwrite: true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { publishStatus(message + "（操作记录未能保存）"); }
    }
}
