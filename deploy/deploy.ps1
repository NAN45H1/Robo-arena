# Deploys ./site to an UpCloud (or any Ubuntu) server over SSH.
# Usage: .\deploy\deploy.ps1 -Ip 81.27.101.39 [-Key ~\.ssh\upcloud_robot_arena] [-User root]
param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [string]$Key = "$env:USERPROFILE\.ssh\upcloud_robot_arena",
    [string]$User = 'root'
)
$ErrorActionPreference = 'Stop'
$ssh = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$scp = "$env:WINDIR\System32\OpenSSH\scp.exe"
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'site'
$opts = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new')
$target = "$User@$Ip"

Write-Host "Uploading $site -> ${target}:/tmp/ra-upload"
& $ssh @opts $target 'rm -rf /tmp/ra-upload /tmp/setup-server.sh'
if ($LASTEXITCODE -ne 0) { throw 'SSH connection failed' }
& $scp @opts -r -q $site "${target}:/tmp/ra-upload"
if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
& $scp @opts -q (Join-Path $PSScriptRoot 'setup-server.sh') "${target}:/tmp/setup-server.sh"
if ($LASTEXITCODE -ne 0) { throw 'Upload of setup script failed' }

Write-Host 'Configuring nginx and swapping in the new site'
& $ssh @opts $target "sed -i 's/\r$//' /tmp/setup-server.sh && bash /tmp/setup-server.sh"
if ($LASTEXITCODE -ne 0) { throw 'Remote setup failed' }

Write-Host "Live at http://$Ip/"
