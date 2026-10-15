using System.ComponentModel;
using System.Windows;
using AntigravityManager.Desktop.ViewModels;

namespace AntigravityManager.Desktop;

public partial class MainWindow : Wpf.Ui.Controls.FluentWindow
{
    public MainWindow() => InitializeComponent();
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (DataContext is MainViewModel { IsBusy: true })
        {
            e.Cancel = true;
            MessageBox.Show(this, "请等待当前操作完成后关闭管理器。", "任务进行中");
        }
    }
}
