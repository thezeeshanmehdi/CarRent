param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public'))

Add-Type -AssemblyName System.Drawing

function New-CarRentIcon([int]$Size, [string]$Name, [bool]$Maskable = $false) {
  $bmp = [System.Drawing.Bitmap]::new($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $scale = $Size / 512.0
  function S([float]$v) { return [float]($v * $scale) }

  $bounds = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($bounds, [System.Drawing.Color]::FromArgb(255, 8, 45, 59), [System.Drawing.Color]::FromArgb(255, 18, 181, 166), 48)
  $g.FillRectangle($brush, $bounds)
  $brush.Dispose()

  $glow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 92, 224, 210))
  $g.FillEllipse($glow, (S 330), (S -42), (S 210), (S 210))
  $glow.Dispose()

  $roadBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(48, 3, 25, 34))
  $g.FillEllipse($roadBrush, (S 46), (S 387), (S 420), (S 44))
  $roadBrush.Dispose()

  $sourcePath = Join-Path $OutputDirectory 'suzuki-alto-icon-source.png'
  $carImage = [System.Drawing.Image]::FromFile($sourcePath)
  if ($Maskable) {
    $carBounds = [System.Drawing.RectangleF]::new((S 58), (S 199), (S 396), (S 226))
  } else {
    $carBounds = [System.Drawing.RectangleF]::new((S 18), (S 172), (S 486), (S 278))
  }
  $g.DrawImage($carImage, $carBounds)
  $carImage.Dispose()

  $badge = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38,255,255,255))
  $g.FillEllipse($badge,(S 54),(S 53),(S 82),(S 82)); $badge.Dispose()
  $font = [System.Drawing.Font]::new('Arial', (S 27), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $format = [System.Drawing.StringFormat]::new(); $format.Alignment = 'Center'; $format.LineAlignment = 'Center'
  $g.DrawString('CR', $font, $textBrush, [System.Drawing.RectangleF]::new((S 54),(S 53),(S 82),(S 82)), $format)
  $font.Dispose(); $textBrush.Dispose(); $format.Dispose()

  $path = Join-Path $OutputDirectory $Name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-CarRentIcon 192 'icon-192.png'
New-CarRentIcon 512 'icon-512.png'
New-CarRentIcon 512 'icon-512-maskable.png' $true
New-CarRentIcon 180 'apple-touch-icon.png'
