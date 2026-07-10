# FilaDock — ativa integração Google Form (forma fácil, sem Apps Script)
# Uso: .\scripts\ativar-google-form.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "=== FilaDock — Ativar Google Form ===" -ForegroundColor Cyan
Write-Host ""

$sqlPath = Join-Path $root "supabase\migracao-google-form.sql"
$sql = Get-Content $sqlPath -Raw

# 1. SQL na área de transferência
Set-Clipboard -Value $sql
Write-Host "[1/4] SQL copiado para a area de transferencia." -ForegroundColor Green
Write-Host "      Abra o Supabase SQL Editor e cole (Ctrl+V) -> Run" -ForegroundColor Gray

$supabaseSql = "https://supabase.com/dashboard/project/xctzcizqoussthitrihm/sql/new"
Start-Process $supabaseSql
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "[2/4] Verificando planilha Google..." -ForegroundColor Yellow
try {
  $csvUrl = "https://docs.google.com/spreadsheets/d/15hWsQM_0ht0XSEGn9LZsZhrswCEUxGiQxhem08VxVOo/export?format=csv&gid=801601968"
  $csv = Invoke-WebRequest -Uri $csvUrl -UseBasicParsing -TimeoutSec 30
  $lines = ($csv.Content -split "`n" | Where-Object { $_.Trim().Length -gt 0 }).Count - 1
  Write-Host "      OK — $lines linha(s) de resposta na planilha." -ForegroundColor Green
} catch {
  Write-Host "      AVISO — nao foi possivel ler a planilha: $_" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "[3/4] Verificando deploy Vercel..." -ForegroundColor Yellow
try {
  $health = Invoke-WebRequest -Uri "https://fila-lsl.vercel.app/api/health" -UseBasicParsing -TimeoutSec 20
  Write-Host "      App online (HTTP $($health.StatusCode))." -ForegroundColor Green
} catch {
  Write-Host "      AVISO — app pode estar offline ou em deploy." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "      Se CRON_SECRET foi adicionado hoje, faca Redeploy na Vercel:" -ForegroundColor Gray
$vercelDeploy = "https://vercel.com/fila-lsl/~/deployments"
Write-Host "      $vercelDeploy" -ForegroundColor Gray

Write-Host ""
Write-Host "[4/4] Apos rodar o SQL no Supabase, escolha UMA opcao:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  A) Pelo app (recomendado):" -ForegroundColor White
Write-Host "     https://fila-lsl.vercel.app/admin -> Importar todas as linhas agora" -ForegroundColor Cyan
Write-Host ""
Write-Host "  B) Pelo terminal (automatico):" -ForegroundColor White
Write-Host "     npm run sync:google-form" -ForegroundColor Cyan
Write-Host ""

$runNow = Read-Host "Ja executou o SQL no Supabase? Rodar sync agora pelo terminal? (s/N)"
if ($runNow -eq "s" -or $runNow -eq "S") {
  Write-Host ""
  Write-Host "Sincronizando..." -ForegroundColor Yellow
  npm run sync:google-form
} else {
  Write-Host ""
  Write-Host "Quando terminar o SQL, rode: npm run sync:google-form" -ForegroundColor Green
  Write-Host "Ou use o botao no /admin" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Pronto ===" -ForegroundColor Cyan
Write-Host "Novas respostas do Form entram sozinhas em ate 5 min (cron)." -ForegroundColor Gray
Write-Host "Apps Script NAO e necessario." -ForegroundColor Gray
Write-Host ""
