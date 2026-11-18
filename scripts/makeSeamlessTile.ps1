# Makes a square tile image repeat without visible seams, then saves a compact JPEG for the game.
# Blends each edge band with the matching part of the image from the opposite side (offset by half).
# A narrow -Band means less "ghosting" (faint doubled bricks) but a harder transition at the edge.
# If the source was generated with a seamless/circular-padding node, use -Band 0 to just convert.
#
#   powershell -File scripts\makeSeamlessTile.ps1 -Src assets-src\tiles-raw\floor_00002_.png -Dst apps\web\public\textures\tile_road.jpg
#   ... -Band 0.04     (default 0.06, fraction of the image width blended at each edge)
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Dst,
  [double]$Band = 0.06,
  [int]$Quality = 88
)

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices; using System.Linq;
public static class SeamlessTile {
  static double Smooth(double e0, double e1, double x){ double t=Math.Max(0,Math.Min(1,(x-e0)/(e1-e0))); return t*t*(3-2*t); }
  public static void Make(string src, string dst, double band, long quality) {
    using (var bmp0 = new Bitmap(src)) {
      int n = Math.Min(bmp0.Width, bmp0.Height); var rect = new Rectangle(0,0,n,n);
      using (var bmp = bmp0.Clone(rect, PixelFormat.Format24bppRgb)) {
        var d = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
        int stride = d.Stride; byte[] a = new byte[stride*n]; Marshal.Copy(d.Scan0, a, 0, a.Length);
        byte[] o = (byte[])a.Clone(); int h = n/2;
        if (band > 0) {
          for (int y=0;y<n;y++){ double uy=(y+0.5)/n; double wy=Smooth(0,band,uy)*Smooth(0,band,1-uy);
            for (int x=0;x<n;x++){ double ux=(x+0.5)/n; double w=wy*Smooth(0,band,ux)*Smooth(0,band,1-ux);
              int bi=((y+h)%n)*stride+((x+h)%n)*3; int ai=y*stride+x*3;
              for (int c=0;c<3;c++) o[ai+c]=(byte)Math.Round(w*a[ai+c]+(1-w)*a[bi+c]); } }
        }
        Marshal.Copy(o, 0, d.Scan0, o.Length); bmp.UnlockBits(d);
        var codec = ImageCodecInfo.GetImageEncoders().First(e => e.MimeType=="image/jpeg");
        var ep = new EncoderParameters(1); ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        bmp.Save(dst, codec, ep);
      } } } }
"@

$srcFull = (Resolve-Path $Src).Path
$dstFull = Join-Path (Resolve-Path (Split-Path $Dst -Parent)).Path (Split-Path $Dst -Leaf)
[SeamlessTile]::Make($srcFull, $dstFull, $Band, $Quality)

# Report how well the edges match: wrap-around diff should be close to the neighbouring-column diff.
function EdgeDiff($bmp, $a, $b, $horizontal) {
  $n = $bmp.Width; $sum = 0.0
  for ($i = 0; $i -lt $n; $i++) {
    if ($horizontal) { $p = $bmp.GetPixel($a, $i); $q = $bmp.GetPixel($b, $i) } else { $p = $bmp.GetPixel($i, $a); $q = $bmp.GetPixel($i, $b) }
    $sum += ([math]::Abs($p.R - $q.R) + [math]::Abs($p.G - $q.G) + [math]::Abs($p.B - $q.B)) / 3.0
  }
  [math]::Round($sum / $n, 1)
}
$bmp = New-Object System.Drawing.Bitmap -ArgumentList $dstFull
$last = $bmp.Width - 1; $mid = [int]($bmp.Width / 2)
"edge diff left-right: wrap {0}  vs neighbours {1}" -f (EdgeDiff $bmp $last 0 $true), (EdgeDiff $bmp $mid ($mid + 1) $true)
"edge diff top-bottom: wrap {0}  vs neighbours {1}" -f (EdgeDiff $bmp $last 0 $false), (EdgeDiff $bmp $mid ($mid + 1) $false)
$bmp.Dispose()
"{0}  {1:N0} KB" -f $dstFull, ((Get-Item $dstFull).Length / 1KB)
