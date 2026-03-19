#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Master VM Default Profile 업데이트 스크립트
    FSLogix 비활성화 → 작업 계정 로그인 안내 → DefProf 실행 → FSLogix 재활성화

.DESCRIPTION
    Horizon Instant Clone Master VM에서 Default Profile을 업데이트할 때 사용합니다.
    FSLogix가 활성화된 상태에서 작업하면 로그오프 시 프로필이 삭제되므로,
    이 스크립트로 FSLogix를 임시 비활성화한 뒤 작업하고 DefProf로 반영합니다.

.PARAMETER Action
    실행할 단계를 지정합니다.
    - Prepare : FSLogix 비활성화 (작업 전)
    - Apply   : DefProf 실행 + FSLogix 재활성화 (작업 후)

.PARAMETER SourceUser
    DefProf로 복사할 소스 사용자 프로필 (Apply 단계에서 필수)
    예: "DOMAIN\adminuser" 또는 "localadmin"

.PARAMETER DefProfPath
    DefProf.exe 경로 (기본값: C:\Tools\DefProf.exe)

.EXAMPLE
    # 1단계: 작업 전 실행 (FSLogix 비활성화)
    .\Update-DefaultProfile.ps1 -Action Prepare

    # 2단계: 작업 계정으로 로그인 → 커스터마이징 → 로그아웃
    # 3단계: 다른 Admin 계정으로 로그인 후 실행

    .\Update-DefaultProfile.ps1 -Action Apply -SourceUser "DOMAIN\adminuser"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Prepare", "Apply")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$SourceUser,

    [Parameter(Mandatory = $false)]
    [string]$DefProfPath = "C:\Tools\DefProf.exe"
)

$fslogixRegPath = "HKLM:\SOFTWARE\FSLogix\Profiles"
$logFile = "C:\ProgramData\FSLogix\Logs\default-profile-update.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] $Message"
    Write-Host $entry
    Add-Content -Path $logFile -Value $entry
}

# ============================================================
# Prepare: FSLogix 비활성화
# ============================================================
if ($Action -eq "Prepare") {

    Write-Log "=== Default Profile Update - Prepare Phase ==="

    # FSLogix 현재 상태 확인
    $current = Get-ItemProperty -Path $fslogixRegPath -ErrorAction SilentlyContinue
    if (-not $current) {
        Write-Log "[ERROR] FSLogix Profiles 레지스트리가 없습니다. FSLogix가 설치되어 있는지 확인하세요."
        exit 1
    }

    Write-Log "현재 FSLogix Enabled = $($current.Enabled)"

    if ($current.Enabled -eq 0) {
        Write-Log "[INFO] FSLogix가 이미 비활성화 상태입니다."
    }
    else {
        Set-ItemProperty -Path $fslogixRegPath -Name "Enabled" -Value 0
        Write-Log "[OK] FSLogix Enabled → 0 (비활성화)"
    }

    # frxsvc 서비스 재시작
    $svc = Get-Service frxsvc -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Restart-Service frxsvc -Force
        Write-Log "[OK] frxsvc 서비스 재시작 완료"
    }

    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  FSLogix가 비활성화되었습니다." -ForegroundColor Cyan
    Write-Host "" -ForegroundColor Cyan
    Write-Host "  다음 단계:" -ForegroundColor Yellow
    Write-Host "  1. 이 세션에서 로그아웃" -ForegroundColor Yellow
    Write-Host "  2. 커스터마이징할 계정으로 로그인" -ForegroundColor Yellow
    Write-Host "     (Domain Admin 또는 작업용 계정)" -ForegroundColor Yellow
    Write-Host "  3. 바탕화면, 앱 설정, 레지스트리 등 작업" -ForegroundColor Yellow
    Write-Host "  4. 로그아웃" -ForegroundColor Yellow
    Write-Host "  5. 다른 Admin 계정으로 로그인" -ForegroundColor Yellow
    Write-Host "  6. 아래 명령 실행:" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host '  .\Update-DefaultProfile.ps1 -Action Apply -SourceUser "DOMAIN\user"' -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Cyan
}

# ============================================================
# Apply: DefProf 실행 + FSLogix 재활성화
# ============================================================
if ($Action -eq "Apply") {

    Write-Log "=== Default Profile Update - Apply Phase ==="

    if (-not $SourceUser) {
        Write-Log "[ERROR] -SourceUser 파라미터가 필요합니다."
        Write-Host '예: .\Update-DefaultProfile.ps1 -Action Apply -SourceUser "DOMAIN\adminuser"' -ForegroundColor Red
        exit 1
    }

    # 소스 사용자 프로필 경로 확인
    $username = $SourceUser.Split("\")[-1]
    $profilePath = "C:\Users\$username"

    if (-not (Test-Path $profilePath)) {
        Write-Log "[ERROR] 프로필 경로를 찾을 수 없습니다: $profilePath"
        Write-Log "        작업 계정으로 로그인 후 로그아웃했는지 확인하세요."
        Write-Log "        FSLogix가 비활성화 상태였는지 확인하세요 (Prepare 단계 먼저 실행)."
        exit 1
    }

    # 소스 프로필이 현재 로드되어 있는지 확인
    $loadedProfiles = Get-CimInstance Win32_UserProfile | Where-Object { $_.Loaded -eq $true }
    $sourceLoaded = $loadedProfiles | Where-Object { $_.LocalPath -eq $profilePath }
    if ($sourceLoaded) {
        Write-Log "[ERROR] 소스 프로필이 현재 로그인 상태입니다: $profilePath"
        Write-Log "        작업 계정을 로그아웃한 후 다른 Admin 계정에서 이 스크립트를 실행하세요."
        exit 1
    }

    Write-Log "소스 프로필 확인: $profilePath"

    # Default Profile 백업
    $backupPath = "C:\Users\Default.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    if (Test-Path "C:\Users\Default") {
        Copy-Item "C:\Users\Default" $backupPath -Recurse -Force
        Write-Log "[OK] Default Profile 백업: $backupPath"
    }

    # DefProf 실행
    if (Test-Path $DefProfPath) {
        Write-Log "DefProf 실행: $DefProfPath $SourceUser"
        & $DefProfPath $SourceUser
        $defprofExit = $LASTEXITCODE
        if ($defprofExit -eq 0) {
            Write-Log "[OK] DefProf 완료 (exit code: $defprofExit)"
        }
        else {
            Write-Log "[WARN] DefProf exit code: $defprofExit (로그를 확인하세요)"
        }
    }
    else {
        Write-Log "[WARN] DefProf.exe를 찾을 수 없습니다: $DefProfPath"
        Write-Log "       수동 복사를 수행합니다..."

        # DefProf 없을 때 수동 복사 fallback
        Rename-Item "C:\Users\Default" "C:\Users\Default.old_$(Get-Date -Format 'yyyyMMdd_HHmmss')" -ErrorAction SilentlyContinue
        robocopy $profilePath "C:\Users\Default" /E /COPYALL /XJ `
            /XD "AppData\Local\Temp" "AppData\Local\Microsoft\Windows\INetCache" `
            /XF "NTUSER.DAT.LOG*" "ntuser.dat.LOG*" "UsrClass.dat.LOG*" /NFL /NDL /NJH /NJS
        Write-Log "[OK] robocopy 프로필 복사 완료"

        # NTUSER.DAT 복사
        reg load HKU\TempDefaultHive "$profilePath\NTUSER.DAT" 2>$null
        if ($LASTEXITCODE -eq 0) {
            reg save HKU\TempDefaultHive "C:\Users\Default\NTUSER.DAT" /y 2>$null
            reg unload HKU\TempDefaultHive 2>$null
            Write-Log "[OK] NTUSER.DAT 레지스트리 하이브 복사 완료"
        }
        else {
            Copy-Item "$profilePath\NTUSER.DAT" "C:\Users\Default\NTUSER.DAT" -Force
            Write-Log "[WARN] reg load 실패 — 직접 파일 복사로 대체"
        }

        # 권한 재설정
        icacls "C:\Users\Default" /reset /T /C /Q
        Write-Log "[OK] Default Profile 권한 재설정 완료"
    }

    # Default Profile 업데이트 확인
    if (Test-Path "C:\Users\Default\NTUSER.DAT") {
        $dat = Get-Item "C:\Users\Default\NTUSER.DAT" -Force
        Write-Log "[OK] Default Profile NTUSER.DAT 확인 (Size: $([math]::Round($dat.Length/1KB)) KB, Modified: $($dat.LastWriteTime))"
    }
    else {
        Write-Log "[ERROR] C:\Users\Default\NTUSER.DAT 가 없습니다!"
        exit 1
    }

    # 작업 계정 프로필 정리
    Write-Host ""
    $cleanup = Read-Host "작업 계정 프로필($profilePath)을 삭제하시겠습니까? (Y/N)"
    if ($cleanup -eq "Y") {
        Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -eq $profilePath } | Remove-CimInstance
        Write-Log "[OK] 작업 계정 프로필 삭제: $profilePath"
    }
    else {
        Write-Log "[SKIP] 작업 계정 프로필 유지: $profilePath"
    }

    # FSLogix 재활성화
    Set-ItemProperty -Path $fslogixRegPath -Name "Enabled" -Value 1
    Write-Log "[OK] FSLogix Enabled → 1 (재활성화)"

    $svc = Get-Service frxsvc -ErrorAction SilentlyContinue
    if ($svc) {
        Restart-Service frxsvc -Force
        Write-Log "[OK] frxsvc 서비스 재시작 완료"
    }

    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  Default Profile 업데이트 완료!" -ForegroundColor Green
    Write-Host "  FSLogix 재활성화 완료!" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "  다음 단계:" -ForegroundColor Yellow
    Write-Host "  1. VM 종료" -ForegroundColor Yellow
    Write-Host "  2. Horizon Console → Snapshot 생성" -ForegroundColor Yellow
    Write-Host "  3. Push Image 실행" -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor Green

    Write-Log "=== Default Profile Update 완료 ==="
}
