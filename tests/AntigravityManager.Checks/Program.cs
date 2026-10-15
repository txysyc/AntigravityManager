using AntigravityManager.Core;
using AntigravityManager.Infrastructure;
using AntigravityManager.Modules.Localization;

var root = ManagerEnvironment.FindWorkspaceRoot(AppContext.BaseDirectory);
var temporary = Path.Combine(root, "artifacts", "checks", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temporary);
void Check(bool condition, string description)
{
    if (!condition) throw new InvalidOperationException(description);
    Console.WriteLine("PASS: " + description);
}
var renamedRoot = Path.Combine(temporary, "renamed workspace with spaces");
Directory.CreateDirectory(Path.Combine(renamedRoot, "engines", "localization"));
File.WriteAllText(Path.Combine(renamedRoot, "engines", "localization", "cli.cjs"), "");
var nested = Path.Combine(renamedRoot, "a", "b"); Directory.CreateDirectory(nested);
Check(ManagerEnvironment.FindWorkspaceRoot(nested) == renamedRoot, "workspace discovery survives renamed roots and spaces");
var environment = new ManagerEnvironment(root, Path.Combine(temporary, "manager data"));
environment.SaveSettings(new() { ApplicationDirectory = "D:\\App with spaces\\Antigravity", Theme = "Dark" });
var settings = environment.LoadSettings();
Check(settings.Theme == "Dark" && settings.ApplicationDirectory.Contains("App with spaces"), "settings round trip preserves paths and theme");
var module = new LocalizationModule(new NodeEngineClient(environment));
var registry = new ModuleRegistry(); registry.Register(module);
Check(ReferenceEquals(registry.Get("localization"), module), "module registration resolves the declared implementation");
try { registry.Register(module); throw new Exception("duplicate registration accepted"); }
catch (InvalidOperationException) { Console.WriteLine("PASS: duplicate module ids rejected"); }
var invalid = await new NodeEngineClient(environment).ExecuteAsync("invalid-operation", "D:\\unused path with spaces");
Check(!invalid.Success && invalid.Message.Contains("不支持"), "C# to Node JSON protocol returns structured failures without shell interpolation");
var diagnostic = UserFacingErrors.Describe(new IOException("sharing violation"), "保存设置");
Check(diagnostic.StartsWith("保存设置失败") && diagnostic.Contains("原始信息：sharing violation"), "用户错误提示先给中文说明，并保留原始诊断");
Check(UserFacingErrors.Describe(new System.Text.Json.JsonException("invalid JSON"), "读取配置").Contains("JSON 格式无效"), "配置解析错误给出中文处理建议");
if (args.Length > 0)
{
    var inspect = await module.ExecuteAsync("inspect", args[0]);
    Check(inspect.Success && inspect.Snapshot is not null, "C# module can read real application metadata");
    if (inspect.Snapshot!.Status == "unsupported") Check(!inspect.Snapshot.CanInstall, "unverified version keeps installation disabled");
}

var migrationRoot = Path.Combine(temporary, "migration");
var bootstrap = Path.Combine(migrationRoot, "bootstrap");
var originalData = Path.Combine(migrationRoot, "original data");
var migratedData = Path.Combine(migrationRoot, "migrated data");
var movable = new ManagerEnvironment(root, originalData, bootstrap);
movable.SaveSettings(new() { Theme = "Dark", ApplicationDirectory = "D:\\App" });
Directory.CreateDirectory(Path.Combine(originalData, "backups", "localization"));
var payload = Enumerable.Range(0, 8193).Select(i => (byte)(i % 251)).ToArray();
File.WriteAllBytes(Path.Combine(originalData, "backups", "localization", "sample.asar"), payload);
File.WriteAllText(Path.Combine(originalData, "tasks.json"), "[]");
movable.MigrateDataDirectory(migratedData);
Check(movable.DataDirectory == migratedData && File.ReadAllBytes(Path.Combine(migratedData, "backups", "localization", "sample.asar")).SequenceEqual(payload), "migration copies nested backups without changing their bytes");
Check(File.Exists(Path.Combine(originalData, "settings.json")) && File.Exists(Path.Combine(originalData, "backups", "localization", "sample.asar")), "migration preserves original data");
var restarted = new ManagerEnvironment(root, bootstrapDirectory: bootstrap);
Check(restarted.DataDirectory == migratedData && restarted.LoadSettings().Theme == "Dark", "restart resolves migrated directory and settings through bootstrap");
Check(!File.Exists(Path.Combine(migratedData, "localization.lock")), "migration does not copy engine lock into destination");
void Reject(Action action, string description)
{
    var rejected = false;
    try { action(); } catch (IOException) { rejected = true; }
    Check(rejected, description);
}
var occupied = Path.Combine(migrationRoot, "occupied"); Directory.CreateDirectory(occupied);
File.WriteAllText(Path.Combine(occupied, "settings.json"), "keep me");
Reject(() => movable.MigrateDataDirectory(occupied), "nonempty destination rejects migration");
Check(movable.DataDirectory == migratedData && File.ReadAllText(Path.Combine(occupied, "settings.json")) == "keep me", "rejected migration keeps location and destination unchanged");
Reject(() => movable.MigrateDataDirectory(Path.Combine(migratedData, "child")), "nested destination rejects recursive copying");
using (File.Create(Path.Combine(migratedData, "localization.lock")))
    Reject(() => movable.MigrateDataDirectory(Path.Combine(migrationRoot, "locked target")), "active engine lock prevents migration");
File.Delete(Path.Combine(migratedData, "localization.lock"));
using (movable.AcquireDataAccess())
    Reject(() => restarted.MigrateDataDirectory(Path.Combine(migrationRoot, "other instance")), "concurrent manager operation prevents migration");
var secondTarget = Path.Combine(migrationRoot, "second target");
Directory.CreateDirectory(secondTarget);
movable.MigrateDataDirectory(secondTarget);
Reject(() => restarted.AcquireDataAccess().Dispose(), "stale manager instance cannot write the previous data directory");
Check(new ManagerEnvironment(root, bootstrapDirectory: bootstrap).DataDirectory == secondTarget, "repeated migration persists the latest location");
var junctionTarget = Path.Combine(migrationRoot, "junction target"); Directory.CreateDirectory(junctionTarget);
var linkedPath = Path.Combine(secondTarget, "linked data"); using (var setup = new System.Diagnostics.Process { StartInfo = new("powershell.exe") { UseShellExecute = false, CreateNoWindow = true } })
{
    setup.StartInfo.ArgumentList.Add("-NoProfile"); setup.StartInfo.ArgumentList.Add("-Command");
    setup.StartInfo.ArgumentList.Add("New-Item -ItemType Junction -Path $env:MANAGER_TEST_LINK -Target $env:MANAGER_TEST_TARGET -ErrorAction Stop | Out-Null");
    setup.StartInfo.Environment["MANAGER_TEST_LINK"] = linkedPath; setup.StartInfo.Environment["MANAGER_TEST_TARGET"] = junctionTarget;
    setup.Start(); setup.WaitForExit(); Check(setup.ExitCode == 0, "junction fixture created without administrator privileges");
}
Reject(() => movable.MigrateDataDirectory(Path.Combine(migrationRoot, "link rejected")), "linked data rejects migration instead of following external directories");
Check(movable.DataDirectory == secondTarget, "failed copy keeps selected directory unchanged");
