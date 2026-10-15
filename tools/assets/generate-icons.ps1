$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assetDirectory = Join-Path $projectRoot 'src/AntigravityManager.Desktop/Assets/Branding'
[xml]$source = Get-Content -LiteralPath (Join-Path $assetDirectory 'app-icon.svg') -Raw -Encoding UTF8
if ($source.svg.viewBox -ne '0 0 512 512') { throw '品牌源文件必须使用 512 × 512 的 viewBox。' }
$invariant = [Globalization.CultureInfo]::InvariantCulture
function Number([string]$value) { return [double]::Parse($value, $invariant) }
function RelativeNumber([string]$value) {
    if ($value.EndsWith('%')) { return (Number $value.TrimEnd('%')) / 100 }
    return Number $value
}
function Brush([string]$fill) {
    if ($fill -match '^url\(#([a-zA-Z0-9-]+)\)$') { return $gradients[$Matches[1]] }
    return [Windows.Media.SolidColorBrush]::new([Windows.Media.ColorConverter]::ConvertFromString($fill))
}

# 仅渲染品牌源文件使用的 rect、path 和 linearGradient；未知元素必须报错。
$gradients = @{}
foreach ($gradient in $source.svg.defs.ChildNodes) {
    if ($gradient.LocalName -ne 'linearGradient') { throw '不支持的 SVG 渐变类型。' }
    $brush = [Windows.Media.LinearGradientBrush]::new()
    $brush.StartPoint = [Windows.Point]::new((RelativeNumber $gradient.x1), (RelativeNumber $gradient.y1))
    $brush.EndPoint = [Windows.Point]::new((RelativeNumber $gradient.x2), (RelativeNumber $gradient.y2))
    foreach ($stop in $gradient.ChildNodes) {
        $brush.GradientStops.Add([Windows.Media.GradientStop]::new([Windows.Media.ColorConverter]::ConvertFromString($stop.GetAttribute('stop-color')), (RelativeNumber $stop.offset)))
    }
    $gradients[$gradient.id] = $brush
}
$drawing = [Windows.Media.DrawingGroup]::new()
$context = $drawing.Open()
try {
    foreach ($element in $source.svg.ChildNodes) {
        switch ($element.LocalName) {
            { $_ -in 'title', 'desc', 'defs' } { continue }
            'rect' {
                $rect = [Windows.Rect]::new((Number $element.x), (Number $element.y), (Number $element.width), (Number $element.height))
                $radius = if ($element.rx) { Number $element.rx } else { 0 }
                $context.DrawRoundedRectangle((Brush $element.fill), $null, $rect, $radius, $radius)
            }
            'path' { $context.DrawGeometry((Brush $element.fill), $null, [Windows.Media.Geometry]::Parse($element.d)) }
            default { throw ('不支持的 SVG 元素：' + $element.LocalName) }
        }
    }
} finally { $context.Close() }
$drawing.Freeze()

function PngBytes([int]$size) {
    $visual = [Windows.Media.DrawingVisual]::new()
    $context = $visual.RenderOpen()
    try {
        $context.PushTransform([Windows.Media.ScaleTransform]::new($size / 512.0, $size / 512.0))
        $context.DrawDrawing($drawing)
        $context.Pop()
    } finally { $context.Close() }
    $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $stream = [IO.MemoryStream]::new()
    try { $encoder.Save($stream); return ,$stream.ToArray() } finally { $stream.Dispose() }
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$frames = @($sizes | ForEach-Object { PngBytes $_ })
$iconPath = Join-Path $assetDirectory 'app-icon.ico'
$writer = [IO.BinaryWriter]::new([IO.File]::Open($iconPath, [IO.FileMode]::Create))
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$index].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally { $writer.Dispose() }
[IO.File]::WriteAllBytes((Join-Path $assetDirectory 'app-icon.png'), (PngBytes 512))
Write-Output ('已生成图标：' + ($sizes -join ', ') + ' 像素 ICO，以及 512 像素 PNG。')
