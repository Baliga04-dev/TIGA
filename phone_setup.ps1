<#
.SYNOPSIS
    Lets your phone reach Tiga (which runs in WSL) over your home Wi-Fi. Run it once, as administrator.

.DESCRIPTION
    1. Switches WSL to mirrored networking, so Tiga has your PC's Wi-Fi address (backs up .wslconfig first).
    2. Opens TCP port 8000 for private networks only, in Windows Firewall and in WSL's Hyper-V firewall.
    3. If the Wi-Fi you're on is marked Public, asks whether it is your home Wi-Fi and marks it Private if so.
    Tiga still answers other devices only with the phone remote, and only to a phone that scanned its QR code.

.NOTES
    In PowerShell opened as administrator:
        powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\adithya04\projects\TIGA\phone_setup.ps1
    Then run "wsl --shutdown", open Ubuntu again, and start Tiga (with TIGA_PHONE=on in tiga/.env).

    To undo: Remove-NetFirewallRule -DisplayName "Tiga phone remote"; Remove-NetFirewallHyperVRule -Name TigaPhoneRemote;
    and restore %USERPROFILE%\.wslconfig.bak-tiga (or delete the networkingMode line).
#>
param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'

$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Open PowerShell as administrator (right-click, Run as administrator) and run this again.' -ForegroundColor Yellow
    exit 1
}

# 1. Mirrored networking: WSL shares the PC's network addresses.
$config = Join-Path $env:USERPROFILE '.wslconfig'
$text = if (Test-Path $config) { Get-Content $config -Raw } else { '' }
if ($text -match '(?im)^\s*networkingMode\s*=\s*mirrored\s*$') {
    Write-Host 'WSL already uses mirrored networking.'
} else {
    if (Test-Path $config) { Copy-Item $config "$config.bak-tiga" -Force }
    if ($text -match '(?im)^\s*networkingMode\s*=.*$') {
        $text = $text -replace '(?im)^\s*networkingMode\s*=.*$', 'networkingMode=mirrored'
    } elseif ($text -match '(?im)^\[wsl2\]\s*$') {
        $text = $text -replace '(?im)^\[wsl2\]\s*$', "[wsl2]`r`nnetworkingMode=mirrored"
    } else {
        $text = $text.TrimEnd() + "`r`n[wsl2]`r`nnetworkingMode=mirrored`r`n"
    }
    Set-Content -Path $config -Value $text.TrimStart() -Encoding ascii
    Write-Host "Set networkingMode=mirrored in $config"
}

# 2. The firewall: this one port, private networks only.
$name = 'Tiga phone remote'
if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null
    Write-Host "Windows Firewall: port $Port open on private networks."
}
$wslCreator = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'   # WSL's id in the Hyper-V firewall
if (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
    if (-not (Get-NetFirewallHyperVRule -Name 'TigaPhoneRemote' -ErrorAction SilentlyContinue)) {
        New-NetFirewallHyperVRule -Name 'TigaPhoneRemote' -DisplayName $name -Direction Inbound -VMCreatorId $wslCreator `
            -Protocol TCP -LocalPorts $Port | Out-Null
        Write-Host "WSL's Hyper-V firewall: port $Port open."
    }
}

# 3. Home Wi-Fi as a private network, so the rule above applies (only ever at home).
$network = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | Select-Object -First 1
if ($network -and $network.NetworkCategory -eq 'Public') {
    $answer = Read-Host "Windows treats '$($network.Name)' as a public network, which keeps your phone out. Is it your home Wi-Fi? (y/n)"
    if ($answer -match '^\s*y') {
        Set-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex -NetworkCategory Private
        Write-Host "'$($network.Name)' is now a private network."
    } else {
        Write-Host 'Left as public: the phone remote will work once you are on your home Wi-Fi and it is marked Private.'
    }
}

Write-Host ''
Write-Host 'Done. Now: run "wsl --shutdown", open Ubuntu again, and start Tiga with TIGA_PHONE=on in tiga/.env.' -ForegroundColor Green
Write-Host "Then open Tiga's Settings page on the PC and scan the phone remote's QR code with your phone."
