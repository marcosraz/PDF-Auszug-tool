@echo off
REM Daily backup of examples and analytics database
REM Backs up to C:\backups\pdf-auszug\YYYYMMDD

set BACKUP_DIR=C:\backups\pdf-auszug\%date:~-4%%date:~3,2%%date:~0,2%
mkdir "%BACKUP_DIR%" 2>nul

echo Backing up examples...
xcopy /E /I /Y "%~dp0..\examples" "%BACKUP_DIR%\examples"

echo Backing up analytics database...
if exist "%~dp0..\backend\data\analytics.db" (
    copy /Y "%~dp0..\backend\data\analytics.db" "%BACKUP_DIR%\analytics.db"
) else (
    echo WARNING: analytics.db not found, skipping.
)

echo Backing up users.json...
if exist "%~dp0..\backend\users.json" (
    copy /Y "%~dp0..\backend\users.json" "%BACKUP_DIR%\users.json"
) else (
    echo WARNING: users.json not found, skipping.
)

echo.
echo Backup complete: %BACKUP_DIR%
