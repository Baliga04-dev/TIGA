<# 
.SYNOPSIS
    Start Tiga development environment (Backend + Frontend)

.DESCRIPTION
    This script starts both the FastAPI backend and Vite frontend
    in separate PowerShell windows for development.

.NOTES
    Run from the project root directory:
    .\start_dev.ps1
#>

param(
    [switch]$InstallDeps
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Tiga Development Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$tigaDir = Join-Path $projectRoot "tiga"
$frontendDir = Join-Path $projectRoot "frontend"

# Check if directories exist
if (-not (Test-Path $tigaDir)) {
    Write-Error "tiga directory not found at $tigaDir"
    exit 1
}

if (-not (Test-Path $frontendDir)) {
    Write-Error "frontend directory not found at $frontendDir"
    exit 1
}

# Install dependencies if requested
if ($InstallDeps) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location $tigaDir
    if (Test-Path ".venv") {
        & ".venv\Scripts\pip.exe" install -r requirements.txt
    } else {
        python -m venv .venv
        & ".venv\Scripts\pip.exe" install -r requirements.txt
    }

    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location $frontendDir
    npm install
    Set-Location $projectRoot
}

# Start backend in new window
Write-Host "Starting backend server..." -ForegroundColor Green
$backendCmd = "cd '$tigaDir'; & '.venv\Scripts\python.exe' main.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start frontend in new window
Write-Host "Starting frontend dev server..." -ForegroundColor Green
$frontendCmd = "cd '$frontendDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Development servers starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Gray
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Gray
Write-Host "API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to exit this launcher (servers keep running)..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")