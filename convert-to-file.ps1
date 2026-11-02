# Convert Clipboard Text to File for Gemini Web and AI Chats

Add-Type -AssemblyName System.Windows.Forms

# Check if clipboard has text
if (-not [System.Windows.Forms.Clipboard]::ContainsText()) {
    Write-Host "[!] No text found on clipboard. Please copy (Ctrl+C) some text first!" -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    exit
}

$text = [System.Windows.Forms.Clipboard]::GetText()
if (-not $text) {
    Write-Host "[!] Clipboard text is empty." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    exit
}

$trimmed = $text.Trim()
if ($trimmed.Length -eq 0) {
    Write-Host "[!] Clipboard text is empty." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    exit
}

$targetDir = "C:\Users\HomePC\Desktop\Coded\clipboard-ai-worker\clips"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$ext = "txt"
$prefix = "notes"

if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) { 
    $ext = "json"
    $prefix = "data"
}
elseif ($trimmed -match "(?m)^(def |import |class )") { 
    $ext = "py"
    $prefix = "script"
}
elseif ($trimmed -match "(?m)^(import React|function |const )") { 
    $ext = "js"
    $prefix = "code"
}
elseif ($trimmed -match "(?m)^(# |---\n)") { 
    $ext = "md"
    $prefix = "doc"
}

$timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
# Clean, space-free filename for Gemini Web
$fileName = $prefix + "_" + $timestamp + "." + $ext
$filePath = Join-Path $targetDir $fileName

# Write UTF-8 without BOM
[System.IO.File]::WriteAllText($filePath, $trimmed, $utf8NoBom)

$fileList = New-Object System.Collections.Specialized.StringCollection
$fileList.Add($filePath)
[System.Windows.Forms.Clipboard]::SetFileDropList($fileList)

$charCount = $trimmed.Length

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [OK] Successfully converted clipboard to file!" -ForegroundColor Green
Write-Host " File: $fileName ($charCount characters)" -ForegroundColor Yellow
Write-Host " Path: $filePath" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Now switch to Gemini Web (gemini.google.com) and press Ctrl+V" -ForegroundColor Green
Write-Host " It will attach directly as an uploaded file!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

[System.Console]::Beep(1000, 150)
Start-Sleep -Milliseconds 800
