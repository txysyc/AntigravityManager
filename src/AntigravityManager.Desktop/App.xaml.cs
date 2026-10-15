using System.Windows;
using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using AntigravityManager.Core;
using AntigravityManager.Infrastructure;
using AntigravityManager.Modules.Localization;
using AntigravityManager.Desktop.ViewModels;

namespace AntigravityManager.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try
        {
            string? Argument(string key)
            {
                var index = Array.IndexOf(e.Args, key);
                return index >= 0 && index + 1 < e.Args.Length ? e.Args[index + 1] : null;
            }
            var environment = new ManagerEnvironment(dataDirectory: Argument("--data-dir"));
            var registry = new ModuleRegistry();
            registry.Register(new LocalizationModule(new NodeEngineClient(environment)));
            var model = new MainViewModel(environment, registry);
            if (Argument("--app-dir") is { } applicationDirectory) model.ApplicationDirectory = applicationDirectory;
            var window = new MainWindow { DataContext = model };
            MainWindow = window;
            window.Loaded += async (_, _) =>
            {
                await model.InitializeAsync();
                if (Argument("--smoke-output") is not { } output) return;
                try
                {
                    Directory.CreateDirectory(output);
                    if (!model.Localization.HasSnapshot) throw new InvalidOperationException("页面检查未能读取目标应用：" + model.StatusMessage);
                    foreach (var page in model.Navigation)
                    {
                        model.SelectedNavigation = page;
                        await CaptureAsync(window, Path.Combine(output, page.Id + ".png"));
                        if (page.Id == "localization")
                        {
                            await model.Localization.RunAsync("compare");
                            foreach (var tab in model.Localization.Tabs)
                            {
                                model.Localization.SelectedTab = tab;
                                await CaptureAsync(window, Path.Combine(output, "localization-" + tab.Id + ".png"));
                            }
                        }
                    }
                    model.IsDarkTheme = true;
                    model.SelectedNavigation = model.Navigation[0];
                    await CaptureAsync(window, Path.Combine(output, "overview-dark.png"));
                    model.SelectedNavigation = model.Navigation[1]; model.Localization.SelectedTab = model.Localization.Tabs[0];
                    await CaptureAsync(window, Path.Combine(output, "localization-dark.png"));
                    if (Argument("--smoke-migrate") is { } migrated)
                    {
                        if (Argument("--data-dir") is null) throw new InvalidOperationException("迁移验证必须指定隔离的 --data-dir。");
                        model.PendingDataDirectory = migrated;
                        await model.MigrateAsync();
                        if (!string.Equals(model.DataDirectory, Path.GetFullPath(migrated), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException(model.StatusMessage);
                        await model.Localization.RunAsync("backups");
                        model.SelectedNavigation = model.Navigation[2];
                        await CaptureAsync(window, Path.Combine(output, "settings-migrated.png"));
                    }
                    File.WriteAllText(Path.Combine(output, "result.json"), System.Text.Json.JsonSerializer.Serialize(new { success = true, version = model.Localization.VersionLabel, status = model.Localization.StatusLabel, patch = model.Localization.AvailablePatch, installed = model.Localization.InstalledPatch, pages = model.Navigation.Count, moduleTabs = model.Localization.Tabs.Count }));
                    window.Close();
                }
                catch (Exception error) { File.WriteAllText(Path.Combine(output, "error.txt"), error.ToString()); Shutdown(1); }
            };
            window.Show();
        }
        catch (Exception error)
        {
            var index = Array.IndexOf(e.Args, "--smoke-output");
            if (index >= 0 && index + 1 < e.Args.Length)
            {
                Directory.CreateDirectory(e.Args[index + 1]);
                File.WriteAllText(Path.Combine(e.Args[index + 1], "error.txt"), error.ToString());
            }
            else MessageBox.Show(error.Message, "Antigravity Manager");
            Shutdown(1);
        }
    }

    private static async Task CaptureAsync(Window window, string path)
    {
        await window.Dispatcher.InvokeAsync(window.UpdateLayout, DispatcherPriority.ApplicationIdle);
        var dpi = VisualTreeHelper.GetDpi(window);
        var bitmap = new RenderTargetBitmap((int)(window.ActualWidth * dpi.DpiScaleX), (int)(window.ActualHeight * dpi.DpiScaleY), dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        bitmap.Render(window);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var file = File.Create(path); encoder.Save(file);
    }
}
