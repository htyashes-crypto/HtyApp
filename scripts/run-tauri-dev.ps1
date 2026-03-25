Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$env:PATH = "C:\Users\admin\.cargo\bin;" + $env:PATH
& "C:\Program Files\nodejs\npm.cmd" run tauri dev
