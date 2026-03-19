#Requires -RunAsAdministrator
<#
.SYNOPSIS
    FSLogix redirections.xml 미동작 진단 스크립트
    VDI 세션에 로그인한 상태에서 실행하세요.

.DESCRIPTION
    redirections.xml이 정상 적용되지 않는 원인을 자동 진단합니다.
    - FSLogix 버전 확인
    - 로컬 레지스트리 vs GPO 정책 비교
    - 실제 적용되는 VHDLocations / RedirXMLSourceFolder 판단
    - redirections.xml 파일 존재 및 인코딩 확인
    - 활성 리다이렉트 목록 확인
    - FSLogix 로그에서 redirect 관련 항목 추출

.EXAMPLE
    .\fslogix-redirections-diagnostic.ps1
#>

$reportFile = "C:\ProgramData\FSLogix\Logs\redirections-diagnostic-$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

function Write-Report {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
    Add-Content -Path $reportFile -Value $Message
}

Write-Report "=============================================" "Cyan"
Write-Report "  FSLogix Redirections Diagnostic Report" "Cyan"
Write-Report "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "Cyan"
Write-Report "  User: $env:USERNAME" "Cyan"
Write-Report "  Computer: $env:COMPUTERNAME" "Cyan"
Write-Report "=============================================" "Cyan"

# ============================================================
# 1. FSLogix Version
# ============================================================
Write-Report "`n--- [1] FSLogix Version ---"
$frxPath = "C:\Program Files\FSLogix\Apps\frx.exe"
if (Test-Path $frxPath) {
    $ver = (Get-Item $frxPath).VersionInfo
    Write-Report "  Version: $($ver.FileVersion)"
    Write-Report "  Product: $($ver.ProductName)"

    # Version check
    $verNum = [version]$ver.FileVersion
    if ($verNum -lt [version]"2.9.8612.60056") {
        Write-Report "  [WARN] FSLogix 2210 hotfix 1 (2.9.8612.60056) 이상 권장" "Yellow"
        Write-Report "         구버전에서 redirections.xml 관련 버그가 있을 수 있음"
    } else {
        Write-Report "  [OK] 버전 양호" "Green"
    }
} else {
    Write-Report "  [ERROR] FSLogix가 설치되어 있지 않습니다: $frxPath" "Red"
}

# ============================================================
# 2. Registry: Local vs GPO
# ============================================================
Write-Report "`n--- [2] Registry Settings (Local vs GPO) ---"

$localReg = Get-ItemProperty "HKLM:\SOFTWARE\FSLogix\Profiles" -ErrorAction SilentlyContinue
$gpoReg   = Get-ItemProperty "HKLM:\SOFTWARE\Policies\FSLogix\Profiles" -ErrorAction SilentlyContinue

Write-Report "`n  [Local Registry] HKLM:\SOFTWARE\FSLogix\Profiles"
if ($localReg) {
    Write-Report "    Enabled:              $($localReg.Enabled)"
    Write-Report "    VHDLocations:         $($localReg.VHDLocations)"
    Write-Report "    RedirXMLSourceFolder: $($localReg.RedirXMLSourceFolder)"
    Write-Report "    VolumeType:           $($localReg.VolumeType)"
    Write-Report "    SizeInMBs:            $($localReg.SizeInMBs)"
    Write-Report "    DeleteLocalWhenVHD:   $($localReg.DeleteLocalProfileWhenVHDShouldApply)"
} else {
    Write-Report "    [WARN] 로컬 레지스트리 없음" "Yellow"
}

Write-Report "`n  [GPO Policy] HKLM:\SOFTWARE\Policies\FSLogix\Profiles"
if ($gpoReg) {
    Write-Report "    Enabled:              $($gpoReg.Enabled)" "Yellow"
    Write-Report "    VHDLocations:         $($gpoReg.VHDLocations)" "Yellow"
    Write-Report "    RedirXMLSourceFolder: $($gpoReg.RedirXMLSourceFolder)" "Yellow"
    Write-Report ""
    Write-Report "    [WARN] GPO 정책이 설정되어 있습니다. GPO가 로컬 레지스트리를 덮어씁니다!" "Yellow"
} else {
    Write-Report "    (GPO policy not set — 로컬 레지스트리가 적용됨)" "Green"
}

# ============================================================
# 3. Effective Settings
# ============================================================
Write-Report "`n--- [3] Effective Settings (실제 적용값) ---"

$effectiveVHD = if ($gpoReg -and $gpoReg.VHDLocations) { $gpoReg.VHDLocations } else { $localReg.VHDLocations }
$effectiveRedir = if ($gpoReg -and $gpoReg.RedirXMLSourceFolder) { $gpoReg.RedirXMLSourceFolder }
                  elseif ($localReg -and $localReg.RedirXMLSourceFolder) { $localReg.RedirXMLSourceFolder }
                  else { $null }

Write-Report "  Effective VHDLocations:         $effectiveVHD"
Write-Report "  Effective RedirXMLSourceFolder: $(if ($effectiveRedir) { $effectiveRedir } else { '(not set — defaults to VHDLocations root)' })"

$xmlSearchPath = if ($effectiveRedir) { $effectiveRedir } else { $effectiveVHD }
Write-Report "  XML Search Path:                $xmlSearchPath"

# GPO vs Local 불일치 경고
if ($gpoReg -and $gpoReg.VHDLocations -and $localReg -and $localReg.VHDLocations) {
    if ($gpoReg.VHDLocations -ne $localReg.VHDLocations) {
        Write-Report "`n  [WARN] GPO VHDLocations와 로컬 VHDLocations가 다릅니다!" "Red"
        Write-Report "         GPO:   $($gpoReg.VHDLocations)" "Red"
        Write-Report "         Local: $($localReg.VHDLocations)" "Red"
        Write-Report "         → GPO 경로가 실제 적용됩니다. redirections.xml을 GPO 경로 루트에 배치하세요." "Red"
    }
}

# ============================================================
# 4. redirections.xml File Check
# ============================================================
Write-Report "`n--- [4] redirections.xml File Check ---"

$xmlLocations = @()
if ($xmlSearchPath) { $xmlLocations += "$xmlSearchPath\redirections.xml" }
if ($effectiveVHD -and $effectiveVHD -ne $xmlSearchPath) { $xmlLocations += "$effectiveVHD\redirections.xml" }

$xmlFound = $false
foreach ($xmlPath in $xmlLocations) {
    $exists = Test-Path $xmlPath -ErrorAction SilentlyContinue
    Write-Report "  $xmlPath → $( if ($exists) { 'EXISTS' } else { 'NOT FOUND' } )" $(if ($exists) { "Green" } else { "Red" })

    if ($exists) {
        $xmlFound = $true

        # File size
        $fileInfo = Get-Item $xmlPath
        Write-Report "    Size: $($fileInfo.Length) bytes"
        Write-Report "    Modified: $($fileInfo.LastWriteTime)"

        # Encoding check (BOM)
        try {
            $bytes = [System.IO.File]::ReadAllBytes($xmlPath)
            if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
                Write-Report "    Encoding: UTF-8 with BOM" "Yellow"
                Write-Report "    [WARN] BOM이 파싱 문제를 일으킬 수 있습니다. BOM 없는 UTF-8로 다시 저장하세요." "Yellow"
            } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) {
                Write-Report "    Encoding: UTF-16 LE (BOM)" "Red"
                Write-Report "    [ERROR] UTF-8로 다시 저장해야 합니다." "Red"
            } else {
                Write-Report "    Encoding: UTF-8 (no BOM)" "Green"
            }
        } catch {
            Write-Report "    [WARN] 인코딩 확인 실패: $_" "Yellow"
        }

        # XML parse test
        try {
            [xml]$xml = Get-Content $xmlPath
            $excludeCount = ($xml.FrxProfileFolderRedirection.Exclude | Measure-Object).Count
            Write-Report "    XML Parse: OK ($excludeCount Exclude rules)" "Green"
            foreach ($exc in $xml.FrxProfileFolderRedirection.Exclude) {
                Write-Report "      - Exclude: $($exc.'#text') (Copy=$($exc.Copy))"
            }
        } catch {
            Write-Report "    XML Parse: FAILED" "Red"
            Write-Report "    [ERROR] XML 문법 오류: $_" "Red"
        }
    }
}

if (-not $xmlFound) {
    Write-Report "`n  [ERROR] redirections.xml을 찾을 수 없습니다!" "Red"
    Write-Report "  예상 위치: $xmlSearchPath\redirections.xml"
}

# ============================================================
# 5. Active Redirects (frx list-redirects)
# ============================================================
Write-Report "`n--- [5] Active Redirects (frx list-redirects) ---"
try {
    $redirects = frx list-redirects 2>&1
    if ($redirects) {
        foreach ($line in $redirects) {
            Write-Report "  $line"
        }
    } else {
        Write-Report "  [WARN] 활성 리다이렉트 없음 — redirections.xml이 적용되지 않고 있음" "Yellow"
    }
} catch {
    Write-Report "  [ERROR] frx 명령 실행 실패: $_" "Red"
}

# ============================================================
# 6. FSLogix Profile Log - redirect entries
# ============================================================
Write-Report "`n--- [6] FSLogix Log (redirect/xml related) ---"
$logPattern = "C:\ProgramData\FSLogix\Logs\Profile*.log"
$logFiles = Get-ChildItem $logPattern -ErrorAction SilentlyContinue
if ($logFiles) {
    $matches = Select-String -Path $logPattern -Pattern "redirect|xml|redirection" -Context 1 -ErrorAction SilentlyContinue |
               Select-Object -Last 15
    if ($matches) {
        foreach ($m in $matches) {
            Write-Report "  $($m.Line)"
        }
    } else {
        Write-Report "  [WARN] 로그에 redirect/xml 관련 항목 없음" "Yellow"
        Write-Report "         → FSLogix가 redirections.xml을 인식하지 못하고 있음" "Yellow"
    }
} else {
    Write-Report "  [WARN] FSLogix 프로필 로그 파일 없음" "Yellow"
}

# ============================================================
# 7. VHD Mount Status
# ============================================================
Write-Report "`n--- [7] VHD Mount Status ---"
$vhdVolumes = Get-Volume | Where-Object { $_.FileSystemLabel -like "*Profile*" -or $_.FileSystemLabel -like "*FSLogix*" }
if ($vhdVolumes) {
    foreach ($v in $vhdVolumes) {
        Write-Report "  Drive: $($v.DriveLetter) | Label: $($v.FileSystemLabel) | Size: $([math]::Round($v.Size/1GB, 2)) GB"
    }
} else {
    Write-Report "  [INFO] Profile VHD 볼륨 미감지 (로그인 상태에서 실행해야 합니다)" "Yellow"
}

# ============================================================
# Summary
# ============================================================
Write-Report "`n=============================================" "Cyan"
Write-Report "  Diagnostic Complete" "Cyan"
Write-Report "  Report saved: $reportFile" "Cyan"
Write-Report "=============================================" "Cyan"

Write-Host "`n결과 파일을 확인하세요: $reportFile" -ForegroundColor Green
