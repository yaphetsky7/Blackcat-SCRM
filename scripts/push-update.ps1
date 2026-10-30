# One-click update push: raises the version (1.14.1 -> 1.14.2), builds the installer, publishes it to customers.
# Started by 推送更新.bat in the project folder.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

$current = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
Write-Host ""
Write-Host "现在的版本 / Current version: v$current"
$notes = Read-Host '这次更新了什么？（客户会看到）/ What changed? (customers will see this)'
$forced = Read-Host '强制更新？旧版本必须更新才能继续用 / Forced update? (y/N)'

Write-Host ""
Write-Host '1/3 调高版本号… / Raising the version…'
npm version patch --no-git-tag-version | Out-Null
if ($LASTEXITCODE) { throw '调高版本号失败 / Could not raise the version' }
$version = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
Write-Host "    v$current -> v$version"

Write-Host '2/3 打包安装程序（约 1–2 分钟）… / Building the installer (1–2 min)…'
$built = $false
for ($i = 1; $i -le 3 -and -not $built; $i++) {
  npx electron-builder --win nsis | Out-Null
  if ($LASTEXITCODE -eq 0) { $built = $true } else { Write-Host '    文件被占用，20 秒后重试… / File busy, retrying in 20 s…'; Start-Sleep 20 }
}
if (-not $built) { throw '打包失败。请关闭从 dist 文件夹打开的黑猫SCRM 后再试。/ Build failed. Close any 黑猫SCRM opened from the dist folder and try again.' }

Write-Host '3/3 发布给客户… / Publishing to customers…'
$env:BC_NOTES = $notes
$env:BC_FORCED = if ($forced -match '^[yY]') { '1' } else { '0' }
node server\scripts\publish-update.js
if ($LASTEXITCODE) { throw '发布失败 / Publish failed' }
Write-Host ""
Write-Host '完成！/ Done!' -ForegroundColor Green
