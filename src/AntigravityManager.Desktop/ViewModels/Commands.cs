using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;

namespace AntigravityManager.Desktop.ViewModels;

public abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;
    protected void Notify([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
    protected void NotifyAll() => Notify("");
}

public sealed class RelayCommand(Action execute, Func<bool>? canExecute = null) : ICommand
{
    public event EventHandler? CanExecuteChanged;
    public bool CanExecute(object? parameter) => canExecute?.Invoke() ?? true;
    public void Execute(object? parameter) => execute();
    public void Refresh() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}

public sealed class AsyncCommand(Func<Task> execute, Func<bool> canExecute) : ICommand
{
    public event EventHandler? CanExecuteChanged;
    private bool executing;
    public bool CanExecute(object? parameter) => !executing && canExecute();
    public async void Execute(object? parameter)
    {
        if (!CanExecute(parameter)) return;
        executing = true; Refresh();
        try { await execute(); } finally { executing = false; Refresh(); }
    }
    public void Refresh() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
