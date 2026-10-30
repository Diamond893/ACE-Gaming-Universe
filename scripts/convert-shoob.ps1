param(
    [int]$BatchSize = 999999,
    [string]$OnlyId = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$jsonPath = Join-Path $root "data\shoobCards.json"
$outputDir = Join-Path $root "data\card_media"
$tempDir = Join-Path $outputDir "_temp"

New-Item -ItemType Directory -Force -Path $outputDir, $tempDir | Out-Null

foreach ($tool in @("ffmpeg", "ffprobe", "magick")) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is not installed or unavailable in PATH."
    }
}

# Load and flatten the Shoob catalog
$catalog = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 |
    ConvertFrom-Json

$allCards = @($catalog | ForEach-Object { $_ })

Write-Host "Total cards loaded: $($allCards.Count)"

# Select Tier 6 and Tier S cards
$cards = @(
    $allCards | Where-Object {
        $tier = ([string]$_.tier).Trim().ToUpper()

        ($tier -eq "6" -or $tier -eq "S") -and
        $_.id -and
        $_.image
    }
)

if ($OnlyId) {
    $cards = @(
        $cards | Where-Object {
            [string]$_.id -eq $OnlyId
        }
    )
}

Write-Host "Found $($cards.Count) matching cards." -ForegroundColor Cyan

$converted = 0
$skipped = 0
$failed = 0
$processed = 0

foreach ($card in $cards) {

    $id = [string]$card.id
    $mp4 = Join-Path $outputDir "$id.mp4"

    # Existing conversions do not consume batch slots.
    if ((Test-Path $mp4) -and ((Get-Item $mp4).Length -gt 0)) {
        $skipped++
        continue
    }

    if ($processed -ge $BatchSize) {
        break
    }

    $processed++

    $inputFile = Join-Path $tempDir "$id.source"
    $partialMp4 = Join-Path $tempDir "$id.mp4"

    Write-Host "`n[$processed/$BatchSize] $($card.name)" -ForegroundColor Cyan
    Write-Host "ID: $id"

    try {

        Remove-Item $inputFile, $partialMp4 -Force -ErrorAction SilentlyContinue

        # Download the original media
        Invoke-WebRequest `
            -Uri $card.image `
            -OutFile $inputFile `
            -UseBasicParsing `
            -TimeoutSec 60

        # Count animation frames with ImageMagick
        $identifyOutput = & magick identify -format "%s`n" $inputFile 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "ImageMagick could not read the downloaded media."
        }

        $frames = @(
            $identifyOutput |
                Where-Object { "$_".Trim() -match '^\d+$' }
        ).Count

        Write-Host "Frames detected: $frames"

        if ($frames -le 1) {
            Write-Host "SKIPPED: Static media." -ForegroundColor Yellow
            $skipped++
            continue
        }

        # Encode the animation as WhatsApp-compatible MP4
        & ffmpeg `
            -hide_banner `
            -loglevel error `
            -y `
            -i $inputFile `
            -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" `
            -c:v libx264 `
            -pix_fmt yuv420p `
            -an `
            -movflags +faststart `
            $partialMp4

        if ($LASTEXITCODE -ne 0) {
            throw "FFmpeg conversion failed."
        }

        if (!(Test-Path $partialMp4)) {
            throw "FFmpeg did not produce an MP4."
        }

        # Verify the output contains multiple video frames
        $frameCount = & ffprobe `
            -v error `
            -select_streams v:0 `
            -count_packets `
            -show_entries stream=nb_read_packets `
            -of default=noprint_wrappers=1:nokey=1 `
            $partialMp4

        if (
            $LASTEXITCODE -ne 0 -or
            !("$frameCount".Trim() -match '^\d+$') -or
            [int]("$frameCount".Trim()) -le 1
        ) {
            throw "The generated MP4 has insufficient frames."
        }

        Move-Item -LiteralPath $partialMp4 -Destination $mp4 -Force

        $converted++
        Write-Host "SUCCESS: $id.mp4" -ForegroundColor Green

    } catch {

        $failed++
        Write-Warning "FAILED $id : $($_.Exception.Message)"

    } finally {

        Remove-Item $inputFile, $partialMp4 `
            -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "AGU SHOOB ANIMATION CONVERSION"
Write-Host "================================"
Write-Host "Converted: $converted"
Write-Host "Skipped:   $skipped"
Write-Host "Failed:    $failed"
Write-Host "Processed: $processed"