# AGU / NYX - Tier 6 animated WebP to WhatsApp-compatible MP4.
# Run from AGU root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\convert-t6.ps1 -OnlyId EVENT-001
param([string]$OnlyId = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $root 'data\eventCards.json'
$outputDir = Join-Path $root 'data\event_media'
$tempDir = Join-Path $outputDir '_temp'

foreach ($command in @('magick', 'ffmpeg')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Missing command: $command. Open a new PowerShell window and try $command -version."
    }
}
if (-not (Test-Path -LiteralPath $catalogPath)) { throw "Missing catalog: $catalogPath" }
New-Item -ItemType Directory -Force -Path $outputDir, $tempDir | Out-Null

$cards = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("Loaded {0} event card(s) from {1}" -f @($cards).Count, $catalogPath)
$matched = 0; $successes = 0; $skipped = 0; $failures = 0

foreach ($card in $cards) {
    if ([string]$card.tier -ne '6') { continue }
    $id = [string]$card.id
    if ($OnlyId -and $OnlyId -ne $id) { continue }
    $url = [string]$card.image
    $matched++

    if ($id -notmatch '^[A-Za-z0-9_-]+$' -or $url -notmatch '^https://') {
        Write-Warning "Bad card ID or HTTPS image URL: $id"
        $failures++
        continue
    }

    $sourceFile = Join-Path $tempDir "$id.webp"
    $gifFile = Join-Path $tempDir "$id.gif"
    $mp4File = Join-Path $outputDir "$id.mp4"

    if ((Test-Path -LiteralPath $mp4File) -and (Get-Item -LiteralPath $mp4File).Length -gt 0) {
        Write-Host "SKIP (already converted): $id"
        $skipped++
        continue
    }

    Write-Host "`nConverting: $id"
    $converted = $false
    try {
        Write-Host '  [1/4] Downloading WebP...'
        Invoke-WebRequest -Uri $url -OutFile $sourceFile -UseBasicParsing -ErrorAction Stop
        if (-not (Test-Path -LiteralPath $sourceFile) -or (Get-Item -LiteralPath $sourceFile).Length -lt 100) {
            throw 'Download is missing or too small.'
        }

        Write-Host '  [2/4] Counting SOURCE WebP frames with ImageMagick...'
        # Do not append [0] here: ImageMagick would load ONLY the first frame.
        # One scene index is emitted for each frame, giving a reliable count.
        $sourceScenes = @(& magick identify -format '%s\n' $sourceFile)
        if ($LASTEXITCODE -ne 0) { throw 'ImageMagick could not read the downloaded WebP. See its message above.' }
        $sourceFrames = @($sourceScenes | Where-Object { $_ -match '^\d+$' }).Count
        if ($sourceFrames -lt 1) { throw 'Cannot count frames in the downloaded WebP.' }
        Write-Host "  SOURCE WebP frames: $sourceFrames"
        if ($sourceFrames -lt 2) {
            throw 'The downloaded resized WebP has only one frame (STATIC). You need an animated source URL, not a still preview.'
        }

        Write-Host '  [3/4] Converting animated WebP to GIF...'
        & magick $sourceFile -coalesce $gifFile
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $gifFile)) {
            throw 'ImageMagick could not create the GIF. See its error above.'
        }
        $gifScenes = @(& magick identify -format '%s\n' $gifFile)
        if ($LASTEXITCODE -ne 0) { throw 'ImageMagick cannot read the GIF it just created. See its error above.' }
        $gifFrames = @($gifScenes | Where-Object { $_ -match '^\d+$' }).Count
        if ($gifFrames -lt 2) { throw "Intermediate GIF is not animated ($gifFrames frames)." }
        Write-Host "  GIF frames: $gifFrames"

        Write-Host '  [4/4] Encoding H.264 MP4 with FFmpeg...'
        & ffmpeg -hide_banner -loglevel warning -y -i $gifFile `
            -vf 'fps=20,scale=trunc(iw/2)*2:trunc(ih/2)*2' `
            -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p `
            -an -movflags +faststart $mp4File
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $mp4File)) {
            throw 'FFmpeg could not encode the MP4. See its error above.'
        }
        if ((Get-Item -LiteralPath $mp4File).Length -lt 1000) {
            throw 'Output MP4 is suspiciously small.'
        }
        $converted = $true
        $successes++
        Write-Host "SUCCESS: $mp4File"
    }
    catch {
        $failures++
        Write-Warning ("FAILED {0}: {1}" -f $id, $_.Exception.Message)
        Write-Host "  Source kept for investigation: $sourceFile"
        Write-Host "  Intermediate GIF (if created): $gifFile"
        Remove-Item -LiteralPath $mp4File -Force -ErrorAction SilentlyContinue
    }
    finally {
        if ($converted) {
            Remove-Item -LiteralPath $sourceFile, $gifFile -Force -ErrorAction SilentlyContinue
        }
    }
}
if ($matched -eq 0) { throw "No Tier-6 card matched the ID '$OnlyId'." }
Write-Host "`nFinished: $successes converted, $skipped already converted, $failures failed."
if ($failures -gt 0) { exit 1 }
