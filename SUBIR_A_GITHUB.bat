@echo off
title Subir Cambios a GitHub - GGF GeoHub
echo ========================================================
echo   PUBLICANDO GGF GEOHUB EN GITHUB PAGES
echo ========================================================
echo.
echo 1. Procesando capas y datos cartograficos...
call node scripts/export-data.js
echo.
echo 2. Preparando cambios para GitHub...
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "Actualizacion automatica GGF GeoHub"
echo.
echo 3. Subiendo a GitHub...
"C:\Program Files\Git\cmd\git.exe" push origin main
echo.
echo ========================================================
if %ERRORLEVEL% EQU 0 (
    echo [EXITO] Los archivos se sincronizaron con GitHub.
    echo Tu pagina se actualizara en:
    echo https://chulla19.github.io/ggf-geohub/
) else (
    echo [AVISO] Si hubo error, sincronizando cambios...
    "C:\Program Files\Git\cmd\git.exe" push --force origin main
)
echo ========================================================
echo.
pause
