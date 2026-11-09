@echo off
title Instalar Dependencias - Automacao LSL
echo ============================================
echo  INSTALACAO DAS DEPENDENCIAS
echo  Automacao Volu Recebimento LSL
echo ============================================
echo.

:: Verifica se Python esta instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Python nao encontrado.
    echo Baixe e instale o Python em: https://python.org/downloads
    echo Marque a opcao "Add Python to PATH" durante a instalacao.
    echo.
    pause
    exit /b 1
)

echo Python encontrado:
python --version
echo.
echo Instalando dependencias...
echo.

pip install openpyxl xlrd==1.2.0 requests

echo.
echo ============================================
echo  Instalacao concluida!
echo  Agora execute "rodar.bat" para iniciar.
echo ============================================
echo.
pause
