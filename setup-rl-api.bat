@echo off
setlocal
set "WRITTEN=0"

echo.
echo  RL Insights ^| Configurar Stats API
echo  =====================================
echo.

set "CONTENT=[LanStatsServer]
bEnabled=True
Port=49122"

rem -- AppData (donde RL guarda configs de usuario)
set "DIR1=%APPDATA%\Rocket League\TAGame\Config"
if not exist "%DIR1%" mkdir "%DIR1%" 2>nul
if exist "%DIR1%" (
    (
        echo [LanStatsServer]
        echo bEnabled=True
        echo Port=49122
    ) > "%DIR1%\DefaultStatsAPI.ini"
    echo  OK: %DIR1%\DefaultStatsAPI.ini
    set "WRITTEN=1"
)

rem -- Directorio de instalacion de Epic Games (C:)
set "DIR2=C:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%DIR2%" (
    (
        echo [LanStatsServer]
        echo bEnabled=True
        echo Port=49122
    ) > "%DIR2%\DefaultStatsAPI.ini"
    echo  OK: %DIR2%\DefaultStatsAPI.ini
    set "WRITTEN=1"
)

rem -- Directorio de instalacion de Epic Games (D:)
set "DIR3=D:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%DIR3%" (
    (
        echo [LanStatsServer]
        echo bEnabled=True
        echo Port=49122
    ) > "%DIR3%\DefaultStatsAPI.ini"
    echo  OK: %DIR3%\DefaultStatsAPI.ini
    set "WRITTEN=1"
)

echo.
if "%WRITTEN%"=="1" (
    echo  Listo^^! Reinicia Rocket League para aplicar los cambios.
) else (
    echo  ERROR: No se encontro ninguna carpeta de Rocket League.
    echo  Abre el juego al menos una vez y vuelve a ejecutar este script.
)

echo.
pause
