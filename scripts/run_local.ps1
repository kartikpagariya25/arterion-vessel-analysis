# Runs the API (http://localhost:8000) and the site (http://localhost:8080) without Docker. Needs Python 3.11.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv'
if (-not (Test-Path $venv)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.11 -m venv $venv } else { python -m venv $venv }
}
$py = Join-Path $venv 'Scripts\python.exe'
& $py -m pip install -q -r (Join-Path $root 'backend\requirements.txt')
$api = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root 'backend') $py -ArgumentList '-m', 'uvicorn', 'app.main:app', '--port', '8000'
try {
    Set-Location (Join-Path $root 'frontend')
    & $py -m http.server 8080
} finally {
    Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
}
