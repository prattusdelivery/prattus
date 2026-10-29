@echo off
chcp 65001 >nul
title Instalar impressao do ServiDelivery
cls
echo.
echo  ===== ServiDelivery - Instalar impressao (cozinha e bebida) =====
echo.

net session >nul 2>&1
if errorlevel 1 goto pedir_permissao
goto instalar

:pedir_permissao
echo  Vai aparecer uma janela pedindo permissao.
echo  Clique em SIM.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:instalar
set "QZ=%ProgramFiles%\QZ Tray"
if exist "%QZ%\qz-tray.exe" goto ja_instalado

echo  1/4 Instalando o QZ Tray. Pode demorar uns minutos, aguarde...
winget install -e --id QZIndustries.QZTray --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
if exist "%QZ%\qz-tray.exe" goto instalado

echo      Tentando outro jeito...
curl.exe -L -s -o "%TEMP%\qz-tray-instalador.exe" https://github.com/qzind/tray/releases/download/v2.3.0/qz-tray-2.3.0-x86_64.exe
if exist "%TEMP%\qz-tray-instalador.exe" start /wait "" "%TEMP%\qz-tray-instalador.exe" /S
if exist "%QZ%\qz-tray.exe" goto instalado

echo.
echo  Nao consegui instalar sozinho.
echo  Baixe e instale o QZ Tray por aqui: https://qz.io/download/
echo  Depois abra este arquivo de novo.
echo.
pause
exit /b

:ja_instalado
echo  1/4 QZ Tray ja esta instalado.

:instalado
echo  2/4 Baixando a liberacao de seguranca do ServiDelivery...
curl.exe -L -s -o "%TEMP%\servidelivery-cert.txt" https://www.servidelivery.com.br/qz-cert.txt
if not exist "%TEMP%\servidelivery-cert.txt" (
  echo  Nao consegui baixar. Veja a internet e abra este arquivo de novo.
  pause
  exit /b
)

echo  3/4 Liberando o ServiDelivery no QZ Tray...
"%QZ%\qz-tray-console.exe" --allow "%TEMP%\servidelivery-cert.txt" >nul 2>&1
if exist "%APPDATA%\qz\allowed.dat" (
  if not exist "%ProgramData%\qz" mkdir "%ProgramData%\qz" >nul 2>&1
  copy /y "%APPDATA%\qz\allowed.dat" "%ProgramData%\qz\allowed.dat" >nul 2>&1
)

echo  4/4 Abrindo o QZ Tray...
taskkill /f /im qz-tray.exe >nul 2>&1
timeout /t 2 /nobreak >nul
explorer.exe "%QZ%\qz-tray.exe"

echo.
echo  ===== PRONTO! =====
echo  Pode fechar esta janela e voltar para o ServiDelivery.
echo  A tela la vai avisar sozinha que a impressao esta pronta.
echo.
timeout /t 8 >nul
