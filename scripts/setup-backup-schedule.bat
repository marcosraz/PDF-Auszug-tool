@echo off
REM Setup daily backup at 2 AM via Windows Task Scheduler
REM Run this script as Administrator

schtasks /create /tn "PDF-Auszug Backup" /tr "\"%~dp0backup.bat\"" /sc daily /st 02:00 /f

if %ERRORLEVEL% EQU 0 (
    echo Scheduled daily backup at 02:00
    echo Task name: "PDF-Auszug Backup"
    echo.
    echo To verify: schtasks /query /tn "PDF-Auszug Backup"
    echo To remove: schtasks /delete /tn "PDF-Auszug Backup" /f
) else (
    echo ERROR: Failed to create scheduled task.
    echo Make sure to run this script as Administrator.
)
