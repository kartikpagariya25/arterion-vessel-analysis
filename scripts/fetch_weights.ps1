# Downloads trained ONNX weights from the latest GitHub Release into backend/app/vessel_analysis/weights/
$ErrorActionPreference = "Stop"
$repo = "kartikpagariya25/arterion-vessel-analysis"
$dest = Join-Path $PSScriptRoot "..\backend\app\vessel_analysis\weights"
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in "vessel_model.onnx", "stenosis_model.onnx") {
  Write-Host "Downloading $f ..."
  Invoke-WebRequest "https://github.com/$repo/releases/latest/download/$f" -OutFile (Join-Path $dest $f)
}
Write-Host "Done."
