# FILA LSL — inicia o app em modo produção na rede local (Wi-Fi da empresa)
# Uso: .\scripts\iniciar-producao.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ""
Write-Host "=== FILA LSL — Modo producao (rede local) ===" -ForegroundColor Cyan
Write-Host ""

# Descobre IP na rede Wi-Fi / Ethernet (ignora VPN e loopback)
$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  Sort-Object InterfaceMetric |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $ip) {
  Write-Host "Nao foi possivel detectar o IP da rede. Verifique a conexao Wi-Fi." -ForegroundColor Red
  exit 1
}

$port = 3000
$url = "http://${ip}:${port}"

Write-Host "IP detectado: $ip" -ForegroundColor Green
Write-Host ""
Write-Host "URLs para amanha:" -ForegroundColor Yellow
Write-Host "  Motoristas (celular):  $url/login/motorista"
Write-Host "  Empilhador (celular):  $url/login"
Write-Host "  Admin (notebook):        $url/login"
Write-Host "  Painel TV:               $url/tv"
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "  1. Celulares devem estar na MESMA Wi-Fi do notebook servidor"
Write-Host "  2. Atualize NEXT_PUBLIC_APP_URL no .env.local para: $url"
Write-Host "  3. No Supabase > Authentication > URL Configuration:"
Write-Host "     Site URL: $url"
Write-Host "     Redirect URLs: $url/**"
Write-Host "  4. Admin > QR Code usa essa URL para motoristas escanearem"
Write-Host ""

$envFile = Join-Path $PWD ".env.local"
if (Test-Path $envFile) {
  $content = Get-Content $envFile -Raw
  if ($content -match "NEXT_PUBLIC_APP_URL=") {
    $newContent = $content -replace "NEXT_PUBLIC_APP_URL=.*", "NEXT_PUBLIC_APP_URL=$url"
    Set-Content -Path $envFile -Value $newContent.TrimEnd() -NoNewline
    Add-Content -Path $envFile -Value ""
    Write-Host ".env.local atualizado com NEXT_PUBLIC_APP_URL=$url" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Gerando build de producao..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Servidor iniciando em $url (Ctrl+C para parar)" -ForegroundColor Green
Write-Host ""
npx next start -H 0.0.0.0 -p $port
