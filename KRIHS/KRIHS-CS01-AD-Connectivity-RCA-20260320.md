# KRIHS CS01 AD 연결 장애 원인 분석 보고서

**작성일**: 2026-03-20
**대상 시스템**: KRIHS Horizon VDI 환경
**장애 기간**: 2026-03-17 13:05 ~ 2026-03-20 13:57 (약 73시간)
**현재 상태**: CS01 재부팅으로 일시 정상화 (근본 원인 미해소)

> **참고**: CS01 VDM 지원 번들(vdm-sdct)의 이벤트 로그 CSV는 **UTC 기준**으로 기록되어 있습니다.
> 본 보고서의 모든 시각은 **KST (UTC+9)** 로 보정하여 표기합니다.
> (근거: systeminfo 부트 시간 "오후 1:56:59 KST" = CSV Event 1074 "04:56:40 UTC" → 차이 정확히 +9시간)
> AD01 EVTX는 PowerShell Get-WinEvent가 로컬 시간(KST)으로 출력하므로 보정 없이 사용합니다.

---

## 1. 환경 구성 (Environment Scope)

| 구성 요소 | 호스트명 | IP | 역할 | 비고 |
|-----------|---------|-----|------|------|
| Connection Server 1 | KRIHS-CS01 | 10.1.1.23 | Horizon CS (Primary) | Windows Server 2019 Std (17763) |
| Connection Server 2 | KRIHS-CS02 | 10.1.1.24 | Horizon CS (Replica) | - |
| Domain Controller 1 | AD01 | 10.1.1.21 | AD DC + DNS | krihs.vdi 도메인 |
| Domain Controller 2 | AD02 | 10.1.1.22 | AD DC + DNS | krihs.vdi 도메인 |
| SQL Server | - | 10.1.1.25 | Events DB | SQL 1433 |
| vCenter | - | 10.1.2.101 | vCenter Server | - |
| UAG | Krihs-UAG01 | 10.254.1.9 | Unified Access Gateway | v23.03.0.0 (21401666) |

**소프트웨어 버전**:
- Horizon Connection Server: **v8.9** (설치일: 2023-04-29)
- VMware Tools: **v12.5** (설치일: 2026-03-06)
- UAG: **v23.03.0.0** (Photon OS 3.0)
- JDK: 8u131 (설치일: 2022-02-09)
- AD 도메인: **krihs.vdi**
- OS 패치 수준: **KB4483452, KB4470788, KB4489899** (2018~2019년 패치 3개만 적용)

---

## 2. 장애 요약 (Issue Summary)

KRIHS-CS01 (Horizon Connection Server)에서 **AD 도메인 컨트롤러(krihs.vdi)와의 RPC 통신이 간헐적으로 실패**하여, 인증 서비스가 반복적으로 중단되었습니다. Secure Channel 자체는 유효(`nltest /sc_verify` 정상)하였으나, DC와의 **RPC 연결이 간헐적으로 불가능**한 상태가 지속되었습니다. 이로 인해:

1. **사용자 VDI 로그인 실패** — Horizon Broker가 AD DC를 찾지 못해 인증 처리 불가
2. **그룹 정책 처리 실패** — DC 이름 확인 불가
3. **Instant Clone VM 인증 실패** — VM 컴퓨터 계정 인증 거부
4. **ADAM (VMwareVDMDS) SCP 업데이트 실패** — AD에 서비스 연결 지점 등록 불가

---

## 3. 장애 타임라인 (Timeline) — 모든 시각 KST

```
2026-03-06         VMware Tools 12.5 + VC++ 2022 Redistributable 업데이트 설치
                   CS01 마지막 정상 재부팅 (uptime 카운트 시작)
                   ─── (정상 운영 11일간, uptime 910,780초 ≈ 10.5일) ───

2026-03-17 12:00   [CS01 System] Tcpip 4227 - TCP/IP 포트 재사용 실패 경고 (1/3회)
                   *** 네트워크 연결 불안정 징후 최초 발생 ***
2026-03-17 12:16   [CS01 System] Tcpip 4227 - TCP/IP 포트 재사용 실패 경고 (2/3회)
2026-03-17 12:50   [CS01 System] Tcpip 4227 - TCP/IP 포트 재사용 실패 경고 (3/3회)

2026-03-17 13:00   [CS01 System] Windows Update 관련 서비스 대량 시작
                   (Windows Update, Modules Installer, AppX Deployment,
                    Software Protection, State Repository 등 동시 기동)
                   *** Windows Update 자동 검사/작업 실행 추정 ***
2026-03-17 13:03   [CS01 App] BROKER_DETECTED_UNRECOGNIZED_SESSIONS
                   (UAG krihs-uag01 / CS02에서 미인식 세션 감지)

2026-03-17 13:05   [CS01 System] NETLOGON 5719 최초 발생
                   "KRIHS 도메인에 있는 도메인 컨트롤러에 보안 세션을 설정할 수 없습니다.
                    RPC 서버를 사용할 수 없습니다."
                   *** 장애 시작 (고객 보고 "17일 1시경"과 일치) ***

2026-03-17 14:00   [CS01 ADAM] Event 2887 - 비보안 LDAP 바인딩 경고
                   (SSL/TLS 단순 바인딩 150건, 서명 안 된 SASL 바인딩 5,204건)
2026-03-17 14:10   [CS01 System] GroupPolicy 1054 - DC 이름 확인 실패
2026-03-17 15:01   [CS01 ADAM] Event 2536 - VMwareVDMDS SCP 업데이트 실패 (Error 58)

2026-03-17 16:15   [CS01 App] BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS 최초 발생
                   *** 사용자 VDI 로그인 불가 시작 ***
2026-03-17 16:15~  NO_LOGON_SERVERS 반복 (16:15, 16:16, 16:19, 16:20)

2026-03-17 17:35   [CS01 System] NETLOGON 5719 재발
2026-03-17 22:01   [CS01 System] NETLOGON 5719 재발

2026-03-18 02:24   [CS01 System] NETLOGON 5719 재발
2026-03-18 03:02   [AD01 System] NETLOGON 5827 최초 발생 (KST, EVTX 원본)
                   "Netlogon 서비스가 컴퓨터에서의 취약한 Netlogon 보안 채널 연결을 거부"
                   대상: KRIHS-CS01 (krihs.vdi, Windows Server 2019 Std)
                   *** AD가 CS01의 연결을 적극 거부하기 시작 ***

2026-03-18 06:26   [CS01 System] NETLOGON 5719 재발
2026-03-18 07:51~  NO_LOGON_SERVERS 집중 발생 (07:51~07:59에 7건)
2026-03-18 09:47   [AD01 System] NETLOGON 5827 재발 (KST)
2026-03-18 10:11   [UAG] esmanager ERROR - 백엔드(CS01) 통신 실패, 인증 타임아웃
2026-03-18 10:16   [UAG] 인증 시도 응답 오류 - AUTHENTICATION_FAILED
2026-03-18 15:26   [CS01 System] NETLOGON 5719 재발
2026-03-18 18:06   [CS01 System] GroupPolicy 1054 재발
2026-03-19 03:26   [CS01 System] NETLOGON 5719 재발
2026-03-19 06:17   [AD01 System] NETLOGON 5827 재발 (KST)
2026-03-19 07:42   [AD01 System] NETLOGON 5827 재발 (KST)
2026-03-19 08:17   [CS01 System] LsaSrv 6038 - NTLM 인증 보안 경고

2026-03-19 ~       5719, NO_LOGON_SERVERS, 5827 지속 발생
2026-03-20 07:17   [AD01 System] NETLOGON 5827 재발 (KST)
2026-03-20 10:34~  NO_LOGON_SERVERS 집중 발생 (10:34~10:38에 11건)

2026-03-20 13:55   [CS01] 관리자(KRIHS\krihsis)가 CS01 수동 재부팅 실행
2026-03-20 13:57   [CS01] 시스템 시작 (systeminfo 부트 시간: 오후 1:56:59)
                   *** 재부팅으로 보안 채널 재협상 → 일시 정상화 ***

2026-03-20 13:57   [CS01] LDAP 복제 성공 확인 (CS01↔CS02 VMwareVDMDS)
2026-03-20 14:24   [CS01] VDM 지원 번들 수집 (vdm-sdct)
2026-03-20 14:29   [UAG] UAG 지원 번들 수집
```

---

## 4. 근본 원인 분석 (Root Cause Analysis)

### 4.1 직접 원인: CS01 → DC 간 RPC 통신 간헐적 실패

CS01에서 AD 도메인 컨트롤러(AD01/AD02)로의 **RPC 통신이 간헐적으로 실패**하여 Netlogon 인증 세션을 수립하지 못했습니다.

> **중요**: 장애 기간 중 `nltest /sc_verify:krihs.vdi` 결과는 **정상(NERR_Success)**이었습니다.
> 이는 Secure Channel 자체(컴퓨터 계정 비밀번호 동기화)는 유효하였으나, **DC와의 RPC 연결이 간헐적으로 실패**하는 상태였음을 의미합니다.

**증거 체인**:

| # | 증거 | 의미 |
|---|------|------|
| 1 | CS01 Tcpip 4227 (3/17 12:00~12:50, 3회) | **TCP/IP 포트 재사용 실패 — 네트워크 불안정 선행 징후** |
| 2 | CS01 NETLOGON 5719 (3/17~3/20, 16건, 3/17 이전 0건) | CS01이 DC와 **RPC 보안 세션 설정 불가** ("RPC 서버를 사용할 수 없습니다") |
| 3 | AD01 NETLOGON 5827 (3/18~3/20, 8건) | AD가 CS01의 Netlogon 연결을 **간헐적으로 거부** (ZeroLogon 관련 경고) |
| 4 | CS01 GroupPolicy 1054 (다수) | DC 이름 확인 실패 → DNS/RPC 통합 장애 |
| 5 | CS01 VMware View BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS (49건) | Horizon Broker가 AD DC 연결 불가 → 사용자 인증 실패 |
| 6 | CS01 ADAM 2536 (Error 58) | VMwareVDMDS가 AD에 SCP 개체 업데이트 불가 |
| 7 | AD01 NETLOGON 5722 (Instant Clone VM들) | Instant Clone VM 컴퓨터 계정 인증도 실패 |
| 8 | LDAP Global Replica: Error 81 (Server Down) | 글로벌 LDAP 쿼리 실패 |
| 9 | `nltest /sc_verify:krihs.vdi` = **정상** | **Secure Channel 자체는 유효** → 컴퓨터 계정 비밀번호 불일치가 아님 |

### 4.2 간헐적 RPC 연결 실패 원인 분석

**가장 유력한 원인: Windows Update 자동 작업에 의한 네트워크 리소스 경합 + TCP/IP 스택 불안정**

장애 직전 시간대에 다음 증거가 확인됩니다:
- **12:00~12:50 KST**: Tcpip 4227 (TCP/IP 포트 재사용 실패) 3회 발생 → **TCP/IP 스택 수준에서 이미 네트워크 불안정**
- **13:00 KST**: Windows Update, Modules Installer, AppX Deployment 등 **다수 서비스 동시 시작** → 네트워크/시스템 리소스 경합 발생
- **13:05 KST**: NETLOGON 5719 최초 발생 → DC와의 RPC 연결 실패 시작

> **참고 — Event 5827 (AD01)의 의미 재해석**:
> 5827은 "취약한 Netlogon 보안 채널 연결 거부"로, CVE-2020-1472 (ZeroLogon) Enforcement 관련 메시지입니다.
> 그러나 `nltest /sc_verify`가 정상이었으므로, 이 거부는 **영구적인 프로토콜 비호환이 아닌 간헐적 발생**으로 판단됩니다.
> RPC 연결 불안정 상태에서 Netlogon 재협상 시도가 불완전하게 진행되어 AD 측에서 간헐적으로 거부한 것으로 추정합니다.

**장애 트리거 분석**:

| 가능성 | 설명 | 가능성 수준 |
|--------|------|------------|
| **Windows Update 자동 작업 + TCP/IP 스택 불안정** | 12:00부터 Tcpip 4227이 3회 발생하여 TCP/IP 스택이 이미 불안정한 상태에서, 13:00에 Windows Update 관련 서비스들이 대량 시작 → 네트워크 리소스 경합으로 DC와의 RPC 연결 타임아웃 → NETLOGON 5719 발생. 이후 반복적인 RPC 실패가 5827 간헐적 거부로 이어짐 | **매우 높음** |
| **네트워크 인프라 간헐적 장애** | CS01↔AD01/AD02 간 네트워크 경로(스위치, VLAN)에서 간헐적 패킷 손실 또는 지연 발생 (Tcpip 4227이 뒷받침) | **높음** |
| **AD01의 ZeroLogon Enforcement 간헐적 거부** | AD01의 ZeroLogon 정책이 불안정한 RPC 연결 시 간헐적으로 CS01을 거부 (5827). 단, sc_verify 정상이므로 영구 차단은 아님 | **중간** |
| **3/6 VMware Tools 업데이트 후 부작용** | VMware Tools 12.5 + VC++ 2022 업데이트 후 네트워크 드라이버/TCP 스택 영향 (Tcpip 4227 원인 가능) | **낮음~중간** |

> **제외된 원인**: CS01 컴퓨터 계정 비밀번호 불일치 — `nltest /sc_verify` 정상으로 확인, 해당 없음

### 4.3 재부팅으로 복구된 이유

CS01 재부팅 시:
1. **TCP/IP 스택 완전 초기화** → Tcpip 4227 원인이 된 포트/연결 상태 정리
2. **Netlogon 서비스 새로 시작** → DC와 RPC 연결을 깨끗한 상태에서 재설정
3. **Kerberos 티켓 캐시 초기화** → 새 TGT 발급
4. **DNS 캐시 초기화** → DC SRV 레코드 재조회
5. **Windows Update 관련 서비스 초기화** → 리소스 경합 해소

→ 결과적으로 네트워크 스택이 정상화되어 DC와의 RPC 연결이 **안정적으로 재설정**

---

## 5. 영향 범위 (Impact Assessment)

| 영향 항목 | 상세 |
|-----------|------|
| **사용자 VDI 로그인** | 3/17 16:15 ~ 3/20 13:57 KST 동안 간헐적~지속적 로그인 실패 |
| **Instant Clone VM** | E3MAH17-xxxxx, E3MAJ17-xxxxx 등 VM 컴퓨터 계정 인증 실패 (5722) |
| **그룹 정책** | CS01에 대한 GPO 적용 불가 (보안 설정 미반영) |
| **UAG 외부 접속** | UAG → CS01 백엔드 통신 시 인증 타임아웃 발생 |
| **VMwareVDMDS** | AD에 SCP 등록 실패 → CS01의 서비스 검색 가능성 저하 |
| **LDAP 복제** | CS01↔CS02 간 VDMDS 복제는 정상 유지 (로컬 LDAP) |

---

## 6. 위험 요소 및 잔여 리스크 (Risk Assessment)

### 6.1 즉시 해결 필요 (Critical)

| # | 위험 요소 | 영향 | 긴급도 |
|---|-----------|------|--------|
| 1 | **CS01 OS 패치 심각하게 미적용** (2019년 이후 패치 없음) | ZeroLogon 등 보안 취약점 노출, 5827 간헐적 거부 재발 가능 | **긴급** |
| 2 | **TCP/IP 스택 불안정 원인 미해소** | Tcpip 4227 근본 원인(네트워크 인프라 또는 드라이버) 미확인, 재발 시 동일 장애 | **긴급** |
| 3 | **Instant Clone VM 컴퓨터 계정 불일치** (Event 5722 지속) | VM에서 AD 인증 실패 반복 가능 | **긴급** |
| 4 | **Event 5827 간헐적 재발 가능** | 네트워크 불안정 시 AD가 CS01 RPC 연결을 다시 거부할 수 있음 | **높음** |

### 6.2 단기 해결 필요 (High)

| # | 위험 요소 | 영향 |
|---|-----------|------|
| 4 | VMwareVDMDS 백업 90일 이상 미실시 (ADAM 2089) | 데이터 손실 위험 |
| 5 | 비보안 LDAP 바인딩 5,204건/일 (ADAM 2887) | 보안 감사 지적, 자격증명 노출 가능 |
| 6 | JDK 8u131 (2017년 버전) | 다수 보안 취약점 존재 |
| 7 | UAG v23.03 — Photon OS 3.0 EOL | 보안 패치 미지원 |

---

## 7. 권장 조치 사항 (Recommended Actions)

### 7.1 긴급 조치 (즉시)

```
1. CS01 네트워크 안정성 점검
   - CS01 → AD01/AD02 간 네트워크 경로 점검 (ping, tracert, pathping)
   - 스위치 포트/VLAN 설정 확인, 간헐적 패킷 손실 여부 확인
   - CS01 NIC(vmxnet3) 드라이버 상태 및 오류 카운터 확인
     (netstat -e, Get-NetAdapterStatistics)
   - Tcpip 4227 재발 여부 모니터링

2. Windows Update 자동 실행 제어
   - CS01의 Windows Update 서비스 자동 시작을 "수동"으로 변경 (임시 조치)
   - 향후 패치 적용은 점검 시간(maintenance window)에만 수동 실행
   - GPO 또는 로컬 정책: "자동 업데이트 구성" → "다운로드 후 알림" 설정

3. Instant Clone VM 컴퓨터 계정 정리
   - Horizon Admin Console에서 영향받은 풀의 Instant Clone 재생성(push image)
   - 또는 AD에서 stale 컴퓨터 계정(E3MAH17-*, E3MAJ17-*) 삭제 후 재프로비저닝
```

> **참고**: `nltest /sc_verify:krihs.vdi`는 장애 중에도 정상(NERR_Success)이었으므로,
> `netdom resetpwd` (컴퓨터 계정 비밀번호 재설정)는 **불필요**합니다.

### 7.2 단기 조치 (1주 이내)

```
4. CS01 Windows Update 긴급 적용
   - 현재: KB 3개 (2018~2019)
   - 최소: 2026년 3월 누적 업데이트까지 적용
   - 특히 CVE-2020-1472 (ZeroLogon) 관련 패치 필수
   - 주의: 점검 시간(maintenance window)에 실행, 스냅샷 사전 생성

5. VMwareVDMDS 백업 실시
   - Connection Server에서 vdmexport 명령으로 LDAP 데이터 백업
   - 정기 백업 스케줄 수립 (주 1회 권장)

6. JDK 업데이트
   - 현재: JDK 8u131 (2017)
   - Horizon 8.9 호환 최신 JDK 8 버전으로 업데이트
```

### 7.3 중장기 조치 (1개월 이내)

```
7. LDAP 서명/채널 바인딩 강화
   - ADAM 2887 경고 해결: LDAP 서명 필수 설정
   - GPO: "Domain controller: LDAP server signing requirements" → "Require signing"

8. UAG 업그레이드
   - 현재: v23.03 (Photon OS 3.0, EOL)
   - 권장: 최신 UAG 버전으로 업그레이드

9. Horizon Connection Server 업그레이드 검토
   - 현재: v8.9 (2023-04-29 설치)
   - 최신 8.x 릴리스로 업그레이드 검토

10. 모니터링 강화
    - NETLOGON 5719, 5827 이벤트 모니터링 알림 설정
    - Secure Channel 상태 주기적 점검 스크립트 배포
    - nltest /sc_verify 결과를 정기적으로 수집
```

---

## 8. 재발 방지 대책 (Preventive Measures)

| # | 대책 | 상세 |
|---|------|------|
| 1 | **정기 패치 관리** | CS01/CS02에 분기 1회 이상 Windows Update 적용 (점검 시간에 수동 실행) |
| 2 | **네트워크 안정성 모니터링** | CS01↔AD01/AD02 간 Tcpip 4227, NETLOGON 5719 이벤트 실시간 알림 |
| 3 | **Windows Update 자동 실행 제어** | CS 서버의 자동 업데이트를 "다운로드 후 알림"으로 설정, 업무 시간 중 자동 설치 방지 |
| 4 | **정기 재부팅 계획** | 분기 1회 CS 순차 재부팅 (패치 적용과 병행, TCP/IP 스택 초기화 효과) |
| 5 | **VMwareVDMDS 백업 자동화** | 주 1회 vdmexport 스케줄 작업 등록 |
| 6 | **AD 이벤트 로그 중앙 수집** | 5719, 5722, 5827, 1054, Tcpip 4227 이벤트 실시간 알림 |
| 7 | **NIC/네트워크 인프라 정기 점검** | vmxnet3 드라이버 오류, 스위치 포트 CRC/Drop 카운터 주기적 확인 |

---

## 9. 결론 (Conclusion)

본 장애의 근본 원인은 **KRIHS-CS01과 AD 도메인 컨트롤러 간의 RPC 통신 간헐적 실패**입니다. Secure Channel 자체는 유효(`nltest /sc_verify` 정상)하였으나, **TCP/IP 스택 불안정**(Tcpip 4227, 12:00~12:50 KST)과 **Windows Update 자동 작업에 의한 네트워크 리소스 경합**(13:00 KST)이 복합적으로 작용하여 DC와의 RPC 연결이 반복적으로 실패한 것으로 판단됩니다.

AD01의 NETLOGON 5827(ZeroLogon Enforcement 관련 거부)은 RPC 불안정 상태에서의 **간헐적 현상**이며, CS01의 극심한 패치 부족(2019년 이후 미적용)이 이 간헐적 거부의 배경 요인으로 작용하였습니다.

재부팅으로 TCP/IP 스택이 초기화되어 일시 복구되었으나, **네트워크 불안정의 근본 원인(NIC 드라이버, 네트워크 인프라)이 미해소**된 상태이므로 동일 장애가 재발할 가능성이 있습니다. 우선적으로 **CS01 네트워크 안정성 점검**, **Windows Update 자동 실행 제어**, **긴급 OS 패치 적용**이 필요합니다.

---

## 부록 A: 시간대 보정 근거

| 소스 | 기준 시간대 | 보정 |
|------|------------|------|
| CS01 CSV 이벤트 로그 (System, Application, ADAM) | **UTC** | +9시간 → KST |
| AD01 EVTX (PowerShell Get-WinEvent) | **KST** (로컬 시간 출력) | 보정 없음 |
| UAG esmanager.log (`+0900` 표기) | **KST** | 보정 없음 |
| CS01 systeminfo | **KST** (오전/오후 표기) | 보정 없음 |

**검증**: systeminfo "시스템 부트 시간: 2026-03-20, 오후 1:56:59" (=13:56:59 KST) = CSV Event 1074 "03/20/2026 04:56:40" (UTC) + 9h = 13:56:40 KST ✓

## 부록 B: 분석에 사용된 로그 소스

| 소스 | 파일 | 핵심 이벤트 |
|------|------|------------|
| AD01 System Event Log | `AD01-system.evtx` | NETLOGON 5827 (8건), 5722 (다수) |
| AD01 Security Event Log | `AD01-security.evtx` | Event 4625 로그인 실패 (Instant Clone VMs) |
| CS01 System Event Log | `System-log.csv` | NETLOGON 5719 (16건), GroupPolicy 1054, LsaSrv 6038 |
| CS01 Application Event Log | `Application-log.csv` | VMware View 104 NO_LOGON_SERVERS (49건) |
| CS01 ADAM Event Log | `ADAM (VMwareVDMDS)-log.csv` | Event 2536 (SCP 실패), 2089 (백업 경고), 2887 (비보안 LDAP) |
| CS01 LDAP Replica Status | `ldap_replica_status.txt` | CS01↔CS02 복제 정상 |
| CS01 LDAP Global Status | `ldap_replica_status-global.txt` | **LDAP Error 81 (Server Down)** |
| CS01 Network Config | `ipconfig-all.txt`, `netstat-an.txt` | DNS=10.1.1.21/22, AD LDAP 389 연결 상태 |
| CS01 System Info | `systeminfo.txt` | Win2019 (17763), Hotfix 3개만 적용, 부트 시간 13:56 KST |
| CS01 Installed Software | `installed_software.txt` | Horizon CS 8.9, VMware Tools 12.5, JDK 8u131 |
| UAG ESManager Log | `esmanager.log` | 백엔드 통신 실패, 인증 타임아웃 |
| UAG Version | `version.info` | UAG v23.03.0.0, Photon OS 3.0 |
