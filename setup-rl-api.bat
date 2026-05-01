@echo off
setlocal

set "CONFIG_DIR=%APPDATA%\Rocket League\TAGame\Config"
set "CONFIG_FILE=%CONFIG_DIR%\DefaultStatsAPI.ini"

echo.
echo  RL Insights ^| Configurar Stats API
echo  =====================================
echo.

if not exist "%CONFIG_DIR%" (
    echo  ERROR: No se encontro Rocket League.
    echo  Path esperado: %CONFIG_DIR%
    echo  Abre el juego al menos una vez primero.
    echo.
    pause
    exit /b 1
)

(
echo [LanStatsServer]
echo bEnabled=True
echo WebSocketEnabled=True
echo Port=49122
) > "%CONFIG_FILE%"

if %errorlevel% equ 0 (
    echo  Listo^^! Archivo configurado en:
    echo  %CONFIG_FILE%
    echo.
    echo  Reinicia Rocket League para aplicar los cambios.
) else (
    echo  ERROR: No se pudo escribir el archivo.
    echo  Intenta ejecutar como administrador.
)

echo.
pause
