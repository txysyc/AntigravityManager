using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Media;
using AntigravityManager.Core;
using AntigravityManager.Desktop.Modules.Localization;
using AntigravityManager.Infrastructure;
using Microsoft.Win32;

namespace AntigravityManager.Desktop.ViewModels;

public sealed record NavigationItem(string Id, string Title, string Glyph, string Group);

public sealed class MainViewModel : ObservableObject
{
    private readonly ManagerEnvironment environment;
    private readonly ManagerSettings settings;
    private NavigationItem selectedNavigation;
    private string applicationDirectory;
    private string pendingDataDirectory;
    private string statusMessage = "准备就绪";
    private bool settingsBusy;
    public LocalizationViewModel Localization { get; }
    public ObservableCollection<NavigationItem> Navigation { get; } = [new("overview", "概览", "\uE80F", "工作台"), new("localization", "界面汉化", "\uE8C1", "功能模块"), new("settings", "设置", "\uE713", "管理")];
    public ObservableCollection<ModuleDescriptor> Modules { get; } = [];
    public RelayCommand BrowseCommand { get; }
    public RelayCommand BrowseDataCommand { get; }
    public RelayCommand SaveSettingsCommand { get; }
    public RelayCommand OpenLocalizationCommand { get; }
    public AsyncCommand MigrateDataCommand { get; }
    public MainViewModel(ManagerEnvironment environment, ModuleRegistry registry)
    {
        this.environment = environment;
        settings = environment.LoadSettings();
        applicationDirectory = settings.ApplicationDirectory; pendingDataDirectory = environment.DataDirectory;
        selectedNavigation = Navigation[0];
        foreach (var module in registry.Modules) Modules.Add(module.Descriptor);
        Localization = new(environment, registry.Get("localization"), () => ApplicationDirectory, () => settingsBusy, SetStatus);
        Localization.StateChanged += () => { NotifyAll(); RefreshCommands(); };
        BrowseCommand = new(() => Browse(false), () => !IsBusy);
        BrowseDataCommand = new(() => Browse(true), () => !IsBusy);
        SaveSettingsCommand = new(SaveSettings, () => !IsBusy);
        OpenLocalizationCommand = new(() => SelectedNavigation = Navigation[1]);
        MigrateDataCommand = new(MigrateAsync, () => !IsBusy && !string.IsNullOrWhiteSpace(PendingDataDirectory) && !string.Equals(PendingDataDirectory.TrimEnd('\\', '/'), DataDirectory.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase));
    }
    public async Task InitializeAsync() { ApplyTheme(); await Localization.RunAsync("inspect"); await Localization.RunAsync("backups"); }
    public NavigationItem SelectedNavigation { get => selectedNavigation; set { if (value is not null) { selectedNavigation = value; NotifyAll(); } } }
    public string ApplicationDirectory { get => applicationDirectory; set { if (value == applicationDirectory) return; applicationDirectory = value; Localization.InvalidateApplication(); NotifyAll(); } }
    public string PendingDataDirectory { get => pendingDataDirectory; set { pendingDataDirectory = value; Notify(); MigrateDataCommand?.Refresh(); } }
    public bool IsBusy => settingsBusy || Localization.IsBusy;
    public bool CanEdit => !IsBusy;
    public string StatusMessage => statusMessage;
    public string DataDirectory => environment.DataDirectory;
    public string ModuleCount => Modules.Count.ToString();
    public string ManagerVersion => "预览版 " + typeof(MainViewModel).Assembly.GetName().Version?.ToString(3);
    public bool IsDarkTheme { get => settings.Theme == "Dark"; set { settings.Theme = value ? "Dark" : "Light"; ApplyTheme(); Notify(); } }
    public Visibility BusyVisibility => IsBusy ? Visibility.Visible : Visibility.Collapsed;
    public Visibility OverviewVisibility => Visible("overview");
    public Visibility LocalizationVisibility => Visible("localization");
    public Visibility SettingsVisibility => Visible("settings");
    private Visibility Visible(string id) => selectedNavigation.Id == id ? Visibility.Visible : Visibility.Collapsed;
    private void SetStatus(string message) { statusMessage = message; Notify(nameof(StatusMessage)); }
    private void Browse(bool data)
    {
        var dialog = new OpenFolderDialog { Title = data ? "选择新的或空的管理器数据目录" : "选择 Antigravity 安装目录" };
        if (dialog.ShowDialog() == true) { if (data) PendingDataDirectory = dialog.FolderName; else ApplicationDirectory = dialog.FolderName; }
    }
    private void SaveSettings()
    {
        try { settings.ApplicationDirectory = ApplicationDirectory; environment.SaveSettings(settings); SetStatus("设置已保存。"); }
        catch (Exception error) { SetStatus(error.Message); }
    }
    public async Task MigrateAsync()
    {
        if (IsBusy) return;
        settingsBusy = true; NotifyAll(); RefreshCommands(); Localization.RefreshCommands();
        try
        {
            settings.ApplicationDirectory = ApplicationDirectory; environment.SaveSettings(settings);
            SetStatus("正在迁移并校验数据，请稍候…");
            var destination = PendingDataDirectory;
            await Task.Run(() => environment.MigrateDataDirectory(destination));
            pendingDataDirectory = environment.DataDirectory;
            SetStatus("数据目录已切换。设置、记录和备份已校验复制，原目录保留。");
        }
        catch (Exception error) { SetStatus("未切换数据目录：" + error.Message); }
        finally { settingsBusy = false; NotifyAll(); RefreshCommands(); Localization.RefreshCommands(); }
    }
    private void RefreshCommands() { BrowseCommand.Refresh(); BrowseDataCommand.Refresh(); SaveSettingsCommand.Refresh(); MigrateDataCommand.Refresh(); }
    private void ApplyTheme()
    {
        var dark = IsDarkTheme;
        Wpf.Ui.Appearance.ApplicationThemeManager.Apply(dark ? Wpf.Ui.Appearance.ApplicationTheme.Dark : Wpf.Ui.Appearance.ApplicationTheme.Light);
        var colors = dark ? new[] { "#15181E", "#1E232C", "#EBEDF3", "#A0A9B8", "#303845", "#9EABFF" } : new[] { "#F5F6F8", "#FFFFFF", "#20252D", "#6C7482", "#E4E7EC", "#5369D8" };
        var keys = new[] { "CanvasBrush", "CardBrush", "TextBrush", "MutedBrush", "LineBrush", "AccentBrush" };
        for (var i = 0; i < keys.Length; i++) Application.Current.Resources[keys[i]] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(colors[i]));
        Application.Current.Resources["NavigationSelectedBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(dark ? "#303957" : "#ECEFFE"));
    }
}
