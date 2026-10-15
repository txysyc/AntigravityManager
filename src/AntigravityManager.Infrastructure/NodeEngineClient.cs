using System.Diagnostics;
using System.Text.Json;
using System.Text;
using AntigravityManager.Core;

namespace AntigravityManager.Infrastructure;

public sealed class NodeEngineClient(ManagerEnvironment environment)
{
    public string PatchVersion
    {
        get
        {
            using var package = JsonDocument.Parse(File.ReadAllText(Path.Combine(Path.GetDirectoryName(environment.EnginePath)!, "package.json")));
            return package.RootElement.GetProperty("version").GetString() ?? throw new InvalidDataException("补丁缺少版本号。");
        }
    }
    public async Task<EngineResult> ExecuteAsync(string operation, string applicationDirectory, CancellationToken cancellationToken = default)
    {
        using var lease = environment.AcquireDataAccess();
        var bundledNode = Path.Combine(environment.WorkspaceRoot, "runtime", "node.exe");
        var info = new ProcessStartInfo(File.Exists(bundledNode) ? bundledNode : "node")
        {
            WorkingDirectory = environment.WorkspaceRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        foreach (var argument in new[] { environment.EnginePath, operation, "--app-dir", applicationDirectory, "--data-dir", environment.DataDirectory })
            info.ArgumentList.Add(argument);
        using var process = new Process { StartInfo = info };
        try
        {
            process.Start();
            var effectiveToken = operation is "install" or "restore" ? CancellationToken.None : cancellationToken;
            var stdout = process.StandardOutput.ReadToEndAsync(effectiveToken);
            var stderr = process.StandardError.ReadToEndAsync(effectiveToken);
            // Once a write operation starts, allow it to finish its atomic transaction.
            // Read-only tasks can be cancelled with the window.
            try { await process.WaitForExitAsync(operation is "install" or "restore" ? CancellationToken.None : cancellationToken); }
            catch (OperationCanceledException) { if (!process.HasExited) process.Kill(entireProcessTree: true); throw; }
            var output = await stdout;
            var error = await stderr;
            if (string.IsNullOrWhiteSpace(output)) return new() { Message = string.IsNullOrWhiteSpace(error) ? "引擎未返回结果。" : error.Trim() };
            var result = JsonSerializer.Deserialize<EngineResult>(output, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (result is null) return new() { Message = "无法读取引擎结果。" };
            if (process.ExitCode != 0) result.Success = false;
            return result;
        }
        catch (System.ComponentModel.Win32Exception) { return new() { Message = "找不到 Node.js。请安装 Node.js，或在 runtime 目录提供 node.exe。" }; }
        catch (JsonException) { return new() { Message = "引擎返回格式异常，请查看开发日志。" }; }
    }
}
