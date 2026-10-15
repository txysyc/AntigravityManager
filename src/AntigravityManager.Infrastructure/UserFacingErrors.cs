using System.Text.Json;

namespace AntigravityManager.Infrastructure;

public static class UserFacingErrors
{
    public static string Describe(Exception error, string operation)
    {
        var guidance = error switch
        {
            UnauthorizedAccessException => "请检查目标目录的访问权限。",
            FileNotFoundException or DirectoryNotFoundException => "找不到所需文件或目录，请检查安装位置与程序资源。",
            JsonException => "配置或引擎结果的 JSON 格式无效，请检查对应文件。",
            IOException => "请检查文件占用、数据目录和磁盘状态。",
            _ => "请根据原始信息检查运行环境与操作条件。"
        };
        return $"{operation}失败。{guidance}\n原始信息：{error.Message}";
    }
}
