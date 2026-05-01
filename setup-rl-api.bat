@echo off
setlocal
set "WRITTEN=0"

echo.
echo  RL Insights ^| Configurar Stats API
echo  =====================================
echo.

rem -- Directorio de instalacion de Epic Games (C:)
set "DIR1=C:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%DIR1%" (
    (
        echo [TAGame.MatchStatsExporter_TA]
        echo PacketSendRate=60
        echo Port=49123
    ) > "%DIR1%\DefaultStatsAPI.ini"
    echo  OK: %DIR1%\DefaultStatsAPI.ini
    set "WRITTEN=1"
)

rem -- Directorio de instalacion de Epic Games (D:)
set "DIR2=D:\Program Files\Epic Games\rocketleague\TAGame\Config"
if exist "%DIR2%" (
    (
        echo [TAGame.MatchStatsExporter_TA]
        echo PacketSendRate=60
        echo Port=49123
    ) > "%DIR2%\DefaultStatsAPI.ini"
    echo  OK: %DIR2%\DefaultStatsAPI.ini
    set "WRITTEN=1"
)

echo.
if "%WRITTEN%"=="1" (
    echo  Listo^^! Reinicia Rocket League para aplicar los cambios.
) else (
    echo  ERROR: No se encontro la carpeta de instalacion de Rocket League.
    echo.
    echo  Rutas verificadas:
    echo    %DIR1%
    echo    %DIR2%
    echo.
    echo  Si instalaste el juego en otra ubicacion, edita este archivo
    echo  manualmente y agrega:
    echo.
    echo    [TAGame.MatchStatsExporter_TA]
    echo    PacketSendRate=60
    echo    Port=49123
)

echo.
pause
