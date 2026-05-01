@echo off
setlocal

echo.
echo  RL Insights ^| Configurar Stats API
echo  =====================================
echo.

set "CONFIG_FILE="

rem -- Ubicacion 1: AppData (instalacion estandar)
set "PATH1=%APPDATA%\Rocket League\TAGame\Config"
if exist "%PATH1%" (
    set "CONFIG_FILE=%PATH1%\DefaultStatsAPI.ini"
    goto :write
)

rem -- Ubicacion 2: Epic Games (instalacion por defecto de Epic)
set "PATH2=C:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%PATH2%" (
    set "CONFIG_FILE=%PATH2%\DefaultStatsAPI.ini"
    goto :write
)

rem -- Ubicacion 3: Epic Games en disco alternativo
set "PATH3=D:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%PATH3%" (
    set "CONFIG_FILE=%PATH3%\DefaultStatsAPI.ini"
    goto :write
)

echo  ERROR: No se encontro Rocket League en ninguna ubicacion conocida.
echo.
echo  Rutas verificadas:
echo    %PATH1%
echo    %PATH2%
echo    %PATH3%
echo.
echo  Abre el juego al menos una vez, o editá el archivo manualmente.
echo.
pause
exit /b 1

:write
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
