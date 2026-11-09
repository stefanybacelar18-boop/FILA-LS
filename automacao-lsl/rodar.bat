@echo off
title Automacao Volu Recebimento LSL
color 1F
echo ============================================
echo  AUTOMACAO VOLU RECEBIMENTO LSL
echo ============================================
echo.
echo  Iniciando... aguarde.
echo.

:: Muda para a pasta do script para encontrar os arquivos
cd /d "%~dp0"

python automacao_volu_lsl.py

:: Mantém a janela aberta se houver erro
if errorlevel 1 (
    echo.
    echo ATENCAO: O script terminou com erro.
    pause
)
