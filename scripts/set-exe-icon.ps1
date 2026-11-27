param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$Png
)

$ErrorActionPreference = 'Stop'
$exe = (Get-Item -LiteralPath $Executable).FullName
$pngFile = (Get-Item -LiteralPath $Png).FullName

if (-not ('ManagerExeIcon' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ManagerExeIcon
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool UpdateResource(IntPtr update, IntPtr type, IntPtr name,
        ushort language, byte[] data, uint size);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool EndUpdateResource(IntPtr update, bool discard);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern uint ExtractIconEx(string file, int index, out IntPtr large,
        out IntPtr small, uint count);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr icon);

    public static bool CanExtract(string file)
    {
        uint count = ExtractIconEx(file, 0, out IntPtr large, out IntPtr small, 1);
        bool found = count != 0 && count != uint.MaxValue &&
            large != IntPtr.Zero && small != IntPtr.Zero;
        if (large != IntPtr.Zero) DestroyIcon(large);
        if (small != IntPtr.Zero && small != large) DestroyIcon(small);
        return found;
    }
}
'@
}

$source = [Drawing.Image]::FromFile($pngFile)
try {
    if ($source.Width -ne $source.Height) { throw 'EXE 图标源必须是方形图片。' }
    $icons = foreach ($size in 16, 24, 32, 48, 64, 128, 256) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.DrawImage($source, 0, 0, $size, $size)
            } finally {
                $graphics.Dispose()
            }
            $image = [IO.MemoryStream]::new()
            try {
                $bitmap.Save($image, [Drawing.Imaging.ImageFormat]::Png)
                @{ Size = $size; Bytes = $image.ToArray() }
            } finally {
                $image.Dispose()
            }
        } finally {
            $bitmap.Dispose()
        }
    }
} finally {
    $source.Dispose()
}

# RT_GROUP_ICON 的目录项引用独立的 RT_ICON 资源。宽高为 256 时以 0 表示。
$group = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($group)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$icons.Count)
    for ($index = 0; $index -lt $icons.Count; $index++) {
        $icon = $icons[$index]
        $writer.Write([byte]($icon.Size -band 255))
        $writer.Write([byte]($icon.Size -band 255))
        $writer.Write([uint16]0) # 调色板颜色数和保留字段
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$icon.Bytes.Length)
        $writer.Write([uint16]($index + 1))
    }
    $directory = $group.ToArray()
} finally {
    $writer.Dispose()
}

$rtIcon = [IntPtr]3
$rtGroupIcon = [IntPtr]14
$update = [ManagerExeIcon]::BeginUpdateResource($exe, $false)
if ($update -eq [IntPtr]::Zero) { throw '无法打开 EXE 的资源表。' }
$discard = $true
try {
    for ($index = 0; $index -lt $icons.Count; $index++) {
        $bytes = $icons[$index].Bytes
        if (![ManagerExeIcon]::UpdateResource($update, $rtIcon, [IntPtr]($index + 1), 0, $bytes, $bytes.Length)) {
            throw '无法写入 EXE 的图标图像。'
        }
    }
    if (![ManagerExeIcon]::UpdateResource($update, $rtGroupIcon, [IntPtr]1, 0, $directory, $directory.Length)) {
        throw '无法写入 EXE 的图标组。'
    }
    $discard = $false
} finally {
    if (![ManagerExeIcon]::EndUpdateResource($update, $discard) -and !$discard) {
        throw '无法保存 EXE 的图标资源。'
    }
}
if (![ManagerExeIcon]::CanExtract($exe)) { throw 'Windows 无法从成品提取图标。' }
