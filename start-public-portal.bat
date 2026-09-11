@echo off
title GGF GeoHub - Servidor y Tunel Publico
echo ========================================================
echo 🌲 INICIANDO GGF GEOHUB + CLOUDFLARE PUBLIC TUNNEL
echo ========================================================
start /b node server/index.js
tools\cloudflared.exe tunnel --url http://localhost:5000
pause
