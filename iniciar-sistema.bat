@echo off
chcp 65001 >nul
title SuaLojaAqui
cd /d "%~dp0"

rem Inicia o sistema em modo de producao (banco + aplicacao) e abre o navegador.
rem Para encerrar, feche esta janela.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primeira execucao: instalando e configurando o sistema...
  call npm run setup || goto :erro
)

if not exist "apps\api\dist\main.js" call npm run build || goto :erro
if not exist "apps\web\dist\index.html" call npm run build || goto :erro

echo.
echo  Sistema iniciando... o navegador abrira em instantes em http://localhost:3000
echo  Para acessar de outro computador ou celular da mesma rede, use http://IP-DESTE-PC:3000
echo  Para encerrar, feche esta janela.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 10; Start-Process 'http://localhost:3000'"
call npm start
goto :eof

:erro
echo.
echo Ocorreu um erro. Veja as mensagens acima.
pause
exit /b 1
