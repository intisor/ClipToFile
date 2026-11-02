# ClipToFile - Automatic Background Clipboard-to-File Worker for Gemini and AI Web

Add-Type -AssemblyName System.Windows.Forms

# -------------------------------------------------------------
# Configuration: Character Cutoff
# Standard text/prompts (< 2,500 chars) remain normal text.
# Large articles, code, or logs (>= 2,500 chars) convert to file.
# -------------------------------------------------------------
$charCutoff = 2500

$targetDir = "C:\Users\HomePC\Desktop\Coded\clipboard-ai-worker\clips"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [*] ClipToFile Auto-Worker is ACTIVE" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Short copies (< $charCutoff chars) stay as normal text." -ForegroundColor Gray
Write-Host " Huge copies (>= $charCutoff chars) auto-convert to file for Gemini/AI." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Leave this window minimized. Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

$lastConvertedHash = ""

while ($true) {
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $text = [System.Windows.Forms.Clipboard]::GetText()
            if ($text) {
                $trimmed = $text.Trim()
                
                # Only convert when content exceeds cutoff limit
                if ($trimmed.Length -ge $charCutoff) {
                    $bytes = $utf8NoBom.GetBytes($trimmed)
                    $md5 = [System.Security.Cryptography.MD5]::Create()
                    $hash = [System.BitConverter]::ToString($md5.ComputeHash($bytes))
                    
                    if ($hash -ne $lastConvertedHash) {
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
                        $fileName = $prefix + "_" + $timestamp + "." + $ext
                        $filePath = Join-Path $targetDir $fileName

                        # Write UTF-8 without BOM
                        [System.IO.File]::WriteAllText($filePath, $trimmed, $utf8NoBom)

                        # Set Windows Clipboard to file drop
                        $fileList = New-Object System.Collections.Specialized.StringCollection
                        $fileList.Add($filePath)
                        [System.Windows.Forms.Clipboard]::SetFileDropList($fileList)

                        $lastConvertedHash = $hash
                        $now = (Get-Date).ToString("HH:mm:ss")
                        $charCount = $trimmed.Length

                        Write-Host "[$now] [+] Huge text detected ($charCount chars >= $charCutoff)!" -ForegroundColor Cyan
                        Write-Host "   Created file: $fileName" -ForegroundColor Yellow
                        Write-Host "   Ready to paste (Ctrl+V) into Gemini Web!" -ForegroundColor Green
                        [System.Console]::Beep(1200, 100)
                    }
                }
            }
        }
    } catch {
        # ignore transient clipboard errors
    }
    Start-Sleep -Milliseconds 700
}
