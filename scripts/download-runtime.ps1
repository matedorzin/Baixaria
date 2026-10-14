$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$binDirectory = Join-Path $repoRoot 'bin'
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (-not $tempRoot) { throw 'Não foi possível localizar uma pasta temporária.' }
$tempDirectory = Join-Path $tempRoot 'baixaria-runtime'
New-Item -ItemType Directory -Force -Path $binDirectory, $tempDirectory | Out-Null

function Download-File([string]$Uri, [string]$Path) {
  Invoke-WebRequest -Uri $Uri -OutFile $Path -Headers @{ 'User-Agent' = 'Baixaria-release-workflow' }
}

function Get-GitHubReleaseAsset([string]$Repository, [string]$AssetName) {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'Baixaria-release-workflow'
  }
  $asset = $release.assets | Where-Object name -eq $AssetName | Select-Object -First 1
  if (-not $asset) {
    throw "O asset $AssetName não foi encontrado no release mais recente de $Repository."
  }

  return $asset
}

function Download-GitHubAsset([string]$Repository, [string]$AssetName, [string]$Destination) {
  $asset = Get-GitHubReleaseAsset $Repository $AssetName
  Download-File $asset.browser_download_url $Destination

  if ($asset.digest -notmatch '^sha256:([0-9a-fA-F]{64})$') {
    throw "O GitHub não forneceu um SHA-256 verificável para $Repository/$AssetName."
  }

  $expected = $Matches[1].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "O checksum SHA-256 de $AssetName não confere."
  }

  return $asset
}

$ytdlpPath = Join-Path $binDirectory 'yt-dlp.exe'
$ytdlpAsset = Download-GitHubAsset 'yt-dlp/yt-dlp' 'yt-dlp.exe' $ytdlpPath

$denoZip = Join-Path $tempDirectory 'deno.zip'
$denoAssetName = 'deno-x86_64-pc-windows-msvc.zip'
$denoAsset = Get-GitHubReleaseAsset 'denoland/deno' $denoAssetName
$denoChecksumAsset = Get-GitHubReleaseAsset 'denoland/deno' "$denoAssetName.sha256sum"
Download-File $denoAsset.browser_download_url $denoZip
$denoChecksumPath = Join-Path $tempDirectory 'deno.sha256sum'
Download-File $denoChecksumAsset.browser_download_url $denoChecksumPath
$denoExpected = [regex]::Match((Get-Content -Raw -LiteralPath $denoChecksumPath), '[0-9a-fA-F]{64}').Value.ToLowerInvariant()
$denoActual = (Get-FileHash -Algorithm SHA256 -LiteralPath $denoZip).Hash.ToLowerInvariant()
if (-not $denoExpected -or $denoActual -ne $denoExpected) {
  throw 'O checksum SHA-256 do Deno não confere.'
}
Expand-Archive -LiteralPath $denoZip -DestinationPath $tempDirectory -Force
Copy-Item -LiteralPath (Join-Path $tempDirectory 'deno.exe') -Destination (Join-Path $binDirectory 'deno.exe') -Force

$ffmpegZip = Join-Path $tempDirectory 'ffmpeg.zip'
$ffmpegChecksumPath = Join-Path $tempDirectory 'ffmpeg.sha256'
Download-File 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $ffmpegZip
Download-File 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256' $ffmpegChecksumPath
$ffmpegExpected = [regex]::Match((Get-Content -Raw -LiteralPath $ffmpegChecksumPath), '[0-9a-fA-F]{64}').Value.ToLowerInvariant()
$ffmpegActual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ffmpegZip).Hash.ToLowerInvariant()
if (-not $ffmpegExpected -or $ffmpegActual -ne $ffmpegExpected) {
  throw 'O checksum SHA-256 do pacote FFmpeg não confere.'
}
$ffmpegExtract = Join-Path $tempDirectory 'ffmpeg'
Expand-Archive -LiteralPath $ffmpegZip -DestinationPath $ffmpegExtract -Force
$ffmpegExe = Get-ChildItem -LiteralPath $ffmpegExtract -Filter ffmpeg.exe -File -Recurse | Select-Object -First 1
$ffprobeExe = Get-ChildItem -LiteralPath $ffmpegExtract -Filter ffprobe.exe -File -Recurse | Select-Object -First 1
if (-not $ffmpegExe -or -not $ffprobeExe) {
  throw 'O pacote FFmpeg não contém ffmpeg.exe e ffprobe.exe.'
}
Copy-Item -LiteralPath $ffmpegExe.FullName -Destination (Join-Path $binDirectory 'ffmpeg.exe') -Force
Copy-Item -LiteralPath $ffprobeExe.FullName -Destination (Join-Path $binDirectory 'ffprobe.exe') -Force

Write-Output "yt-dlp $($ytdlpAsset.name) ($($ytdlpAsset.digest))"
Write-Output "Deno $($denoAsset.name)"
Write-Output 'FFmpeg Essentials verificado por SHA-256.'
