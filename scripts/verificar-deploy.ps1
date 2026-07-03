# Verifica se o projeto está pronto para deploy / teste externo
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "`n=== FILA LSL — verificação de deploy ===" -ForegroundColor Cyan

# Git
Write-Host "`n[Git]" -ForegroundColor Yellow
git status -sb
$branch = git branch --show-current
if ($branch -ne "main") {
  Write-Host "  AVISO: branch atual é '$branch' (esperado: main)" -ForegroundColor DarkYellow
}
$remote = git remote get-url origin 2>$null
if ($remote) {
  Write-Host "  Remote: $remote"
} else {
  Write-Host "  ERRO: remote origin não configurado" -ForegroundColor Red
}

# Env local (opcional — só aviso)
Write-Host "`n[.env.local]" -ForegroundColor Yellow
$envFile = Join-Path $root ".env.local"
if (Test-Path $envFile) {
  $required = @(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  )
  $content = Get-Content $envFile -Raw
  foreach ($key in $required) {
    if ($content -match "$key=.+") {
      Write-Host "  OK $key"
    } else {
      Write-Host "  FALTA $key" -ForegroundColor Red
    }
  }
} else {
  Write-Host "  .env.local não encontrado (OK se variáveis estão só na Vercel)" -ForegroundColor DarkYellow
}

# Build
Write-Host "`n[Build]" -ForegroundColor Yellow
Write-Host "  Rodando npm run build (pode levar ~2 min)..."
npm run build
if ($LASTEXITCODE -eq 0) {
  Write-Host "  Build OK" -ForegroundColor Green
} else {
  Write-Host "  Build FALHOU" -ForegroundColor Red
  exit 1
}

Write-Host "`n=== Próximo passo ===" -ForegroundColor Cyan
Write-Host "  1. Vercel: Settings -> Git -> repo FILA-LS + branch main"
Write-Host "  2. Vercel: Environment Variables (4 obrigatórias)"
Write-Host "  3. Supabase: Site URL = https://SUA-URL.vercel.app"
Write-Host "  4. Guia completo: TESTE-EXTERNO-AMANHA.md"
Write-Host ""
