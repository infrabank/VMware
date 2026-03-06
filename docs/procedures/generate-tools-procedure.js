const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, ExternalHyperlink,
  PageBreak, TableOfContents
} = require('docx');
const fs = require('fs');

// ── 색상 상수 ──────────────────────────────────────────
const C = {
  HEADER_BG   : 'D9E1F2',  // 헤더 배경 (파란 계열)
  CODE_BG     : 'F4F4F4',  // 코드 블록 배경
  NOTE_BG     : 'FFF8DC',  // 노트/경고 배경 (연노랑)
  HIGH_BG     : 'FFE0E0',  // 위험 배경 (연빨강)
  BORDER      : 'AAAAAA',
  CODE_BORDER : '888888',
  BLACK       : '000000',
  DARK_GRAY   : '333333',
  BLUE        : '1F3864',
  WHITE       : 'FFFFFF',
};

// ── 테두리 헬퍼 ────────────────────────────────────────
const border = (color = C.BORDER) => ({ style: BorderStyle.SINGLE, size: 1, color });
const cellBorders = (color = C.BORDER) => ({
  top: border(color), bottom: border(color),
  left: border(color), right: border(color)
});
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noAllBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── 공통 Paragraph 생성기 ──────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  spacing: { before: 60, after: 60 },
  ...opts,
  children: [new TextRun({ text, font: 'Arial', size: 20, color: C.DARK_GRAY, ...opts.run })]
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 160 },
  children: [new TextRun({ text, font: 'Arial', size: 32, bold: true, color: C.BLUE })]
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: C.DARK_GRAY })]
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 180, after: 80 },
  children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: C.DARK_GRAY })]
});

const note = (text, bgColor = C.NOTE_BG) => new Paragraph({
  spacing: { before: 80, after: 80 },
  indent: { left: 360 },
  shading: { fill: bgColor, type: ShadingType.CLEAR },
  children: [new TextRun({ text: '▶  ' + text, font: 'Arial', size: 18, italics: true, color: '664400' })]
});

const danger = (text) => new Paragraph({
  spacing: { before: 80, after: 80 },
  indent: { left: 360 },
  shading: { fill: C.HIGH_BG, type: ShadingType.CLEAR },
  children: [new TextRun({ text: '⚠  ' + text, font: 'Arial', size: 18, bold: true, color: '990000' })]
});

const blank = () => new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun('')] });

// ── 코드 블록 ──────────────────────────────────────────
const codeLines = (lines) => lines.map(line =>
  new Paragraph({
    spacing: { before: 0, after: 0 },
    indent: { left: 240 },
    shading: { fill: C.CODE_BG, type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: '888888' } },
    children: [new TextRun({ text: line, font: 'Courier New', size: 16, color: '1A1A1A' })]
  })
);

const code = (text) => codeLines(text.split('\n'));

// ── 단순 테이블 헬퍼 ───────────────────────────────────
const tCell = (text, opts = {}) => new TableCell({
  borders: cellBorders(opts.borderColor || C.BORDER),
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
  verticalAlign: VerticalAlign.CENTER,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: 'Arial', size: opts.size || 18,
      bold: !!opts.bold, color: opts.color || C.DARK_GRAY })]
  })]
});

const tRow = (cells, isHeader = false) => new TableRow({
  tableHeader: isHeader,
  children: cells
});

// ── 체크리스트 항목 ────────────────────────────────────
const checkItem = (text, checked = false) => new Paragraph({
  numbering: { reference: 'check-list', level: 0 },
  spacing: { before: 40, after: 40 },
  children: [new TextRun({ text, font: 'Arial', size: 19, color: C.DARK_GRAY })]
});

// ══════════════════════════════════════════════════════
//  문서 본문 조립
// ══════════════════════════════════════════════════════
const children = [];

// ── 표지 헤더 ─────────────────────────────────────────
children.push(
  new Paragraph({
    spacing: { before: 0, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'VMware Tools 업그레이드 작업 절차서',
      font: 'Arial', size: 52, bold: true, color: C.BLUE })]
  }),
  new Paragraph({
    spacing: { before: 0, after: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'OPS-VMW-20260305-002  |  vSphere 7.0 U3n  |  2026.03.05',
      font: 'Arial', size: 22, color: '666666' })]
  })
);

// ── 문서 정보 테이블 ───────────────────────────────────
children.push(
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      tRow([tCell('항목', { bg: C.HEADER_BG, bold: true, width: 2000, center: true }),
             tCell('내용', { bg: C.HEADER_BG, bold: true, width: 7360 })], true),
      tRow([tCell('문서번호', { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('OPS-VMW-20260305-002', { width: 7360 })]),
      tRow([tCell('작업명',   { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('VMware Tools 12.5.4 업그레이드 (ESXi VIB 교체 + Windows/Linux 게스트 VM 일괄 업데이트)', { width: 7360 })]),
      tRow([tCell('작업일시', { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('2026년 3월 __일 (__)  __:__ ~ __:__', { width: 7360 })]),
      tRow([tCell('작업자',   { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('', { width: 7360 })]),
      tRow([tCell('승인자',   { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('', { width: 7360 })]),
      tRow([tCell('작성일',   { width: 2000, bold: true, bg: 'F7F9FC' }), tCell('2026년 3월 5일', { width: 7360 })]),
    ]
  }),
  blank()
);

// ── 목차 ──────────────────────────────────────────────
children.push(
  new TableOfContents('목 차', { hyperlink: true, headingStyleRange: '1-3',
    stylesWithLevels: [{ styleId: 'Heading1', level: 1 }, { styleId: 'Heading2', level: 2 }] }),
  new Paragraph({ children: [new PageBreak()] })
);

// ══════════════════════════════════════════════════════
//  1. 작업 개요
// ══════════════════════════════════════════════════════
children.push(h1('1. 작업 개요'));

children.push(h2('1.1 작업 목적'));
children.push(p('ESXi 호스트에 탑재된 VMware Tools VIB를 최신 버전(12.5.4)으로 교체하고, 운영 중인 Windows VM 및 Linux VM의 게스트 Tools를 일괄 업그레이드한다.'));
children.push(p('• Windows VM : PowerCLI Update-Tools NoReboot 방식', { indent: { left: 360 } }));
children.push(p('• Linux VM   : VMware OSP 리포지토리 경유 open-vm-tools 업그레이드', { indent: { left: 360 } }));
children.push(blank());

children.push(h2('1.2 작업 대상'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('대상', { bg: C.HEADER_BG, bold: true, width: 3000 }), tCell('현재 버전', { bg: C.HEADER_BG, bold: true, width: 2500 }), tCell('목표 버전', { bg: C.HEADER_BG, bold: true, width: 3860 })], true),
    tRow([tCell('ESXi 호스트 Tools VIB', { width: 3000 }), tCell('확인 필요', { width: 2500 }), tCell('12.5.4 (Build 24964629)', { width: 3860, bold: true })]),
    tRow([tCell('Windows VM 게스트 Tools', { width: 3000 }), tCell('확인 필요', { width: 2500 }), tCell('12.5.4 (Build 24964629)', { width: 3860, bold: true })]),
    tRow([tCell('Linux VM open-vm-tools', { width: 3000 }), tCell('확인 필요', { width: 2500 }), tCell('최신 지원 버전 (OSP 리포지토리 기준)', { width: 3860 })]),
  ]
}), blank());

children.push(h2('1.3 사용 파일'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('파일명', { bg: C.HEADER_BG, bold: true, width: 6000 }), tCell('용도', { bg: C.HEADER_BG, bold: true, width: 3360 })], true),
    tRow([tCell('VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip', { width: 6000 }), tCell('vLCM Depot 업로드 / esxcli 수동 설치용', { width: 3360 })]),
  ]
}), blank());

children.push(h2('1.4 작업 단계 요약'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('Phase', { bg: C.HEADER_BG, bold: true, width: 1200, center: true }), tCell('내용', { bg: C.HEADER_BG, bold: true, width: 4160 }), tCell('방법', { bg: C.HEADER_BG, bold: true, width: 2200 }), tCell('재부팅', { bg: C.HEADER_BG, bold: true, width: 1800, center: true })], true),
    tRow([tCell('Phase 1', { width: 1200, center: true }), tCell('사전 현황 파악 (Windows + Linux)', { width: 4160 }), tCell('PowerCLI + SSH', { width: 2200 }), tCell('없음', { width: 1800, center: true })]),
    tRow([tCell('Phase 2', { width: 1200, center: true }), tCell('ESXi 호스트 Tools VIB 교체', { width: 4160 }), tCell('vLCM Remediation', { width: 2200 }), tCell('호스트 재부팅', { width: 1800, center: true, bold: true, color: '990000' })]),
    tRow([tCell('Phase 3', { width: 1200, center: true }), tCell('Windows VM Tools 일괄 업그레이드', { width: 4160 }), tCell('PowerCLI NoReboot', { width: 2200 }), tCell('없음 (별도 일정)', { width: 1800, center: true })]),
    tRow([tCell('Phase 4', { width: 1200, center: true }), tCell('Windows VM 업그레이드 결과 검증', { width: 4160 }), tCell('PowerCLI', { width: 2200 }), tCell('없음', { width: 1800, center: true })]),
    tRow([tCell('Phase 5', { width: 1200, center: true }), tCell('Windows VM 재부팅 처리', { width: 4160 }), tCell('PowerCLI', { width: 2200 }), tCell('VM별 Guest Reboot', { width: 1800, center: true, bold: true })]),
    tRow([tCell('Phase 6', { width: 1200, center: true }), tCell('Linux VM open-vm-tools 업그레이드', { width: 4160 }), tCell('PowerCLI Invoke-VMScript', { width: 2200 }), tCell('서비스 재시작만', { width: 1800, center: true })]),
    tRow([tCell('Phase 7', { width: 1200, center: true }), tCell('Linux VM 업그레이드 결과 검증', { width: 4160 }), tCell('PowerCLI + SSH', { width: 2200 }), tCell('없음', { width: 1800, center: true })]),
  ]
}), blank());

children.push(h2('1.5 서비스 영향'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('Phase', { bg: C.HEADER_BG, bold: true, width: 2200 }), tCell('영향 범위', { bg: C.HEADER_BG, bold: true, width: 5360 }), tCell('예상 시간', { bg: C.HEADER_BG, bold: true, width: 1800 })], true),
    tRow([tCell('Phase 2 (ESXi VIB)', { width: 2200 }), tCell('호스트별 순차 재부팅. VM은 vMotion 대피.', { width: 5360 }), tCell('호스트당 15~20분', { width: 1800 })]),
    tRow([tCell('Phase 3 (Windows Tools)', { width: 2200 }), tCell('VM 내 Tools 서비스 재시작 (수 초). 업무 영향 없음.', { width: 5360 }), tCell('VM당 1~3분', { width: 1800 })]),
    tRow([tCell('Phase 5 (Windows 재부팅)', { width: 2200 }), tCell('VM별 OS 재부팅. 유지보수 창 확보 필요.', { width: 5360 }), tCell('VM당 3~5분', { width: 1800 })]),
    tRow([tCell('Phase 6 (Linux Tools)', { width: 2200 }), tCell('vmtoolsd 서비스 재시작 (수 초). 업무 영향 없음.', { width: 5360 }), tCell('VM당 1~2분', { width: 1800 })]),
  ]
}));

// ══════════════════════════════════════════════════════
//  2. 사전 준비
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('2. 사전 준비 (작업 당일 이전 완료)'));

children.push(h2('2.1 파일 준비'));
['VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip 다운로드 완료',
 'Broadcom Support Portal 접근 가능 여부 확인',
 'PowerCLI 최신 버전 설치 확인 (12.x 이상)',
 'vCenter 관리자 계정 준비',
 'Linux VM root 또는 sudo 계정 준비 (Invoke-VMScript 사용 시)',
 'Linux VM 인터넷/내부 리포지토리 접근 가능 여부 확인',
].forEach(t => children.push(p('☐  ' + t, { indent: { left: 360 } })));
children.push(blank());

children.push(h2('2.2 PowerCLI 환경 확인'));
children.push(...code(
`# PowerCLI 버전 확인
Get-PowerCLIVersion

# 인증서 경고 무시 설정 (셀프 서명 인증서 환경)
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false

# vCenter 연결 테스트
$cred = Get-Credential -Message "vCenter 관리자 자격증명 입력"
Connect-VIServer -Server <vcenter-fqdn> -Credential $cred`
), blank());

children.push(h2('2.3 작업 전 환경 스냅샷 (권장)'));
children.push(note('프로덕션 환경의 경우 작업 전 주요 VM 스냅샷 생성 권장. 스냅샷 보관 기간: 작업 완료 확인 후 7일 이내 삭제.'));
children.push(...code(
`# Windows + Linux 전체 VM 스냅샷 생성
Get-VM | Where-Object { $_.PowerState -eq "PoweredOn" } |
    ForEach-Object {
        New-Snapshot -VM $_ \`
            -Name "Pre-ToolsUpgrade-$(Get-Date -Format yyyyMMdd)" \`
            -Description "VMware Tools 12.5.4 업그레이드 전 백업" \`
            -Confirm:$false
        Write-Host "[Snapshot 생성] $($_.Name)"
    }`
), blank());

// ══════════════════════════════════════════════════════
//  3. Phase 1
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('3. Phase 1 — 사전 현황 파악'));

children.push(h2('3.1 ESXi 호스트 현재 Tools VIB 버전 확인'));
children.push(...code(
`# ESXi 호스트 SSH 접속 후 (각 호스트별 실행)
esxcli software vib list | grep -i tools`
));
children.push(blank());
children.push(...code(
`# PowerCLI로 전체 호스트 일괄 확인
Get-VMHost | Sort-Object Name | ForEach-Object {
    $esxcli = Get-EsxCli -VMHost $_ -V2
    $vibs   = $esxcli.software.vib.list.Invoke() |
              Where-Object { $_.Name -like "*tools*" }
    foreach ($vib in $vibs) {
        [PSCustomObject]@{
            Host    = $_.Name
            VIBName = $vib.Name
            Version = $vib.Version
            Date    = $vib.InstallDate
        }
    }
} | Format-Table -AutoSize`
), blank());

children.push(h2('3.2 Windows VM Tools 현황 파악 및 CSV 저장'));
children.push(...code(
`$winAudit = Get-VM |
    Where-Object { $_.Guest.OSFullName -like "*Windows*" } |
    Select-Object Name,
        @{N="PowerState";   E={$_.PowerState}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object ToolsVersion

$winAudit | Export-Csv "C:\\tools-audit-windows-$(Get-Date -Format yyyyMMdd).csv" -NoTypeInformation
$winAudit | Format-Table -AutoSize`
), blank());

children.push(h2('3.3 Linux VM Tools 현황 파악 및 CSV 저장'));
children.push(...code(
`$linuxAudit = Get-VM |
    Where-Object { $_.Guest.OSFullName -notlike "*Windows*" -and
                   $_.Guest.OSFullName -ne "" } |
    Select-Object Name,
        @{N="OS";           E={$_.Guest.OSFullName}},
        @{N="PowerState";   E={$_.PowerState}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}} |
    Sort-Object OS

$linuxAudit | Export-Csv "C:\\tools-audit-linux-$(Get-Date -Format yyyyMMdd).csv" -NoTypeInformation
Write-Host "Linux VM 수: $($linuxAudit.Count) 대"`
));
children.push(note('체크포인트: Windows/Linux 현황 CSV를 작업 기록에 첨부한다.'));

// ══════════════════════════════════════════════════════
//  4. Phase 2 — ESXi VIB 교체
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('4. Phase 2 — ESXi 호스트 Tools VIB 교체 (vLCM)'));

children.push(h2('4.1 vLCM에 Depot 파일 업로드'));
['vSphere Client 접속 → Menu → Lifecycle Manager',
 '[Updates] 탭 → 우측 상단 [Import Updates] 클릭',
 '[Choose File] → VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip 선택 → [Import] 클릭',
 '업로드 완료 확인: [Patch Repository] 탭 → 검색창 "tools" → VMware Tools 12.5.4 항목 확인',
].forEach((t, i) => children.push(p(`${i + 1}.  ${t}`, { indent: { left: 360 } })));
children.push(blank());

children.push(h2('4.2 Baseline 생성'));
['Lifecycle Manager → [Baselines] 탭 → [+ New Baseline] 클릭',
 'Name: VMware-Tools-12.5.4-24964629 / Description: VMware Tools 12.5.4 VIB 호스트 배포 / Type: Patch 또는 Extension',
 'Patches/Extensions 선택 → "VMware Tools" 검색 → 12.5.4 (Build 24964629) 선택 → [Next] → [Finish]',
].forEach((t, i) => children.push(p(`${i + 1}.  ${t}`, { indent: { left: 360 } })));
children.push(blank());

children.push(h2('4.3 Baseline 연결 및 Compliance Check'));
['Hosts & Clusters → 대상 클러스터 선택',
 '[Updates] 탭 → [Attach Baseline or Baseline Group] → "VMware-Tools-12.5.4-24964629" 선택 → [Attach]',
 '[Check Compliance] 클릭 → Non-Compliant 호스트 목록 확인 (모든 호스트 Non-Compliant = 정상)',
].forEach((t, i) => children.push(p(`${i + 1}.  ${t}`, { indent: { left: 360 } })));
children.push(blank());

children.push(h2('4.4 Remediation 실행'));
children.push(danger('위험도: HIGH — 호스트 재부팅 발생. DRS Fully Automated 확인 후 진행.'));
children.push(blank());
children.push(p('Remediation 옵션 설정:'));
['☑  Enable parallel remediation (병렬 처리 — 클러스터 규모에 따라 조정)',
 '☑  Retry on failure (실패 시 재시도)',
 '☑  Migrate powered-on virtual machines (DRS 환경 — VM 자동 대피)',
 '□  Disable Quick Boot (Quick Boot 지원 여부 확인 후 결정)',
].forEach(t => children.push(p(t, { indent: { left: 480 } })));
children.push(blank());

children.push(h2('4.5 VIB 교체 완료 확인'));
children.push(...code(
`Get-VMHost | Sort-Object Name | ForEach-Object {
    $esxcli = Get-EsxCli -VMHost $_ -V2
    $vib    = $esxcli.software.vib.list.Invoke() |
              Where-Object { $_.Name -like "*tools*" } | Select-Object -First 1
    [PSCustomObject]@{
        Host    = $_.Name
        Version = $vib.Version
        Status  = if ($vib.Version -like "*24964629*") { "완료" } else { "미완료" }
    }
} | Format-Table -AutoSize`
));
children.push(note('체크포인트: 전체 호스트 완료 확인 후 Phase 3 진행.'));

// ══════════════════════════════════════════════════════
//  5. Phase 3 — Windows VM 업그레이드
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('5. Phase 3 — Windows VM Tools 일괄 업그레이드 (NoReboot)'));

children.push(h2('5.1 업그레이드 실행 스크립트'));
children.push(...code(
`# 대상: Windows VM (PoweredOn + toolsOld) / 방식: NoReboot
$logFile   = "C:\\tools-upgrade-windows-$(Get-Date -Format yyyyMMdd-HHmm).log"
$batchSize = 5      # 배치당 VM 수
$sleepSec  = 15     # 배치 간 대기 시간(초)

function Write-Log { param($msg)
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" |
        Tee-Object -FilePath $logFile -Append }

$targets = Get-VM | Where-Object {
    $_.Guest.OSFullName                -like "*Windows*" -and
    $_.PowerState                      -eq   "PoweredOn" -and
    $_.Guest.ExtensionData.ToolsStatus -eq   "toolsOld"  }

$batches = for ($i = 0; $i -lt $targets.Count; $i += $batchSize) {
    , $targets[$i..([Math]::Min($i + $batchSize - 1, $targets.Count - 1))] }

$batchNum = 1
foreach ($batch in $batches) {
    foreach ($vm in $batch) {
        try {
            Update-Tools -VM $vm -NoReboot -Confirm:$false
            Write-Log "[OK]  $($vm.Name)"
        } catch { Write-Log "[FAIL] $($vm.Name)  $($_.Exception.Message)" }
    }
    Start-Sleep -Seconds $sleepSec; $batchNum++
}`
), blank());

// ══════════════════════════════════════════════════════
//  6. Phase 4 — Windows 검증
// ══════════════════════════════════════════════════════
children.push(h1('6. Phase 4 — Windows VM 업그레이드 결과 검증'));

children.push(h2('6.1 전체 상태 확인 및 CSV 저장'));
children.push(...code(
`Start-Sleep -Seconds 90  # 업그레이드 반영 대기

$result = Get-VM | Where-Object { $_.Guest.OSFullName -like "*Windows*" } |
    Select-Object Name,
        @{N="ToolsVersion";  E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";   E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="VersionStatus"; E={$_.Guest.ExtensionData.ToolsVersionStatus2}} |
    Sort-Object ToolsStatus

$result | Export-Csv "C:\\tools-result-windows-$(Get-Date -Format yyyyMMdd-HHmm).csv" -NoTypeInformation
$result | Format-Table -AutoSize`
), blank());

children.push(h2('6.2 검증 판단 기준'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('상태', { bg: C.HEADER_BG, bold: true, width: 3600 }), tCell('판단', { bg: C.HEADER_BG, bold: true, width: 2400, center: true }), tCell('조치', { bg: C.HEADER_BG, bold: true, width: 3360 })], true),
    tRow([tCell('toolsOk + guestToolsRunning', { width: 3600 }), tCell('정상 완료', { width: 2400, center: true, color: '006600' }), tCell('없음', { width: 3360 })]),
    tRow([tCell('toolsOk + guestToolsSupportedNew', { width: 3600 }), tCell('재부팅 대기', { width: 2400, center: true, color: '996600' }), tCell('Phase 5 진행', { width: 3360 })]),
    tRow([tCell('toolsOld', { width: 3600 }), tCell('업그레이드 미완료', { width: 2400, center: true, color: '990000' }), tCell('원인 확인 후 재시도', { width: 3360 })]),
    tRow([tCell('toolsNotRunning', { width: 3600 }), tCell('서비스 중지', { width: 2400, center: true, color: '990000' }), tCell('게스트 내 서비스 확인', { width: 3360 })]),
    tRow([tCell('toolsNotInstalled', { width: 3600 }), tCell('미설치', { width: 2400, center: true, color: '990000' }), tCell('신규 설치 필요', { width: 3360 })]),
  ]
}), blank());

// ══════════════════════════════════════════════════════
//  7. Phase 5 — Windows 재부팅
// ══════════════════════════════════════════════════════
children.push(h1('7. Phase 5 — Windows VM 재부팅 처리 (유지보수 창)'));
children.push(note('Restart-VMGuest = OS Graceful Shutdown (하드 리셋 아님). 유지보수 창에 진행.'));
children.push(...code(
`$rebootList = Import-Csv "C:\\tools-reboot-needed-<날짜>.csv"
$batchSize = 3; $waitSec = 60

for ($i = 0; $i -lt $rebootList.Count; $i += $batchSize) {
    $batch = $rebootList[$i..([Math]::Min($i + $batchSize - 1, $rebootList.Count - 1))]
    foreach ($item in $batch) {
        $vm = Get-VM -Name $item.Name -ErrorAction SilentlyContinue
        if ($null -eq $vm -or $vm.PowerState -ne "PoweredOn") { continue }
        Restart-VMGuest -VM $vm -Confirm:$false
        Write-Host "[REBOOT] $($vm.Name)"
    }
    Start-Sleep -Seconds $waitSec
}`
), blank());

// ══════════════════════════════════════════════════════
//  8. Phase 6 — Linux VM 업그레이드
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('8. Phase 6 — Linux VM open-vm-tools 업그레이드'));

children.push(h2('8.1 VMware OSP 리포지토리 개요'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('배포판', { bg: C.HEADER_BG, bold: true, width: 3500 }), tCell('리포지토리 URL', { bg: C.HEADER_BG, bold: true, width: 5860 })], true),
    tRow([tCell('RHEL / CentOS / Rocky 8', { width: 3500 }), tCell('https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/', { width: 5860 })]),
    tRow([tCell('RHEL / CentOS / Rocky 9', { width: 3500 }), tCell('https://packages.vmware.com/tools/esx/7.0latest/rhel9/x86_64/', { width: 5860 })]),
    tRow([tCell('Ubuntu 20.04 (Focal)', { width: 3500 }), tCell('https://packages.vmware.com/tools/esx/7.0latest/ubuntu/dists/focal/', { width: 5860 })]),
    tRow([tCell('Ubuntu 22.04 (Jammy)', { width: 3500 }), tCell('https://packages.vmware.com/tools/esx/7.0latest/ubuntu/dists/jammy/', { width: 5860 })]),
  ]
}), blank());

children.push(h2('8.2 네트워크 환경 판단 및 방법 선택'));
children.push(...code(
`리포지토리 접근 테스트 (Linux 게스트 내부):
curl -sk --max-time 5 https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/ \\
    | grep -i "open-vm-tools" && echo "접근 가능" || echo "접근 불가"`
), blank());

children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('접근 결과', { bg: C.HEADER_BG, bold: true, width: 3200 }), tCell('사용 방법', { bg: C.HEADER_BG, bold: true, width: 6160 })], true),
    tRow([tCell('인터넷 직접 접근 가능', { width: 3200 }), tCell('8.5 OSP 리포지토리 스크립트 실행', { width: 6160 })]),
    tRow([tCell('내부 미러 리포지토리 있음', { width: 3200 }), tCell('8.5 스크립트의 baseurl을 내부 URL로 교체 후 실행', { width: 6160 })]),
    tRow([tCell('Air-gapped (소규모, 10대 이하)', { width: 3200 }), tCell('8.3 패키지 파일 직접 전송 방법', { width: 6160 })]),
    tRow([tCell('Air-gapped (대규모 / 12.5.4 고정)', { width: 3200 }), tCell('8.4 내부 미러 구성 또는 8.5 Bundled ISO 설치', { width: 6160 })]),
  ]
}), blank());

children.push(h2('8.3 Air-gapped 방법 1 — 패키지 파일 직접 전송 (소규모)'));
children.push(p('① 외부 PC에서 패키지 다운로드 (인터넷 연결된 외부 PC):', { run: { bold: true } }));
children.push(...code(
`# RHEL 8 계열
wget https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/open-vm-tools-<버전>.x86_64.rpm

# Ubuntu 20.04 계열
wget https://packages.vmware.com/tools/esx/7.0latest/ubuntu/pool/main/o/open-vm-tools/open-vm-tools_<버전>_amd64.deb`
));
children.push(blank());
children.push(p('② 패키지 파일을 내부 전송:', { run: { bold: true } }));
children.push(p('방법 A: vSphere Client Datastore Browser → Datastore 업로드 → VM 내부 복사', { indent: { left: 360 } }));
children.push(p('방법 B: SCP 직접 전송 →  scp open-vm-tools-*.rpm root@<vm-ip>:/tmp/', { indent: { left: 360 } }));
children.push(blank());
children.push(p('③ Linux 게스트 내부 설치:', { run: { bold: true } }));
children.push(...code(
`# RHEL 계열
rpm -Uvh /tmp/open-vm-tools-*.rpm
# 의존성 오류 시: dnf localinstall /tmp/open-vm-tools-*.rpm -y

# Ubuntu 계열
dpkg -i /tmp/open-vm-tools_*.deb
# 의존성 오류 시: apt-get install -f -y

systemctl restart vmtoolsd && vmware-toolsd --version`
), blank());

children.push(h2('8.4 Air-gapped 방법 2 — 내부 미러 리포지토리 (중대규모)'));
children.push(...code(
`# 외부 PC에서 리포지토리 전체 동기화
wget -r -np -nH --cut-dirs=5 \\
    https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/ \\
    -P /mirror/vmware-tools/rhel8/x86_64/

# Apache 내부 웹서버에 배포
cp -r /mirror/vmware-tools /var/www/html/ && systemctl reload httpd
# 접근 URL: http://internal-mirror.lab.local/vmware-tools/

# Linux 게스트 — 내부 미러 리포지토리 등록 (RHEL)
cat > /etc/yum.repos.d/vmware-tools.repo << 'EOF'
[vmware-tools]
name=VMware Tools (Internal Mirror)
baseurl=http://internal-mirror.lab.local/vmware-tools/rhel8/x86_64/
enabled=1
gpgcheck=0
EOF
dnf upgrade open-vm-tools -y`
), blank());

children.push(h2('8.5 Air-gapped 방법 3 — Bundled ISO 설치 (버전 정확히 12.5.4)'));
children.push(note('전제: Phase 2 ESXi VIB 교체 완료 후 호스트 ISO가 12.5.4로 업데이트된 상태'));
children.push(...code(
`# 컴파일 도구 사전 설치 (RHEL)
dnf install -y gcc make perl kernel-devel kernel-headers

# PowerCLI: Linux VM에 ISO 마운트
$linuxVMs = Get-VM | Where-Object { $_.Guest.OSFullName -notlike "*Windows*" -and $_.PowerState -eq "PoweredOn" }
foreach ($vm in $linuxVMs) { ($vm | Get-View).MountToolsInstaller() }

# Linux 게스트 내부 설치
mount /dev/cdrom /mnt/cdrom
cp /mnt/cdrom/VMwareTools-*.tar.gz /tmp/
cd /tmp && tar -zxf VMwareTools-*.tar.gz && cd vmware-tools-distrib
./vmware-install.pl -d      # -d: 기본값 자동 적용
vmware-toolsd --version     # 출력: version 12.5.4.24964629
umount /mnt/cdrom

# PowerCLI: ISO 마운트 해제
foreach ($vm in $linuxVMs) { ($vm | Get-View).UnmountToolsInstaller() }`
), blank());

children.push(h2('8.6 방법별 비교'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('항목',           { bg: C.HEADER_BG, bold: true, width: 2200 }), tCell('8.5 OSP 직접', { bg: C.HEADER_BG, bold: true, width: 1790, center: true }), tCell('8.3 파일 전송', { bg: C.HEADER_BG, bold: true, width: 1790, center: true }), tCell('8.4 내부 미러', { bg: C.HEADER_BG, bold: true, width: 1790, center: true }), tCell('8.5 Bundled ISO', { bg: C.HEADER_BG, bold: true, width: 1790, center: true })], true),
    tRow([tCell('인터넷 필요',     { width: 2200 }), tCell('필요',       { width: 1790, center: true, color: '990000' }), tCell('불필요', { width: 1790, center: true }), tCell('불필요', { width: 1790, center: true }), tCell('불필요', { width: 1790, center: true })]),
    tRow([tCell('버전 정확도',     { width: 2200 }), tCell('OS 리포 종속', { width: 1790, center: true }), tCell('선택 가능', { width: 1790, center: true }), tCell('선택 가능', { width: 1790, center: true }), tCell('정확히 12.5.4', { width: 1790, center: true, bold: true })]),
    tRow([tCell('구성 복잡도',     { width: 2200 }), tCell('낮음',       { width: 1790, center: true }), tCell('낮음', { width: 1790, center: true }), tCell('중간', { width: 1790, center: true }), tCell('중간', { width: 1790, center: true })]),
    tRow([tCell('커널 업데이트 영향', { width: 2200 }), tCell('없음', { width: 1790, center: true }), tCell('없음', { width: 1790, center: true }), tCell('없음', { width: 1790, center: true }), tCell('재컴파일 필요', { width: 1790, center: true, color: '996600' })]),
  ]
}), blank());

children.push(h2('8.7 PowerCLI 일괄 업그레이드 스크립트 (OSP 방식)'));
children.push(...code(
`$guestCred = Get-Credential -Message "Linux VM root 자격증명"
$logFile   = "C:\\tools-upgrade-linux-$(Get-Date -Format yyyyMMdd-HHmm).log"

$scriptRHEL = @'
cat > /etc/yum.repos.d/vmware-tools.repo << REPO
[vmware-tools]
name=VMware Tools
baseurl=https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/
enabled=1
gpgcheck=1
gpgkey=https://packages.vmware.com/tools/keys/VMWARE-PACKAGING-GPG-RSA-KEY.pub
REPO
dnf upgrade open-vm-tools -y && systemctl restart vmtoolsd
echo "VERSION: $(vmware-toolsd --version)"
'@

$linuxVMs = Get-VM | Where-Object {
    $_.Guest.OSFullName -notlike "*Windows*" -and
    $_.Guest.OSFullName -ne "" -and $_.PowerState -eq "PoweredOn" }

foreach ($vm in $linuxVMs) {
    $isRHEL = $vm.Guest.OSFullName -match "Red Hat|CentOS|Rocky|AlmaLinux"
    if (-not $isRHEL) { continue }   # Ubuntu 스크립트는 동일 패턴으로 추가
    try {
        $r = Invoke-VMScript -VM $vm -ScriptText $scriptRHEL -GuestCredential $guestCred -ScriptType Bash
        Write-Host "[OK] $($vm.Name)  $($r.ScriptOutput.Trim())"
    } catch { Write-Host "[FAIL] $($vm.Name)" }
}`
), blank());

// ══════════════════════════════════════════════════════
//  9. Phase 7 — Linux 검증
// ══════════════════════════════════════════════════════
children.push(h1('9. Phase 7 — Linux VM 업그레이드 결과 검증'));

children.push(h2('9.1 PowerCLI 기반 상태 확인'));
children.push(...code(
`Start-Sleep -Seconds 60   # 서비스 재시작 완료 대기

$linuxResult = Get-VM |
    Where-Object { $_.Guest.OSFullName -notlike "*Windows*" -and $_.Guest.OSFullName -ne "" } |
    Select-Object Name,
        @{N="OS";           E={$_.Guest.OSFullName}},
        @{N="ToolsVersion"; E={$_.Guest.ToolsVersion}},
        @{N="ToolsStatus";  E={$_.Guest.ExtensionData.ToolsStatus}},
        @{N="ToolsRunning"; E={$_.Guest.ExtensionData.ToolsRunningStatus}}

$linuxResult | Export-Csv "C:\\tools-result-linux-$(Get-Date -Format yyyyMMdd-HHmm).csv" -NoTypeInformation
$linuxResult | Format-Table -AutoSize`
), blank());

children.push(h2('9.2 게스트 내부 버전 확인 (SSH)'));
children.push(...code(
`vmware-toolsd --version          # version 12.x.x.xxxxx
systemctl status vmtoolsd         # Active: active (running)
rpm -q open-vm-tools              # RHEL: 설치 패키지 버전
dpkg -l open-vm-tools             # Ubuntu: 설치 패키지 버전`
), blank());

children.push(h2('9.3 Linux VM 검증 판단 기준'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('상태', { bg: C.HEADER_BG, bold: true, width: 3600 }), tCell('판단', { bg: C.HEADER_BG, bold: true, width: 2400, center: true }), tCell('조치', { bg: C.HEADER_BG, bold: true, width: 3360 })], true),
    tRow([tCell('toolsOk + guestToolsRunning', { width: 3600 }), tCell('정상 완료', { width: 2400, center: true, color: '006600' }), tCell('없음', { width: 3360 })]),
    tRow([tCell('toolsOld + guestToolsRunning', { width: 3600 }), tCell('리포 버전 제한', { width: 2400, center: true, color: '996600' }), tCell('OS 리포 최신 버전 확인', { width: 3360 })]),
    tRow([tCell('toolsNotRunning', { width: 3600 }), tCell('서비스 중지', { width: 2400, center: true, color: '990000' }), tCell('systemctl restart vmtoolsd', { width: 3360 })]),
    tRow([tCell('toolsNotInstalled', { width: 3600 }), tCell('미설치', { width: 2400, center: true, color: '990000' }), tCell('신규 설치 필요', { width: 3360 })]),
  ]
}));
children.push(note('Linux open-vm-tools는 OS 리포지토리 제공 버전에 종속됩니다. vCenter에서 toolsOld로 표시되더라도 해당 OS 제공 최신 버전이면 정상입니다.'));

// ══════════════════════════════════════════════════════
//  10. 트러블슈팅
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('10. 트러블슈팅'));

children.push(h2('10.1 Windows — Update-Tools 명령 실패 시'));
children.push(...code(
`$vm = Get-VM -Name "<VM명>"
Update-Tools -VM $vm -NoReboot -Confirm:$false

# Tools 서비스 재시작 후 재시도
Invoke-VMScript -VM $vm -ScriptText "Restart-Service VMTools" \\
    -GuestCredential (Get-Credential) -ScriptType PowerShell`
), blank());

children.push(h2('10.2 Linux — 리포지토리 접근 실패 시'));
children.push(...code(
`# 프록시 설정 (RHEL)
echo "proxy=http://<proxy-host>:<port>" >> /etc/yum.conf

# 접근 테스트
curl -sk --proxy http://<proxy>:<port> \\
    https://packages.vmware.com/tools/esx/7.0latest/rhel8/x86_64/

# Air-gapped: RPM 직접 설치
rpm -Uvh /tmp/open-vm-tools-*.rpm`
), blank());

children.push(h2('10.3 Linux — vmtoolsd 서비스 시작 실패 시'));
children.push(...code(
`journalctl -u vmtoolsd --since "10 minutes ago"
lsmod | grep vmw && modprobe vmw_vmci

# 재설치 (RHEL)
dnf reinstall open-vm-tools -y
# 재설치 (Ubuntu)
apt-get install --reinstall open-vm-tools -y
systemctl restart vmtoolsd`
), blank());

children.push(h2('10.4 vLCM Remediation 실패 시'));
children.push(...code(
`# vLCM 로그 확인 (VCSA SSH)
tail -200 /var/log/vmware/vmware-updatemgr/vum-server/vmware-vum-server.log | grep -i error

# HCL 캐시 초기화 후 재시도
rm /etc/vmware/lifecycle/vsan_hcl_cache.db
service-control --stop vmware-updatemgr && service-control --start vmware-updatemgr`
), blank());

children.push(h2('10.5 vLCM 403 다운로드 오류'));
children.push(p('vSphere Client → Menu → Lifecycle Manager → Settings → Download Sources'));
children.push(p('→ Broadcom Portal에서 새 Token 발급 후 URL 갱신:', { indent: { left: 360 } }));
children.push(...code('   https://dl.broadcom.com/<TOKEN>/PROD/COMP/VMTOOLS/main/vmw-depot-index.xml'));

// ══════════════════════════════════════════════════════
//  11. 롤백
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('11. 롤백 절차'));

children.push(h2('11.1 Windows/Linux 게스트 VM Tools 롤백 (스냅샷)'));
children.push(danger('위험도: HIGH — 스냅샷 이후 변경사항 모두 소실'));
children.push(...code(
`$vm   = Get-VM -Name "<VM명>"
$snap = Get-Snapshot -VM $vm -Name "Pre-ToolsUpgrade-*" |
        Sort-Object Created -Descending | Select-Object -First 1
Set-VM -VM $vm -Snapshot $snap -Confirm:$false`
), blank());

children.push(h2('11.2 Linux — open-vm-tools 이전 버전으로 다운그레이드'));
children.push(...code(
`# RHEL
dnf downgrade open-vm-tools -y && systemctl restart vmtoolsd

# Ubuntu
apt-get install open-vm-tools=<이전버전> -y`
), blank());

children.push(h2('11.3 ESXi 호스트 Tools VIB 롤백'));
children.push(note('호스트 재부팅이 수반됩니다. Maintenance Mode 진입 후 진행.'));
children.push(...code(
`esxcli software vib remove --vibname esx-tools-light
esxcli software vib install -d /vmfs/volumes/datastore1/<이전버전-depot.zip>
esxcli system shutdown reboot -r "VMware Tools VIB rollback"`
));

// ══════════════════════════════════════════════════════
//  12. 작업 체크리스트
// ══════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('12. 작업 체크리스트'));

const checkSection = (title, items) => {
  const result = [h2(title)];
  items.forEach(t => result.push(
    new Paragraph({
      numbering: { reference: 'check-list', level: 0 },
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: t, font: 'Arial', size: 19, color: C.DARK_GRAY })]
    })
  ));
  result.push(blank());
  return result;
};

children.push(...checkSection('사전 준비', [
  'Depot 파일 준비: VMware-Tools-12.5.4-core-offline-depot-ESXi-all-24964629.zip',
  'PowerCLI 연결 테스트 완료',
  'Linux VM root 자격증명 준비 완료',
  'Linux VM 리포지토리 접근 테스트 완료',
  '전체 VM 스냅샷 생성 완료',
  'Windows 현황 CSV 저장 완료 (tools-audit-windows-YYYYMMDD.csv)',
  'Linux 현황 CSV 저장 완료 (tools-audit-linux-YYYYMMDD.csv)',
  'DRS Fully Automated 확인 (Phase 2 전)',
]));

children.push(...checkSection('Phase 2 — ESXi VIB 교체', [
  'vLCM Depot 업로드 완료',
  'Baseline 생성 완료: VMware-Tools-12.5.4-24964629',
  'Compliance Check 완료 (Non-Compliant 확인)',
  'Remediation 완료 (전체 호스트 재부팅 완료)',
  '호스트별 VIB 버전 12.5.4 확인 완료',
]));

children.push(...checkSection('Phase 3~5 — Windows VM', [
  '업그레이드 스크립트 실행 완료 (tools-upgrade-windows-YYYYMMDD-HHmm.log)',
  '결과 CSV 저장 완료 (tools-result-windows-YYYYMMDD-HHmm.csv)',
  'toolsOk VM 수 확인: _____ 대',
  '재부팅 필요 VM 목록 저장 완료',
  '(유지보수 창) VM 재부팅 완료',
  '최종 상태 CSV 저장 완료 (tools-final-windows-YYYYMMDD-HHmm.csv)',
  '전체 Windows VM toolsOk 확인 완료',
]));

children.push(...checkSection('Phase 6~7 — Linux VM', [
  'OSP 리포지토리 접근 테스트 완료 (또는 Air-gapped 방법 선택 완료)',
  '업그레이드 스크립트 실행 완료 (tools-upgrade-linux-YYYYMMDD-HHmm.log)',
  '결과 CSV 저장 완료 (tools-result-linux-YYYYMMDD-HHmm.csv)',
  'toolsOk / toolsRunning VM 수 확인: _____ 대',
  '실패 VM 원인 파악 및 수동 조치 완료',
]));

children.push(...checkSection('작업 종료', [
  '전체 VM 정상 동작 확인 완료',
  '스냅샷 삭제 예약 (작업 완료 후 7일 이내)',
  '작업 결과 보고서 작성 완료',
]));

// ══════════════════════════════════════════════════════
//  13. 참고
// ══════════════════════════════════════════════════════
children.push(h1('13. 참고'));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  rows: [
    tRow([tCell('리소스', { bg: C.HEADER_BG, bold: true, width: 2000 }), tCell('내용', { bg: C.HEADER_BG, bold: true, width: 4360 }), tCell('URL', { bg: C.HEADER_BG, bold: true, width: 3000 })], true),
    tRow([tCell('KB 340', { width: 2000 }), tCell('VMware Tools 버전/빌드 매핑', { width: 4360 }), tCell('https://kb.vmware.com/s/article/340', { width: 3000 })]),
    tRow([tCell('KB 2150799', { width: 2000 }), tCell('VMware Tools 호환성 매트릭스', { width: 4360 }), tCell('https://kb.vmware.com/s/article/2150799', { width: 3000 })]),
    tRow([tCell('KB 2129825', { width: 2000 }), tCell('Linux open-vm-tools 지원 정보', { width: 4360 }), tCell('https://kb.vmware.com/s/article/2129825', { width: 3000 })]),
    tRow([tCell('KB 390121', { width: 2000 }), tCell('vLCM 403 다운로드 오류 (Broadcom 토큰)', { width: 4360 }), tCell('https://knowledge.broadcom.com/external/article/390121', { width: 3000 })]),
    tRow([tCell('KB 2107796', { width: 2000 }), tCell('Quiescing 실패 시 조치', { width: 4360 }), tCell('https://kb.vmware.com/s/article/2107796', { width: 3000 })]),
    tRow([tCell('VMware OSP 리포지토리', { width: 2000 }), tCell('Linux 배포판별 공식 패키지', { width: 4360 }), tCell('https://packages.vmware.com/tools/', { width: 3000 })]),
    tRow([tCell('VMware Tools Docs', { width: 2000 }), tCell('공식 VMware Tools 문서', { width: 4360 }), tCell('https://docs.vmware.com/en/VMware-Tools/', { width: 3000 })]),
  ]
}));

// ══════════════════════════════════════════════════════
//  문서 생성
// ══════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, color: C.BLUE, font: 'Arial' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: C.DARK_GRAY, font: 'Arial' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: C.DARK_GRAY, font: 'Arial' },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [{
      reference: 'check-list',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '☐',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 360 } } } }]
    }]
  },
  sections: [{
    properties: {
      page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' } },
        children: [
          new TextRun({ text: 'VMware Tools 업그레이드 절차서  |  OPS-VMW-20260305-002', font: 'Arial', size: 16, color: '888888' })
        ]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' } },
        children: [
          new TextRun({ text: '- ', font: 'Arial', size: 16, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '888888' }),
          new TextRun({ text: ' -', font: 'Arial', size: 16, color: '888888' }),
        ]
      })] })
    },
    children
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('20260305-vmware-tools-upgrade-procedure.docx', buf);
  console.log('생성 완료: 20260305-vmware-tools-upgrade-procedure.docx');
}).catch(err => console.error('오류:', err));
