# Starts the BlackCat server with your Claude API key.
# The key is asked for here (hidden while you paste) and only kept for this window; it is not saved to disk.
$secure = Read-Host '请粘贴你的 Claude API Key（粘贴时不会显示），然后按 Enter / Paste your Claude API key, then press Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $key.StartsWith('sk-ant-')) {
  Write-Host '这看起来不是 Claude API Key（应以 sk-ant- 开头）。请重新运行。 / That does not look like a Claude API key (it starts with sk-ant-).'
  exit 1
}
$env:ANTHROPIC_API_KEY = $key
Remove-Variable key, secure
Write-Host '已收到 Key，正在启动服务器… / Key received, starting the server…'
npm start
