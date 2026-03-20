const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak } = require("docx");

// Colors
const C = {
  primary: "1B3A5C", accent: "2E75B6", headerBg: "D6E4F0",
  criticalBg: "FCE4EC", highBg: "FFF3E0", lightGray: "F5F5F5",
  border: "B0B0B0", white: "FFFFFF", black: "000000",
  red: "C62828", orange: "E65100", green: "1B5E20",
};

const border = { style: BorderStyle.SINGLE, size: 1, color: C.border };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const FULL = 9360;

function cell(text, opts = {}) {
  const { bold, width, shading, align, font, size, color, colSpan, rowSpan, vAlign } = opts;
  const p = new Paragraph({
    alignment: align || AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: text || "", bold: !!bold, font: font || "Malgun Gothic", size: size || 20, color: color || C.black })]
  });
  const cellOpts = { borders: cellBorders, children: [p], verticalAlign: vAlign || VerticalAlign.CENTER };
  if (width) cellOpts.width = { size: width, type: WidthType.DXA };
  if (shading) cellOpts.shading = { fill: shading, type: ShadingType.CLEAR };
  if (colSpan) cellOpts.columnSpan = colSpan;
  if (rowSpan) cellOpts.rowSpan = rowSpan;
  return new TableCell(cellOpts);
}

function headerRow(texts, widths, bg) {
  return new TableRow({
    tableHeader: true,
    children: texts.map((t, i) => cell(t, { bold: true, width: widths[i], shading: bg || C.headerBg, align: AlignmentType.CENTER, color: C.primary }))
  });
}

function dataRow(texts, widths, bg) {
  return new TableRow({
    children: texts.map((t, i) => cell(t, { width: widths[i], shading: bg }))
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, font: "Malgun Gothic" })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 }, children: [new TextRun({ text, font: "Malgun Gothic" })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text, font: "Malgun Gothic" })] });
}
function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore || 80, after: opts.spaceAfter || 80 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [new TextRun({ text, font: "Malgun Gothic", size: opts.size || 22, bold: opts.bold, color: opts.color, italics: opts.italics })]
  });
}
function richPara(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore || 80, after: opts.spaceAfter || 80 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: runs.map(r => new TextRun({ text: r.text, font: "Malgun Gothic", size: r.size || 22, bold: r.bold, color: r.color || C.black, italics: r.italics }))
  });
}
function bulletItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Malgun Gothic", size: 22 })]
  });
}
function numberedItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Malgun Gothic", size: 22 })]
  });
}
function codeBlock(lines) {
  return lines.map(line => new Paragraph({
    spacing: { before: 20, after: 20 },
    indent: { left: 360 },
    children: [new TextRun({ text: line, font: "Consolas", size: 18, color: "333333" })]
  }));
}
function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: C.border, space: 8 } },
    children: [new TextRun({ text: "" })]
  });
}
function callout(label, labelColor, bgColor, text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: labelColor, space: 8 } },
    indent: { left: 240 },
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: label + " ", font: "Malgun Gothic", size: 20, bold: true, color: labelColor }),
      new TextRun({ text, font: "Malgun Gothic", size: 20, color: "333333" })
    ]
  });
}

// ===================== DOCUMENT =====================
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Malgun Gothic", size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 56, bold: true, color: C.primary, font: "Malgun Gothic" },
        paragraph: { spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: C.primary, font: "Malgun Gothic" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: C.accent, font: "Malgun Gothic" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: C.black, font: "Malgun Gothic" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num6", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num7", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ===== COVER PAGE =====
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: "" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "KRIHS CS01", font: "Malgun Gothic", size: 48, bold: true, color: C.primary })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: "AD 연결 장애 원인 분석 보고서", font: "Malgun Gothic", size: 44, bold: true, color: C.primary })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: "Root Cause Analysis Report", font: "Malgun Gothic", size: 28, color: C.accent, italics: true })] }),
        divider(),
        new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "" })] }),
        // Root cause 1-line summary box
        new Paragraph({
          spacing: { before: 200, after: 200 },
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.red }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.red }, left: { style: BorderStyle.SINGLE, size: 2, color: C.red }, right: { style: BorderStyle.SINGLE, size: 2, color: C.red } },
          indent: { left: 480, right: 480 },
          shading: { fill: C.criticalBg, type: ShadingType.CLEAR },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "근본 원인: ", font: "Malgun Gothic", size: 22, bold: true, color: C.red }),
            new TextRun({ text: "TCP Ephemeral Port 고갈 (Tcpip 4231)", font: "Malgun Gothic", size: 22, bold: true, color: C.red }),
          ]
        }),
        new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "" })] }),
        // Info table
        new Table({
          columnWidths: [3000, 6360],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "문서 번호:", font: "Malgun Gothic", size: 24, bold: true, color: C.primary })] })] }),
              new TableCell({ borders: noBorders, width: { size: 6360, type: WidthType.DXA }, children: [new Paragraph({ indent: { left: 200 }, children: [new TextRun({ text: "RCA-KRIHS-2026-0320", font: "Malgun Gothic", size: 24 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "작성일:", font: "Malgun Gothic", size: 24, bold: true, color: C.primary })] })] }),
              new TableCell({ borders: noBorders, width: { size: 6360, type: WidthType.DXA }, children: [new Paragraph({ indent: { left: 200 }, children: [new TextRun({ text: "2026-03-20", font: "Malgun Gothic", size: 24 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "심각도:", font: "Malgun Gothic", size: 24, bold: true, color: C.primary })] })] }),
              new TableCell({ borders: noBorders, width: { size: 6360, type: WidthType.DXA }, children: [new Paragraph({ indent: { left: 200 }, children: [new TextRun({ text: "SEV2 (Major) - VDI 사용자 인증 불가", font: "Malgun Gothic", size: 24, color: C.red })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "장애 기간:", font: "Malgun Gothic", size: 24, bold: true, color: C.primary })] })] }),
              new TableCell({ borders: noBorders, width: { size: 6360, type: WidthType.DXA }, children: [new Paragraph({ indent: { left: 200 }, children: [new TextRun({ text: "2026-03-17 11:36 ~ 2026-03-20 13:57 KST (약 74시간)", font: "Malgun Gothic", size: 24 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: noBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "현재 상태:", font: "Malgun Gothic", size: 24, bold: true, color: C.primary })] })] }),
              new TableCell({ borders: noBorders, width: { size: 6360, type: WidthType.DXA }, children: [new Paragraph({ indent: { left: 200 }, children: [new TextRun({ text: "재부팅으로 일시 복구 (근본 원인 미해소, 2주 내 재발 예상)", font: "Malgun Gothic", size: 24, color: C.red })] })] })
            ]}),
          ]
        }),
        new Paragraph({ spacing: { before: 800 }, children: [new TextRun({ text: "" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONFIDENTIAL", font: "Malgun Gothic", size: 20, color: "999999", italics: true })] }),
      ]
    },

    // ===== MAIN CONTENT =====
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, pageNumbers: { start: 1 } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "KRIHS CS01 AD 연결 장애 RCA | RCA-KRIHS-2026-0320", font: "Malgun Gothic", size: 16, color: "999999", italics: true })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Page ", font: "Malgun Gothic", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], font: "Malgun Gothic", size: 18, color: "999999" }), new TextRun({ text: " / ", font: "Malgun Gothic", size: 18, color: "999999" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Malgun Gothic", size: 18, color: "999999" })]
        })] })
      },
      children: [
        // TOC
        h1("목차"),
        new TableOfContents("목차", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ===== Timezone note =====
        callout("참고:", C.accent, "EBF5FB", "CS01 VDM 지원 번들의 이벤트 로그 CSV는 UTC 기준 기록. 본 보고서는 모든 시각을 KST (UTC+9)로 보정 표기합니다."),

        // ===== 1. 근본 원인 1문장 요약 =====
        h1("1. 근본 원인 요약"),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.red }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.red }, left: { style: BorderStyle.SINGLE, size: 2, color: C.red }, right: { style: BorderStyle.SINGLE, size: 2, color: C.red } },
          indent: { left: 240, right: 240 },
          shading: { fill: C.criticalBg, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: "CS01(Windows Server 2019, 17763)에서 2026-03-06 재부팅 이후 11일간 누적된 TCP Ephemeral Port 고갈(Tcpip 4227/4231)이 NETLOGON RPC 통신을 차단하여, Horizon Connection Server가 AD 도메인 컨트롤러에 사용자 인증을 위임하지 못한 것이 근본 원인이다.", font: "Malgun Gothic", size: 22, bold: true, color: C.red }),
          ]
        }),

        // ===== 2. 환경 구성 =====
        h1("2. 환경 구성"),
        new Table({
          columnWidths: [1500, 1500, 1200, 2160, 3000],
          rows: [
            headerRow(["구성 요소", "호스트명", "IP", "역할", "비고"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["Connection Server 1", "KRIHS-CS01", "10.1.1.23", "Horizon CS (Primary)", "Windows Server 2019 Std (17763)"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["Connection Server 2", "KRIHS-CS02", "10.1.1.24", "Horizon CS (Replica)", "-"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["Domain Controller 1", "AD01", "10.1.1.21", "AD DC + DNS", "krihs.vdi 도메인"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["Domain Controller 2", "AD02", "10.1.1.22", "AD DC + DNS", "krihs.vdi 도메인"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["SQL Server", "-", "10.1.1.25", "Events DB", "SQL 1433"], [1500, 1500, 1200, 2160, 3000]),
            dataRow(["UAG", "Krihs-UAG01", "10.254.1.9", "Unified Access Gateway", "v23.03.0.0 (Photon OS 3.0)"], [1500, 1500, 1200, 2160, 3000]),
          ]
        }),
        para(""),
        richPara([{ text: "CS01 소프트웨어 버전", bold: true, size: 24, color: C.primary }]),
        new Table({
          columnWidths: [2500, 4000, 2860],
          rows: [
            headerRow(["항목", "버전", "비고"], [2500, 4000, 2860]),
            dataRow(["OS", "Windows Server 2019 Standard 10.0.17763", "RTM + KB 3개 (2018-2019)"], [2500, 4000, 2860]),
            dataRow(["Horizon CS", "v8.9 (2023-04-29 설치)", "VMwareVDMDS(ADAM) 포함"], [2500, 4000, 2860]),
            dataRow(["VMware Tools", "v12.5 (2026-03-06 설치)", "VC++ 2022 Runtime 동시 설치"], [2500, 4000, 2860]),
            dataRow(["JDK", "8u131 (2022-02-09 설치)", "2017년 빌드"], [2500, 4000, 2860]),
            new TableRow({ children: [
              cell("핫픽스", { width: 2500, bold: true }),
              cell("KB4483452, KB4470788, KB4489899", { width: 4000, bold: true, color: C.red }),
              cell("6년간 미패치 (2019년 이후 없음)", { width: 2860, bold: true, color: C.red }),
            ]}),
          ]
        }),

        // ===== 3. 증거 기반 인과관계 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("3. 증거 기반 인과관계"),

        h2("3.1 인과관계 다이어그램"),
        ...codeBlock([
          "[트리거: 2026-03-06 재부팅 - VMware Tools 12.5 + VC++ 2022 설치]",
          "    |",
          "    v",
          "[CS01: 패치 부재 서버 (KB 3개만, 2018-2019)]",
          "[Windows Server 2019 17763 - 동적 포트 범위 기본 ~16,384개]",
          "    |",
          "    v",
          "[Horizon CS 다수 서비스 + ADAM LDAP + loopback 연결 누적]",
          "[netstat: loopback ESTABLISHED 100+개, 외부 30+개]",
          "    |    11일간 포트 미회수 누적",
          "    v",
          "[03/17 11:36 KST: 첫 Tcpip 4231 - 포트 고갈 확정]",
          "[03/17 11:47~05:35+1: Tcpip 4227 8회 - TIME_WAIT 재사용도 실패]",
          "    |",
          "    v",
          "[새 TCP 연결 생성 불가 -> RPC 바인딩 실패]",
          "    |",
          "    +-> [NETLOGON 5719: \"RPC 서버를 사용할 수 없습니다\"]",
          "    |    03/17 13:05 KST ~ 03/20 12:16 (16회)",
          "    |",
          "    +-> [Horizon BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS]",
          "    |    03/17 16:15 KST ~ 03/20 (49회, 15+ 사용자)",
          "    |",
          "    +-> [AD01 Event 5827: NTLM Secure Channel 거부]",
          "         03/18 03:02 KST ~ 03/20 (8회)",
          "",
          "[03/20 13:56 KST: 관리자 수동 재부팅]",
          "    |",
          "    v",
          "[TCP 스택 초기화 -> 모든 포트 해제 -> 정상 복구]",
        ]),

        h2("3.2 핵심 증거 요약"),
        new Table({
          columnWidths: [400, 3600, 2200, 3160],
          rows: [
            headerRow(["#", "증거", "출처", "의미"], [400, 3600, 2200, 3160]),
            new TableRow({ children: [
              cell("E1", { width: 400, align: AlignmentType.CENTER, bold: true }),
              cell("Tcpip 4231 - 03/17 02:36 UTC", { width: 3600, bold: true, color: C.red }),
              cell("CS01 System-log.csv", { width: 2200 }),
              cell("Ephemeral port 완전 고갈 확정", { width: 3160, bold: true, color: C.red }),
            ]}),
            new TableRow({ children: [
              cell("E2", { width: 400, align: AlignmentType.CENTER }),
              cell("Tcpip 4227 - 03/17 02:47~20:35 UTC (8회)", { width: 3600 }),
              cell("CS01 System-log.csv", { width: 2200 }),
              cell("TIME_WAIT 포트 재사용도 실패, 만성적 고갈", { width: 3160 }),
            ]}),
            new TableRow({ children: [
              cell("E3", { width: 400, align: AlignmentType.CENTER }),
              cell("Tcpip 4231 - 03/18, 03/19, 03/20 매일 반복", { width: 3600, bold: true }),
              cell("CS01 System-log.csv", { width: 2200 }),
              cell("매일 새벽 동일 시간대 포트 고갈 재발", { width: 3160, bold: true }),
            ]}),
            dataRow(["E4", "NETLOGON 5719 - 03/17~03/20 (16회)", "CS01 System-log.csv", "DC RPC 연결 불가"], [400, 3600, 2200, 3160]),
            dataRow(["E5", "BROKER NO_LOGON_SERVERS (49회)", "CS01 Application-log.csv", "Horizon AD 인증 위임 실패"], [400, 3600, 2200, 3160]),
            dataRow(["E6", "AD01 Event 5827 - CS01 대상 (8회)", "AD01-system.evtx", "AD가 CS01 NTLM 연결 거부 (CVE-2020-1472)"], [400, 3600, 2200, 3160]),
            new TableRow({ children: [
              cell("E7", { width: 400, align: AlignmentType.CENTER }),
              cell("nltest /sc_verify:krihs.vdi = 정상", { width: 3600, bold: true, color: C.green }),
              cell("운영자 확인", { width: 2200 }),
              cell("Secure Channel 자체(컴퓨터 계정)는 정상", { width: 3160, bold: true, color: C.green }),
            ]}),
            dataRow(["E8", "5823 정상 갱신 (30일 주기, 09/29~03/02)", "CS01 System-log.csv", "컴퓨터 계정 비밀번호 자동 갱신 정상"], [400, 3600, 2200, 3160]),
            dataRow(["E9", "핫픽스 3개 (2018-2019)", "systeminfo.txt", "6년 이상 미패치, TCP/IP 결함 미수정"], [400, 3600, 2200, 3160]),
            dataRow(["E10", "netstat: loopback 389 44개, 4002 22개", "netstat-an.txt", "ADAM LDAP + JMS 대량 포트 점유"], [400, 3600, 2200, 3160]),
            new TableRow({ children: [
              cell("E11", { width: 400, align: AlignmentType.CENTER }),
              cell("재부팅 후 즉시 정상 복구 (03/20 13:57)", { width: 3600, bold: true, color: C.green }),
              cell("CS01 System-log.csv", { width: 2200 }),
              cell("TCP 스택 초기화로 해소 = 포트 고갈 확증", { width: 3160, bold: true, color: C.green }),
            ]}),
          ]
        }),

        h2("3.3 트리거 확률 분석"),
        new Table({
          columnWidths: [3500, 800, 5060],
          rows: [
            headerRow(["가설", "확률", "근거"], [3500, 800, 5060]),
            new TableRow({ children: [
              cell("TCP Ephemeral Port 고갈 -> RPC 실패 -> AD 인증 불가", { width: 3500, bold: true, color: C.red }),
              cell("95%", { width: 800, bold: true, color: C.red, align: AlignmentType.CENTER, shading: C.criticalBg }),
              cell("Tcpip 4231 선행 -> 5719 후행 시간순 일치, 재부팅으로 즉시 해소, netstat 대량 loopback 확인", { width: 5060 }),
            ]}),
            dataRow(["Secure Channel 손상 (계정 비밀번호 불일치)", "2%", "nltest /sc_verify 정상, 5823 갱신 이력 정상, 재부팅 후 resetpwd 없이 복구"], [3500, 800, 5060]),
            dataRow(["네트워크 물리적 장애", "2%", "CS01-CS02 ADAM 복제 정상, loopback:389 연결 존재, UAG-CS01 정상"], [3500, 800, 5060]),
            dataRow(["AD01/AD02 서버 측 장애", "1%", "5827은 AD01이 요청을 수신 후 거부 = AD01 정상 동작"], [3500, 800, 5060]),
          ]
        }),

        // ===== 4. 타임라인 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("4. 장애 타임라인"),
        para("모든 시각은 KST (UTC+9) 기준입니다. CSV는 UTC 기록이므로 +9h 보정 적용.", { italics: true, color: "666666", size: 20 }),

        h2("4.1 사전 이벤트"),
        new Table({
          columnWidths: [2200, 7160],
          rows: [
            headerRow(["시각 (KST)", "이벤트"], [2200, 7160]),
            dataRow(["2019-12-27", "CS01 Windows Server 2019 최초 설치"], [2200, 7160]),
            dataRow(["2023-04-29", "Horizon Connection Server v8.9 설치"], [2200, 7160]),
            dataRow(["2025-09-29 ~ 2026-03-02", "NETLOGON 5823 정상 발생 (30일 주기 Secure Channel 비밀번호 갱신)"], [2200, 7160]),
            dataRow(["2026-03-06 22:59", "msiexec에 의한 재부팅 (VMware Tools 12.5 + VC++ 2022 설치 완료)"], [2200, 7160]),
            dataRow(["2026-03-06 23:00", "CS01 정상 부팅 완료 (Event 6005/6009)"], [2200, 7160]),
          ]
        }),

        h2("4.2 장애 발생 및 진행"),
        new Table({
          columnWidths: [1800, 1000, 5060, 1500],
          rows: [
            headerRow(["시각 (KST)", "심각도", "이벤트", "출처"], [1800, 1000, 5060, 1500]),
            // 3/17
            new TableRow({ children: [
              cell("03-17 11:36", { width: 1800, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("Tcpip 4231: TCP 포트 할당 실패 - 모든 ephemeral port 고갈 확정", { width: 5060, bold: true, color: C.red }),
              cell("CS01 System", { width: 1500 }),
            ]}),
            dataRow(["03-17 11:47", "WARNING", "Tcpip 4227 #1: TIME_WAIT 포트 재사용 실패", "CS01 System"], [1800, 1000, 5060, 1500]),
            dataRow(["03-17 11:51~12:50", "WARNING", "Tcpip 4227 #2~#5: 연속 발생", "CS01 System"], [1800, 1000, 5060, 1500]),
            new TableRow({ children: [
              cell("03-17 13:05", { width: 1800, bold: true, color: C.red }),
              cell("ERROR", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("NETLOGON 5719 #1: DC RPC 연결 불가 - \"RPC 서버를 사용할 수 없습니다\"", { width: 5060, bold: true, color: C.red }),
              cell("CS01 System", { width: 1500 }),
            ]}),
            dataRow(["03-17 13:55", "WARNING", "Tcpip 4227 #6", "CS01 System"], [1800, 1000, 5060, 1500]),
            new TableRow({ children: [
              cell("03-17 16:15", { width: 1800, bold: true, color: C.red }),
              cell("ERROR", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS #1: 사용자 20140018 인증 실패", { width: 5060, bold: true, color: C.red }),
              cell("CS01 App", { width: 1500 }),
            ]}),
            dataRow(["03-17 16:16~16:20", "ERROR", "사용자 20011001 인증 실패 4회 연속", "CS01 App"], [1800, 1000, 5060, 1500]),
            dataRow(["03-17 17:35", "ERROR", "NETLOGON 5719 #2", "CS01 System"], [1800, 1000, 5060, 1500]),
            dataRow(["03-17 20:19", "WARNING", "Tcpip 4227 #7", "CS01 System"], [1800, 1000, 5060, 1500]),
            dataRow(["03-17 22:01", "ERROR", "NETLOGON 5719 #3", "CS01 System"], [1800, 1000, 5060, 1500]),
            // 3/18
            new TableRow({ children: [
              cell("03-18 03:02", { width: 1800, bold: true, color: C.orange }),
              cell("WARNING", { width: 1000, shading: C.highBg, align: AlignmentType.CENTER, bold: true, color: C.orange, size: 18 }),
              cell("AD01 Event 5827 #1: CS01의 NTLM Secure Channel 연결 거부 (CVE-2020-1472 강화)", { width: 5060, bold: true, color: C.orange }),
              cell("AD01 System", { width: 1500 }),
            ]}),
            dataRow(["03-18 05:35", "WARNING", "Tcpip 4227 #8 (이 날 마지막)", "CS01 System"], [1800, 1000, 5060, 1500]),
            new TableRow({ children: [
              cell("03-18 11:36", { width: 1800, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("Tcpip 4231 #2: 포트 고갈 재발 (매일 새벽 02:36 UTC 패턴)", { width: 5060, bold: true, color: C.red }),
              cell("CS01 System", { width: 1500 }),
            ]}),
            dataRow(["03-18 09:57~10:57", "ERROR", "다수 사용자 인증 실패 (20240026, 20180089, 20160092)", "CS01 App"], [1800, 1000, 5060, 1500]),
            // 3/19
            new TableRow({ children: [
              cell("03-19 11:50", { width: 1800, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("Tcpip 4231 #3: 포트 고갈 3일째 재발", { width: 5060, bold: true, color: C.red }),
              cell("CS01 System", { width: 1500 }),
            ]}),
            dataRow(["03-19 03:17~07:42", "WARNING", "AD01 Event 5827 #3~#5 반복", "AD01 System"], [1800, 1000, 5060, 1500]),
            // 3/20
            dataRow(["03-20 09:05", "WARNING", "Tcpip 4227 #12", "CS01 System"], [1800, 1000, 5060, 1500]),
            dataRow(["03-20 10:34~10:38", "ERROR", "대량 인증 실패 집중 발생 (10건)", "CS01 App"], [1800, 1000, 5060, 1500]),
            new TableRow({ children: [
              cell("03-20 11:50", { width: 1800, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red, size: 18 }),
              cell("Tcpip 4231 #4: 4일째 포트 고갈", { width: 5060, bold: true, color: C.red }),
              cell("CS01 System", { width: 1500 }),
            ]}),
            dataRow(["03-20 12:16", "ERROR", "NETLOGON 5719 #16 (마지막)", "CS01 System"], [1800, 1000, 5060, 1500]),
          ]
        }),

        h2("4.3 복구"),
        new Table({
          columnWidths: [2200, 7160],
          rows: [
            headerRow(["시각 (KST)", "이벤트"], [2200, 7160]),
            new TableRow({ children: [
              cell("03-20 13:56", { width: 2200, bold: true, color: C.green }),
              cell("관리자(krihsis)가 Explorer.EXE에서 수동 재부팅 실행 (Event 1074)", { width: 7160, bold: true, color: C.green }),
            ]}),
            new TableRow({ children: [
              cell("03-20 13:57", { width: 2200, bold: true, color: C.green }),
              cell("OS 정상 부팅 완료 (Event 6005/6009), ADAM 복제 정상 완료 (CS02 동기화)", { width: 7160, bold: true, color: C.green }),
            ]}),
            new TableRow({ children: [
              cell("03-20 13:57 이후", { width: 2200, bold: true, color: C.green }),
              cell("장애 해소 - 인증 실패 이벤트 없음, 모든 서비스 정상", { width: 7160, bold: true, color: C.green }),
            ]}),
          ]
        }),

        // ===== 5. 근본 원인 상세 분석 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("5. 근본 원인 상세 분석"),

        h2("5.1 각 이벤트의 기술적 의미"),

        h3("Tcpip 4231 - \"모든 포트 소진\""),
        para("TCP/IP 스택이 새로운 연결을 위해 ephemeral port를 할당하려 했으나, 16,384개(기본 범위 49152~65535) 포트가 전부 소진. 새로운 TCP 연결을 생성할 수 없으므로 RPC, LDAP, Kerberos, SMB 등 모든 아웃바운드 TCP 통신 불가."),
        callout("발생 패턴:", C.red, C.criticalBg, "03/17, 03/18, 03/19, 03/20 매일 02:36~02:50 UTC (11:36~11:50 KST)에 발생 -> 스케줄 작업이 대량 연결을 생성하여 임계치를 넘기는 것으로 추정"),

        h3("Tcpip 4227 - \"TIME_WAIT 포트 재사용 실패\""),
        para("모든 가용 포트가 TIME_WAIT 또는 ESTABLISHED 상태로 점유되어 있어 TIME_WAIT 상태 포트를 강제 재사용하려 했지만 이마저도 실패. CS01은 Horizon 서비스(Java 다중 스레드), ADAM LDAP(389/636), JMS(4002), 8009/8123 등 내부 loopback 연결만으로도 100개 이상의 포트를 항시 점유."),

        h3("NETLOGON 5719 - \"RPC 서버를 사용할 수 없습니다\""),
        para("CS01의 NETLOGON 서비스가 DC(AD01/AD02)에 RPC 연결을 시도했으나 실패. 이것은 네트워크 장애가 아니라 로컬 포트 고갈로 인한 RPC 바인딩 실패."),
        callout("nltest /sc_verify가 정상인 이유:", C.green, "E8F5E9", "nltest는 이미 캐시된 Secure Channel 정보를 검증. 새 연결이 아닌 기존 상태 확인이므로 포트 고갈의 영향을 받지 않음."),

        h3("AD01 Event 5827 - \"NTLM over Netlogon Secure Channel 거부\""),
        para("CS01이 포트 고갈로 정상적인 Secure Channel RPC 연결을 맺지 못하고, 비정상적인 경로(plain NTLM)로 인증을 시도 -> AD01이 CVE-2020-1472(Zerologon) 보안 강화 정책에 따라 거부. Secure Channel 자체는 유효하지만, 해당 채널을 사용하는 새 연결을 수립할 수 없었음."),

        h2("5.2 포트 고갈의 원인 (왜 11일 만에?)"),
        numberedItem("Horizon CS 아키텍처의 높은 내부 연결 수: netstat 스냅샷 - loopback:389 44개, loopback:4002 22개, loopback:8009 5개 + 기타 = 100개 이상 상시 연결", "num1"),
        numberedItem("사용자 세션 처리: 매 인증 시 CS->AD RPC, CS->ADAM LDAP, CS->SQL 연결 생성. ~10명 동시 사용자로 하루 수백 개 단기 연결 반복", "num1"),
        numberedItem("TIME_WAIT 누적 + 미패치 TCP 스택: Windows Server 2019 RTM + 6년간 미패치 -> TCP/IP 포트 리소스 누수 버그 미수정. TIME_WAIT 기본 120초 + FIN_WAIT/CLOSE_WAIT 전환 지연", "num1"),
        numberedItem("매일 새벽 포트 고갈 패턴: 4231이 매일 같은 시간대 발생 -> 스케줄 작업(백업, POLESTAR SMS Agent 등)이 대량 연결을 일시적으로 생성", "num1"),

        h2("5.3 재부팅으로 복구된 이유"),
        numberedItem("OS 종료 -> 모든 TCP 연결 RST/FIN으로 강제 해제", "num2"),
        numberedItem("TCP/IP 스택 완전 초기화 -> 포트 카운터 리셋", "num2"),
        numberedItem("Winsock/AFD 드라이버 재로드 -> 소켓 테이블 클린 상태", "num2"),
        numberedItem("NETLOGON 서비스 시작 -> DC 탐색 -> 새 RPC 연결 성공 (포트 가용)", "num2"),
        numberedItem("Horizon CS 서비스 시작 -> ADAM/LDAP/JMS 연결 재설정", "num2"),
        callout("핵심:", C.accent, "EBF5FB", "net stop/start netlogon만으로는 불충분. 근본 원인인 포트 고갈은 TCP 스택 수준이므로 OS 재부팅이 유일한 해결책."),

        // ===== 6. 5 Whys 분석 =====
        h1("6. 5 Whys 분석"),
        new Table({
          columnWidths: [600, 3500, 5260],
          rows: [
            headerRow(["Why", "질문", "답변"], [600, 3500, 5260]),
            dataRow(["1", "왜 VDI 사용자가 로그인하지 못했는가?", "Horizon CS01이 \"no logon servers\" 오류를 반환하여 AD 인증을 수행하지 못했기 때문"], [600, 3500, 5260]),
            dataRow(["2", "왜 CS01이 로그온 서버를 찾지 못했는가?", "NETLOGON 서비스가 DC(AD01/AD02)에 RPC 연결을 수립하지 못했기 때문 (Event 5719)"], [600, 3500, 5260]),
            dataRow(["3", "왜 RPC 연결이 실패했는가?", "CS01의 TCP ephemeral port가 모두 소진되어 새 아웃바운드 TCP 연결을 생성할 수 없었기 때문 (Event 4231)"], [600, 3500, 5260]),
            dataRow(["4", "왜 TCP 포트가 고갈되었는가?", "2026-03-06 재부팅 이후 11일간 Horizon ADAM/JMS loopback 연결 + 사용자 세션 연결이 누적, TIME_WAIT 포트가 정상 회수되지 않았기 때문"], [600, 3500, 5260]),
            new TableRow({ children: [
              cell("5", { width: 600, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("왜 포트가 정상 회수되지 않았는가?", { width: 3500, bold: true, color: C.red }),
              cell("Windows Server 2019 RTM(17763)에서 6년간 패치 미적용 -> TCP/IP 스택의 포트 리소스 관리 결함 미수정 + 동적 포트 범위(16,384개)가 Horizon CS의 높은 연결 부하에 비해 부족 <- 근본 원인", { width: 5260, bold: true, color: C.red }),
            ]}),
          ]
        }),

        // ===== 7. 잔여 리스크 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("7. 잔여 리스크"),
        new Table({
          columnWidths: [400, 2500, 1200, 1200, 4060],
          rows: [
            headerRow(["#", "리스크", "심각도", "가능성", "설명"], [400, 2500, 1200, 1200, 4060]),
            new TableRow({ children: [
              cell("R1", { width: 400, align: AlignmentType.CENTER }),
              cell("포트 고갈 재발", { width: 2500, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("매우 높음", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("근본 원인 미해소. 재부팅 후 11~14일 후 재발 예상. 예상 재발일: 2026-03-31 ~ 04-03", { width: 4060, bold: true }),
            ]}),
            new TableRow({ children: [
              cell("R2", { width: 400, align: AlignmentType.CENTER }),
              cell("보안 취약점 노출", { width: 2500, bold: true, color: C.red }),
              cell("CRITICAL", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("확정", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("6년간 미패치 - CVE-2020-1472(Zerologon), CVE-2021-36942(PetitPotam), CVE-2022-21907(HTTP.sys RCE) 등 수십 개", { width: 4060 }),
            ]}),
            dataRow(["R3", "CS01 단독 장애 시 VDI 서비스 중단", "HIGH", "중간", "UAG가 CS01 선호 시 failover 지연"], [400, 2500, 1200, 1200, 4060]),
            dataRow(["R4", "ADAM 복제 누적 지연", "MEDIUM", "낮음", "포트 고갈 기간 중 복제 지연 가능 (현재 스냅샷은 정상)"], [400, 2500, 1200, 1200, 4060]),
          ]
        }),

        // ===== 8. 권장 조치 =====
        h1("8. 권장 조치"),

        h2("8.1 즉시 조치 (24시간 이내) - P0"),
        richPara([{ text: "A1. 동적 포트 범위 확대", bold: true, size: 24, color: C.primary }]),
        ...codeBlock([
          "# CS01에서 실행 - 동적 포트 범위를 16,384 -> 32,768개로 확대",
          "netsh int ipv4 set dynamicport tcp start=32768 num=32767",
          "netsh int ipv4 set dynamicport udp start=32768 num=32767",
          "",
          "# 확인",
          "netsh int ipv4 show dynamicport tcp",
        ]),
        richPara([{ text: "A2. TIME_WAIT 타임아웃 단축", bold: true, size: 24, color: C.primary }]),
        ...codeBlock([
          "# TcpTimedWaitDelay를 120초 -> 30초로 단축",
          "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters' \\",
          "  -Name 'TcpTimedWaitDelay' -Value 30 -Type DWord",
          "",
          "# MaxUserPort 설정 (레거시 호환)",
          "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters' \\",
          "  -Name 'MaxUserPort' -Value 65534 -Type DWord",
          "",
          "# 재부팅 필요",
        ]),
        richPara([{ text: "A3. 포트 사용량 모니터링 스크립트 배포", bold: true, size: 24, color: C.primary }]),
        ...codeBlock([
          "# 1시간 주기 스케줄 작업으로 등록",
          "$ports = (Get-NetTCPConnection | Where {$_.LocalPort -ge 49152}).Count",
          "$tw = (Get-NetTCPConnection -State TimeWait | Where {$_.LocalPort -ge 49152}).Count",
          "$pct = [math]::Round(($ports / 16384) * 100, 1)",
          "",
          "# 70% 이상 시 경고",
          "if ($pct -ge 70) {",
          "  Write-EventLog -LogName Application -Source 'PortMonitor' -EventId 9001 \\",
          "    -EntryType Warning -Message \"PORT WARNING: $pct% used, TW=$tw\"",
          "}",
        ]),

        h2("8.2 단기 조치 (1주 이내) - P1"),
        new Table({
          columnWidths: [400, 2800, 6160],
          rows: [
            headerRow(["#", "조치", "상세"], [400, 2800, 6160]),
            dataRow(["A4", "Windows Server 2019 누적 업데이트 적용", "현재 Build 17763 (RTM+KB3개) -> 최신 2026-03 LCU 적용. CS02 정상 확인 후 CS01 유지보수 모드에서 실행"], [400, 2800, 6160]),
            dataRow(["A5", "스케줄 작업 감사", "매일 새벽 포트 대량 소비 원인 식별. POLESTAR SMS Agent 8.0 동작 확인"], [400, 2800, 6160]),
          ]
        }),

        h2("8.3 중기 조치 (1개월 이내) - P2"),
        new Table({
          columnWidths: [400, 2800, 6160],
          rows: [
            headerRow(["#", "조치", "상세"], [400, 2800, 6160]),
            dataRow(["A6", "CS01/CS02 정기 재부팅 스케줄", "매 2주 1회, 일요일 새벽 교대 재부팅 (근본 해결 전 완화)"], [400, 2800, 6160]),
            dataRow(["A7", "UAG failover 검증", "CS01 장애 시 CS02로 자동 전환 확인"], [400, 2800, 6160]),
            dataRow(["A8", "Horizon CS v8.9 -> 최신 버전 검토", "ADAM 연결 관리 개선, 알려진 연결 누수 수정"], [400, 2800, 6160]),
          ]
        }),

        h2("8.4 장기 조치 (3개월 이내) - P3"),
        new Table({
          columnWidths: [400, 2800, 6160],
          rows: [
            headerRow(["#", "조치", "상세"], [400, 2800, 6160]),
            dataRow(["A9", "Horizon CS Active-Active 이중화 검증", "단일 CS 장애 시 무중단 서비스 보장"], [400, 2800, 6160]),
            dataRow(["A10", "VDI 인프라 모니터링 체계 수립", "포트 사용률, NETLOGON 상태, ADAM 복제 실시간 모니터링"], [400, 2800, 6160]),
            dataRow(["A11", "패치 관리 정책 수립", "분기별 누적 업데이트 적용 의무화"], [400, 2800, 6160]),
          ]
        }),

        // ===== 9. 분석 한계 및 추가 검증 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("9. 분석 한계 및 추가 검증 필요 항목"),

        h2("9.1 분석 한계"),
        para("본 보고서의 \"TCP Ephemeral Port 고갈\" 결론은 현상 분석(직접 원인) 수준에서는 높은 정확도를 가지나, 근본 원인(왜 포트가 누수되는가)의 프로세스 레벨 특정이 불완전합니다."),
        new Table({
          columnWidths: [3000, 1000, 5360],
          rows: [
            headerRow(["구분", "확정", "설명"], [3000, 1000, 5360]),
            new TableRow({ children: [
              cell("직접 원인: TCP 포트 고갈 -> RPC 실패 -> 인증 장애", { width: 3000 }),
              cell("확정", { width: 1000, shading: "E8F5E9", align: AlignmentType.CENTER, bold: true, color: C.green }),
              cell("Tcpip 4231/4227 -> 5719 -> NO_LOGON_SERVERS 시간순 일치, 재부팅 해소", { width: 5360 }),
            ]}),
            new TableRow({ children: [
              cell("배경: 미패치 TCP 스택 + 높은 연결 부하", { width: 3000 }),
              cell("확정", { width: 1000, shading: "E8F5E9", align: AlignmentType.CENTER, bold: true, color: C.green }),
              cell("6년 미패치(E9), loopback 100+개(E10) 확인", { width: 5360 }),
            ]}),
            new TableRow({ children: [
              cell("포트 누수 프로세스 특정", { width: 3000, bold: true, color: C.red }),
              cell("미확정", { width: 1000, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("장애 시점 netstat -ano 전체 스냅샷이 없어 어떤 프로세스가 포트를 비정상 점유했는지 특정 불가", { width: 5360 }),
            ]}),
            new TableRow({ children: [
              cell("매일 새벽 포트 고갈 트리거", { width: 3000, bold: true, color: C.orange }),
              cell("추정", { width: 1000, shading: C.highBg, align: AlignmentType.CENTER, bold: true, color: C.orange }),
              cell("4231의 매일 동일 시간대 발생은 스케줄 작업을 강하게 시사하나, 구체적 작업 미특정", { width: 5360 }),
            ]}),
            new TableRow({ children: [
              cell("VMware Tools 12.5 설치 영향", { width: 3000 }),
              cell("미확인", { width: 1000, shading: C.highBg, align: AlignmentType.CENTER, bold: true, color: C.orange }),
              cell("시점 일치(03/06 설치)일 뿐, 인과관계 증거 없음. Root Cause 아님", { width: 5360 }),
            ]}),
            new TableRow({ children: [
              cell("CS01 loopback 연결이 비정상 증가인지", { width: 3000, bold: true, color: C.orange }),
              cell("미확인", { width: 1000, shading: C.highBg, align: AlignmentType.CENTER, bold: true, color: C.orange }),
              cell("CS02의 동일 시점 netstat과 비교해야 판단 가능. 비교 데이터 부재", { width: 5360 }),
            ]}),
          ]
        }),

        h2("9.2 추가 검증 필요 항목"),
        para("다음 장애 재현 시 또는 사전 점검 시 아래 데이터를 수집하여 근본 원인의 프로세스 레벨 특정이 필요합니다:"),

        richPara([{ text: "1) TIME_WAIT 상태 포트 수 확인 (정기 수집)", bold: true, size: 22, color: C.primary }]),
        ...codeBlock([
          "# 1시간 주기로 수집하여 추이 파악",
          "netstat -an | findstr \"TIME_WAIT\" | find /c \":\"",
        ]),
        richPara([{ text: "2) 프로세스별 포트 점유 현황 (장애 시점 수집 필수)", bold: true, size: 22, color: C.primary }]),
        ...codeBlock([
          "# 포트 고갈 징후(Tcpip 4227/4231) 발생 즉시 수집",
          "netstat -ano > C:\\Logs\\netstat-ano-timestamp.txt",
          "tasklist /svc > C:\\Logs\\tasklist-timestamp.txt",
        ]),
        richPara([{ text: "3) CS02 대비 비교 (기준선 수립)", bold: true, size: 22, color: C.primary }]),
        ...codeBlock([
          "# CS01과 CS02에서 동시 수집하여 비교",
          "(Get-NetTCPConnection | Group-Object -Property State).Count",
          "(Get-NetTCPConnection | Where {$_.LocalAddress -eq '127.0.0.1'}).Count",
        ]),
        richPara([{ text: "4) 스케줄 작업 전수 조사 (매일 새벽 트리거 특정)", bold: true, size: 22, color: C.primary }]),
        ...codeBlock([
          "schtasks /query /fo LIST /v",
          "Get-ScheduledTask | Where {$_.State -ne 'Disabled'} |",
          "  Select TaskName, TaskPath, State",
        ]),
        richPara([{ text: "5) Horizon 서비스 ADAM/LDAP 세션 수 모니터링", bold: true, size: 22, color: C.primary }]),
        ...codeBlock([
          "(Get-NetTCPConnection -LocalPort 389).Count",
          "(Get-NetTCPConnection -LocalPort 4002).Count",
        ]),

        h2("9.3 검증 완료 시 보고서 업데이트 계획"),
        new Table({
          columnWidths: [4000, 5360],
          rows: [
            headerRow(["검증 결과", "보고서 업데이트"], [4000, 5360]),
            dataRow(["특정 프로세스의 비정상 포트 점유 확인", "섹션 5.2에 프로세스명/PID 추가, 5 Whys #4 업데이트"], [4000, 5360]),
            dataRow(["스케줄 작업이 트리거로 확인", "섹션 5.1 추정->확정 변경, 해당 작업 비활성화를 P0 조치에 추가"], [4000, 5360]),
            dataRow(["CS02 대비 CS01 loopback 비정상 확인", "증거 E10에 비교 데이터 추가, Horizon 연결 누수 가능성 추가"], [4000, 5360]),
            dataRow(["VMware Tools 12.5 영향 확인/부정", "부록에 결과 추가 또는 해당 항목 완전 제거"], [4000, 5360]),
          ]
        }),

        // ===== 10. 잘 된 점 / 개선할 점 =====
        h1("10. 잘 된 점 / 개선할 점"),
        h2("9.1 잘 된 점"),
        bulletItem("CS02가 정상 동작하여 일부 사용자는 CS02를 통해 인증 가능", "bullets"),
        bulletItem("ADAM 복제가 지속적으로 동작하여 CS01/CS02 간 구성 불일치 없음", "bullets"),
        bulletItem("nltest /sc_verify를 실행하여 Secure Channel 상태를 확인한 것은 올바른 진단 절차", "bullets"),
        bulletItem("재부팅 결정이 적절했으며 즉시 효과가 있었음", "bullets"),

        h2("9.2 개선할 점"),
        bulletItem("6년간 미패치는 보안 및 안정성 모두에서 심각한 리스크. 패치 관리 정책 부재", "bullets"),
        bulletItem("포트 사용률 모니터링이 없어 11일간 점진적 악화 동안 사전 감지 불가", "bullets"),
        bulletItem("NETLOGON 5719가 03/17부터 발생했지만 03/20 재부팅까지 3일간 대응 지연", "bullets"),
        bulletItem("CS01 단독 장애 시 자동 failover 메커니즘 검증 부재", "bullets"),

        // ===== 11. 결론 =====
        h1("11. 결론"),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.red }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.red }, left: { style: BorderStyle.SINGLE, size: 2, color: C.red }, right: { style: BorderStyle.SINGLE, size: 2, color: C.red } },
          indent: { left: 240, right: 240 },
          shading: { fill: C.criticalBg, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: "근본 원인: ", font: "Malgun Gothic", size: 22, bold: true, color: C.red }),
            new TextRun({ text: "TCP Ephemeral Port 고갈 (Tcpip 4231) - 11일간 누적된 포트 소진으로 NETLOGON RPC 연결 불가", font: "Malgun Gothic", size: 22, bold: true }),
          ]
        }),
        para("CS01(Windows Server 2019 RTM, 6년간 미패치)에서 2026-03-06 재부팅 이후 11일간 Horizon Connection Server의 ADAM LDAP, JMS, 사용자 세션 처리 등 내부 TCP 연결이 누적되었습니다. TIME_WAIT 상태 포트의 정상적인 회수가 이루어지지 않아 2026-03-17 11:36 KST에 16,384개 ephemeral port가 완전히 고갈되었고(Tcpip 4231), 이로 인해 NETLOGON RPC 연결이 실패하여(5719) Horizon Broker가 AD 인증을 수행하지 못했습니다."),
        para("AD01의 Event 5827(NTLM 거부)은 포트 고갈 상태에서 CS01이 비정상 경로로 NTLM 인증을 시도한 결과이며, CVE-2020-1472(Zerologon) 보안 강화 정책에 의한 정상적인 거부 동작입니다. nltest /sc_verify가 정상이었던 것은 Secure Channel 자체(컴퓨터 계정 비밀번호)가 유효했기 때문입니다."),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { left: { style: BorderStyle.SINGLE, size: 8, color: C.orange, space: 8 } },
          indent: { left: 240 },
          shading: { fill: C.highBg, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: "경고: ", font: "Malgun Gothic", size: 22, bold: true, color: C.orange }),
            new TextRun({ text: "재부팅으로 TCP 스택이 초기화되어 일시 복구되었으나, 근본 원인(미패치 + 부족한 포트 범위 + 높은 연결 부하)이 해소되지 않았습니다. 동적 포트 범위 확대, TIME_WAIT 타임아웃 단축, 긴급 OS 패치 적용이 즉시 필요합니다. 현재 상태로 예상 재발일: 2026-03-31 ~ 04-03.", font: "Malgun Gothic", size: 22 }),
          ]
        }),

        // ===== 부록 =====
        new Paragraph({ children: [new PageBreak()] }),
        h1("부록 A: Tcpip 이벤트 전체 목록"),
        new Table({
          columnWidths: [2000, 2000, 1200, 4160],
          rows: [
            headerRow(["UTC 시각", "KST 시각", "Event ID", "의미"], [2000, 2000, 1200, 4160]),
            new TableRow({ children: [
              cell("03/17 02:36", { width: 2000 }),
              cell("03/17 11:36", { width: 2000, bold: true, color: C.red }),
              cell("4231", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("포트 완전 고갈", { width: 4160, bold: true, color: C.red }),
            ]}),
            dataRow(["03/17 02:47", "03/17 11:47", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 02:51", "03/17 11:51", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 03:00", "03/17 12:00", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 03:16", "03/17 12:16", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 03:50", "03/17 12:50", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 04:55", "03/17 13:55", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 07:03", "03/17 16:03", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 11:19", "03/17 20:19", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            dataRow(["03/17 20:35", "03/18 05:35", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            new TableRow({ children: [
              cell("03/18 02:36", { width: 2000 }),
              cell("03/18 11:36", { width: 2000, bold: true, color: C.red }),
              cell("4231", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("포트 완전 고갈 (2일째)", { width: 4160, bold: true, color: C.red }),
            ]}),
            dataRow(["03/18 13:39", "03/18 22:39", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            new TableRow({ children: [
              cell("03/19 02:50", { width: 2000 }),
              cell("03/19 11:50", { width: 2000, bold: true, color: C.red }),
              cell("4231", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("포트 완전 고갈 (3일째)", { width: 4160, bold: true, color: C.red }),
            ]}),
            dataRow(["03/20 00:05", "03/20 09:05", "4227", "TIME_WAIT 재사용 실패"], [2000, 2000, 1200, 4160]),
            new TableRow({ children: [
              cell("03/20 02:50", { width: 2000 }),
              cell("03/20 11:50", { width: 2000, bold: true, color: C.red }),
              cell("4231", { width: 1200, shading: C.criticalBg, align: AlignmentType.CENTER, bold: true, color: C.red }),
              cell("포트 완전 고갈 (4일째)", { width: 4160, bold: true, color: C.red }),
            ]}),
          ]
        }),

        h1("부록 B: AD01 Event 5827 상세"),
        new Table({
          columnWidths: [2500, 2000, 4860],
          rows: [
            headerRow(["시각 (KST)", "대상", "설명"], [2500, 2000, 4860]),
            dataRow(["2026-03-18 03:02", "KRIHS-CS01", "Netlogon Secure Channel 연결 거부 (NTLM, CVE-2020-1472)"], [2500, 2000, 4860]),
            dataRow(["2026-03-18 09:47", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-19 06:17", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-19 07:42", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-19 10:17", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-20 06:17", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-20 07:17", "KRIHS-CS01", "동일"], [2500, 2000, 4860]),
            dataRow(["2026-03-20 13:17", "KRIHS-CS01", "동일 (재부팅 직전 마지막)"], [2500, 2000, 4860]),
          ]
        }),

        h1("부록 C: 시스템 구성 상세"),
        new Table({
          columnWidths: [2500, 6860],
          rows: [
            headerRow(["항목", "값"], [2500, 6860]),
            dataRow(["OS", "Windows Server 2019 Standard, 10.0.17763"], [2500, 6860]),
            dataRow(["CPU", "2 vCPU (Intel Broadwell E5-2600 v4 @ 2.2GHz)"], [2500, 6860]),
            dataRow(["RAM", "16 GB"], [2500, 6860]),
            dataRow(["IP", "10.1.1.23 /24"], [2500, 6860]),
            dataRow(["Gateway", "10.1.1.254"], [2500, 6860]),
            dataRow(["DNS", "10.1.1.21 (AD01), 10.1.1.22 (AD02)"], [2500, 6860]),
            dataRow(["Domain", "krihs.vdi"], [2500, 6860]),
            dataRow(["Horizon", "Connection Server v8.9 (2023-04-29)"], [2500, 6860]),
            dataRow(["ADAM", "VMwareVDMDS (AD LDS 인스턴스)"], [2500, 6860]),
            dataRow(["Java", "JDK 8u131 (2022-02-09)"], [2500, 6860]),
            dataRow(["VMware Tools", "12.5 (2026-03-06)"], [2500, 6860]),
            dataRow(["VC++ Runtime", "2022 x64/x86 14.40.33816 (2026-03-06)"], [2500, 6860]),
            dataRow(["핫픽스", "KB4483452, KB4470788, KB4489899 (3개, 2018-2019)"], [2500, 6860]),
          ]
        }),

        h1("부록 D: 시간대 보정 근거"),
        new Table({
          columnWidths: [3200, 2400, 3760],
          rows: [
            headerRow(["소스", "기준 시간대", "보정"], [3200, 2400, 3760]),
            dataRow(["CS01 CSV 이벤트 로그 (System, App, ADAM)", "UTC", "+9시간 -> KST"], [3200, 2400, 3760]),
            dataRow(["AD01 EVTX (PowerShell Get-WinEvent)", "KST (로컬 시간)", "보정 없음"], [3200, 2400, 3760]),
            dataRow(["UAG esmanager.log (+0900 표기)", "KST", "보정 없음"], [3200, 2400, 3760]),
            dataRow(["CS01 systeminfo", "KST (오전/오후 표기)", "보정 없음"], [3200, 2400, 3760]),
          ]
        }),
        para(""),
        richPara([
          { text: "검증: ", bold: true },
          { text: "systeminfo \"시스템 부트 시간: 2026-03-20, 오후 1:56:59\" (=13:56:59 KST) = CSV Event 1074 \"03/20/2026 04:56:40\" (UTC) + 9h = 13:56:40 KST", italics: true, size: 20, color: "555555" }
        ]),

        h1("부록 E: 분석에 사용된 로그 소스"),
        new Table({
          columnWidths: [2200, 3360, 3800],
          rows: [
            headerRow(["소스", "파일", "핵심 이벤트"], [2200, 3360, 3800]),
            dataRow(["AD01 System", "AD01-system.evtx", "NETLOGON 5827 (8건), 5722 (다수)"], [2200, 3360, 3800]),
            dataRow(["CS01 System", "System-log.csv", "Tcpip 4231/4227, NETLOGON 5719 (16건)"], [2200, 3360, 3800]),
            dataRow(["CS01 Application", "Application-log.csv", "VMware View NO_LOGON_SERVERS (49건)"], [2200, 3360, 3800]),
            dataRow(["CS01 ADAM", "ADAM (VMwareVDMDS)-log.csv", "Event 2536, 2089, 2887"], [2200, 3360, 3800]),
            dataRow(["CS01 LDAP Replica", "ldap_replica_status.txt", "CS01-CS02 복제 정상"], [2200, 3360, 3800]),
            dataRow(["CS01 Network", "netstat-an.txt", "loopback 100+개, 외부 30+개 연결"], [2200, 3360, 3800]),
            dataRow(["CS01 System Info", "systeminfo.txt", "Win2019, Hotfix 3개, 부트 13:56 KST"], [2200, 3360, 3800]),
            dataRow(["UAG ESManager", "esmanager.log", "백엔드 통신 실패"], [2200, 3360, 3800]),
          ]
        }),

        // End
        para("", { spaceBefore: 400 }),
        divider(),
        para("본 보고서는 CS01 SDC 번들, AD01 EVTX, UAG 로그의 원시 데이터를 기반으로 작성되었으며, 모든 타임스탬프는 UTC->KST 변환 규칙을 적용하였습니다.", { align: AlignmentType.CENTER, color: "999999", italics: true, size: 18 }),
        para("-- 보고서 끝 --", { align: AlignmentType.CENTER, color: "999999", italics: true }),
      ]
    }
  ]
});

const outPath = "D:\\Opencode\\VMware\\KRIHS\\KRIHS-CS01-AD-Connectivity-RCA-20260320.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log("DOCX created: " + outPath);
  console.log("Size: " + (buf.length / 1024).toFixed(1) + " KB");
});
