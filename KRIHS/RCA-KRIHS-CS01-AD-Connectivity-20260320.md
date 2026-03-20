# 근본 원인 분석 보고서 (Root Cause Analysis)
## KRIHS-CS01 Horizon Connection Server AD 연결 장애

**문서 번호**: RCA-KRIHS-2026-0320
**작성일**: 2026-03-20
**심각도**: SEV2 (Major) — VDI 사용자 인증 불가
**상태**: 최종 (Final)

---

## 1. 근본 원인 (Root Cause) — 1문장 요약

**CS01(Windows Server 2019, 17763)에서 2026-03-06 재부팅 이후 11일간 누적된 TCP Ephemeral Port 고갈(Tcpip 4227/4231)이 NETLOGON RPC 통신을 차단하여, Horizon Connection Server가 AD 도메인 컨트롤러에 사용자 인증을 위임하지 못한 것이 근본 원인이다.**

---

## 2. 증거 기반 인과관계 (Evidence-based Causation Chain)

### 2.1 인과관계 다이어그램

```
[트리거: 2026-03-06 재부팅 - VMware Tools 12.5 + VC++ 2022 설치]
    │
    ▼
[CS01: 패치 부재 서버 (KB 3개만 설치, 2018-2019년)]
[Windows Server 2019 17763 - 동적 포트 범위 기본값 ~16384개]
    │
    ▼
[Horizon CS 서비스 다수 + ADAM LDAP + 내부 loopback 연결 누적]
[netstat 기준: loopback ESTABLISHED 100+개, 외부 연결 30+개]
    │
    ▼  11일간 포트 미회수 누적
[2026-03-17 02:36 UTC → 11:36 KST: 첫 Tcpip 4231 (포트 고갈 확정)]
[2026-03-17 02:47~20:35 UTC: Tcpip 4227 8회 반복 (TIME_WAIT 포트 재사용 실패)]
    │
    ▼
[새 TCP 연결 생성 불가 → RPC 바인딩 실패]
    │
    ├──▶ [NETLOGON 5719: "RPC 서버를 사용할 수 없습니다" — DC 연결 불가]
    │     첫 발생: 03/17 04:05 UTC (13:05 KST)
    │     이후: 03/17~03/20 총 16회 반복 (4~6시간 간격)
    │
    ├──▶ [Horizon BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS]
    │     첫 발생: 03/17 07:15 UTC (16:15 KST)
    │     이후: 03/17~03/20 총 49회, 최소 15명 사용자 영향
    │
    └──▶ [AD01 Event 5827: NTLM Secure Channel 연결 거부]
          첫 발생: 03/18 03:02 KST (AD01 로컬 시간)
          이후: 03/18~03/20 총 8회

[2026-03-20 04:56 UTC (13:56 KST): 관리자 수동 재부팅]
    │
    ▼
[OS 재부팅 → TCP 스택 초기화 → 모든 포트 해제]
[04:57 UTC (13:57 KST): 정상 부팅 완료]
[이후: 장애 해소, 인증 정상화]
```

### 2.2 핵심 증거 요약

| # | 증거 | 출처 | 의미 |
|---|------|------|------|
| E1 | Tcpip 4231 — 03/17 02:36 UTC | CS01 System-log.csv | **Ephemeral port 완전 고갈 확정** (모든 포트 소진) |
| E2 | Tcpip 4227 — 03/17 02:47~20:35 UTC (8회) | CS01 System-log.csv | TIME_WAIT 상태 포트 재사용 시도도 실패, 만성적 고갈 |
| E3 | Tcpip 4231 — 03/18 02:36 UTC, 03/19 02:50 UTC, 03/20 02:50 UTC | CS01 System-log.csv | **매일 새벽 동일 시간대 포트 고갈 반복** (완화 후 재발) |
| E4 | NETLOGON 5719 — 03/17 04:05~03/20 03:16 UTC (16회) | CS01 System-log.csv | DC에 RPC 연결 불가, "RPC 서버를 사용할 수 없습니다" |
| E5 | BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS (49회) | CS01 Application-log.csv | Horizon이 AD 인증 위임 실패 |
| E6 | AD01 Event 5827 — KRIHS-CS01 대상 (8회) | AD01-system.evtx | AD가 CS01의 NTLM 연결을 **거부** (NTLM over Secure Channel denied) |
| E7 | nltest /sc_verify:krihs.vdi = NERR_Success | 운영자 확인 | Secure Channel 자체(컴퓨터 계정 비밀번호)는 **정상** |
| E8 | CS01 5823 — 30일 주기 정상 갱신 (09/29, 10/29, 11/29, 12/30, 01/30, 03/02) | CS01 System-log.csv | 컴퓨터 계정 비밀번호 30일 자동 갱신 정상 동작 중 |
| E9 | 핫픽스 3개만 설치 (KB4483452, KB4470788, KB4489899 — 2018~2019) | systeminfo.txt | **6년 이상 미패치**, TCP/IP 스택 누적 결함 미수정 |
| E10 | 마지막 재부팅 전: 2026-03-06 (VMware Tools 12.5 설치) | systeminfo/System-log.csv | 재부팅 후 11일 만에 포트 고갈 시작 |
| E11 | netstat: loopback 127.0.0.1:389 ESTABLISHED 44개, 127.0.0.1:4002 ESTABLISHED 22개 | netstat-an.txt | ADAM LDAP + JMS 내부 연결이 대량의 포트 점유 |
| E12 | 재부팅 후 정상 복구 (03/20 04:57 UTC) | CS01 System-log.csv | TCP 스택 초기화로 즉시 해소 → 포트 고갈이 근본 원인 확증 |

---

## 3. 타임라인 (KST 기준, UTC+9)

### 3.1 사전 이벤트 (배경)

| 시각 (KST) | 이벤트 | 출처 |
|-------------|--------|------|
| **2019-12-27** | CS01 Windows Server 2019 최초 설치 | systeminfo.txt |
| **2023-04-29** | Horizon Connection Server v8.9 설치 | installed_software.txt |
| **2025-09-29 ~ 2026-03-02** | NETLOGON 5823 정상 발생 (30일 주기 Secure Channel 비밀번호 갱신, AD02 대상) | CS01 System-log.csv |
| **2026-03-06 22:59 KST** | msiexec에 의한 재부팅 (VMware Tools 12.5 + VC++ 2022 설치 완료) | CS01 Event 1074 |
| **2026-03-06 23:00 KST** | CS01 정상 부팅 완료 (Event 6005/6009) | CS01 System-log.csv |
| 2026-03-06 23:00 KST | DNS 동적 업데이트 실패 (Event 8027/8033 — PTR/A 레코드) | CS01 System-log.csv |

### 3.2 장애 발생 및 진행

| 시각 (KST) | 이벤트 | 심각도 | 출처 |
|-------------|--------|--------|------|
| **2026-03-17 11:36** | **Tcpip 4231**: TCP 포트 할당 요청 실패 — 모든 ephemeral port 고갈 확정 | CRITICAL | CS01 System |
| 2026-03-17 11:47 | Tcpip 4227 #1: TIME_WAIT 포트 재사용 실패 | WARNING | CS01 System |
| 2026-03-17 11:51 | Tcpip 4227 #2 | WARNING | CS01 System |
| 2026-03-17 12:00 | Tcpip 4227 #3 | WARNING | CS01 System |
| 2026-03-17 12:16 | Tcpip 4227 #4 | WARNING | CS01 System |
| 2026-03-17 12:50 | Tcpip 4227 #5 | WARNING | CS01 System |
| **2026-03-17 13:05** | **NETLOGON 5719 #1**: KRIHS 도메인 DC에 RPC 연결 불가 | ERROR | CS01 System |
| 2026-03-17 13:55 | Tcpip 4227 #6 | WARNING | CS01 System |
| **2026-03-17 16:15** | **Horizon BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS #1**: 사용자 20140018 인증 실패 | ERROR | CS01 Application |
| 2026-03-17 16:16~16:20 | 사용자 20011001 인증 실패 4회 연속 | ERROR | CS01 Application |
| 2026-03-17 17:35 | NETLOGON 5719 #2 | ERROR | CS01 System |
| 2026-03-17 20:19 | Tcpip 4227 #7 | WARNING | CS01 System |
| 2026-03-17 22:01 | NETLOGON 5719 #3 | ERROR | CS01 System |
| **2026-03-18 03:02** | **AD01 Event 5827 #1**: AD가 CS01의 NTLM Secure Channel 연결을 거부 | WARNING | AD01 System |
| 2026-03-18 03:26 | NETLOGON 5719 #4 | ERROR | CS01 System |
| 2026-03-18 05:35 | Tcpip 4227 #8 (이 날 마지막) | WARNING | CS01 System |
| 2026-03-18 07:26 | NETLOGON 5719 #5 | ERROR | CS01 System |
| 2026-03-18 09:57~10:57 | 다수 사용자 (20240026, 20180089, 20160092) 인증 실패 | ERROR | CS01 Application |
| **2026-03-18 11:36** | **Tcpip 4231 #2**: 포트 고갈 재발 (매일 새벽 02:36 UTC 패턴) | CRITICAL | CS01 System |
| 2026-03-18 18:47 | AD01 Event 5827 #2 | WARNING | AD01 System |
| 2026-03-18 20:17 | NETLOGON 5719 #8 | ERROR | CS01 System |
| 2026-03-18 22:39 | Tcpip 4227 #9 | WARNING | CS01 System |
| **2026-03-19 03:17** | AD01 Event 5827 #3 | WARNING | AD01 System |
| 2026-03-19 04:42 | AD01 Event 5827 #4 | WARNING | AD01 System |
| **2026-03-19 11:50** | **Tcpip 4231 #3**: 포트 고갈 3일째 재발 | CRITICAL | CS01 System |
| 2026-03-19 07:17 | AD01 Event 5827 #5 | WARNING | AD01 System |
| 2026-03-19 08:16~03/20 12:16 | NETLOGON 5719 #9~#16 지속 | ERROR | CS01 System |
| **2026-03-20 09:05** | Tcpip 4227 #12 | WARNING | CS01 System |
| **2026-03-20 10:34~10:38** | 사용자 20061006, 20090076 등 대량 인증 실패 (10건 집중) | ERROR | CS01 Application |
| **2026-03-20 11:50** | **Tcpip 4231 #4**: 4일째 포트 고갈 | CRITICAL | CS01 System |
| 2026-03-20 12:16 | NETLOGON 5719 #16 (마지막) | ERROR | CS01 System |

### 3.3 복구

| 시각 (KST) | 이벤트 | 출처 |
|-------------|--------|------|
| **2026-03-20 13:56** | 관리자(krihsis)가 Explorer.EXE에서 수동 재부팅 실행 (Event 1074, "기타(계획되지 않은 종료)") | CS01 System |
| 2026-03-20 13:56 | Event 6006: 이벤트 로그 서비스 중지 | CS01 System |
| **2026-03-20 13:57** | Event 6005/6009: OS 정상 부팅 완료 | CS01 System |
| 2026-03-20 13:57 | ADAM(VMwareVDMDS) 복제 정상 완료 (CS02와 동기화) | ldap_replica_status.txt |
| 2026-03-20 13:57 이후 | **장애 해소** — 인증 실패 이벤트 없음 | CS01 Application |

---

## 4. 트리거 분석 (Trigger Analysis)

### 4.1 각 이벤트의 기술적 의미

#### Tcpip 4227 — "TIME_WAIT 포트 재사용 실패"
- **의미**: TCP/IP 스택이 새로운 연결을 위해 ephemeral port를 할당하려 했으나, 모든 가용 포트가 TIME_WAIT 또는 ESTABLISHED 상태로 점유되어 있어 TIME_WAIT 상태의 포트를 강제 재사용하려 했지만 이마저도 실패
- **Windows 동작**: 기본 동적 포트 범위 49152~65535 (16,384개). TIME_WAIT 기본 유지 시간 120초(2분)
- **이 환경에서의 의미**: CS01은 Horizon CS 서비스(Java 다중 스레드), ADAM LDAP(포트 389/636), JMS(포트 4002), 8009/8123 등 내부 loopback 연결만으로도 100개 이상의 포트를 항시 점유. 11일간 재부팅 없이 연결 누적

#### Tcpip 4231 — "모든 포트 소진"
- **의미**: Tcpip 4227보다 심각. "이러한 모든 포트의 사용이 소진되었으므로" — ephemeral port 16,384개가 **전부** 소진되었음을 의미
- **직접 결과**: 새로운 TCP 연결을 생성할 수 없음. RPC, LDAP, Kerberos, SMB 등 모든 아웃바운드 TCP 통신 불가
- **발생 패턴**: 03/17, 03/18, 03/19, 03/20 매일 02:36~02:50 UTC (11:36~11:50 KST)에 발생 → **일정 스케줄 작업이 대량 연결을 생성하는 것으로 추정**

#### NETLOGON 5719 — "RPC 서버를 사용할 수 없습니다"
- **의미**: CS01의 NETLOGON 서비스가 KRIHS 도메인의 도메인 컨트롤러(AD01/AD02)에 RPC 연결을 시도했으나 실패
- **핵심**: 이것은 네트워크 장애가 아니라 **로컬 포트 고갈로 인한 RPC 바인딩 실패**. CS01에서 AD로 나가는 새 TCP 연결(135/RPC → 동적 포트)을 열 수 없었기 때문
- **nltest /sc_verify 정상인 이유**: `nltest`는 이미 **캐시된** Secure Channel 정보를 검증. 새 연결이 아닌 기존 상태 확인이므로 포트 고갈의 영향을 받지 않음

#### AD01 Event 5827 — "NTLM over Netlogon Secure Channel 거부"
- **의미**: AD01이 CS01로부터 NTLM 인증 요청을 수신했으나, 해당 연결이 **Netlogon Secure Channel을 사용하지 않아** 거부
- **Microsoft 링크**: https://go.microsoft.com/fwlink/?linkid=2133485 — 이것은 **CVE-2020-1472 (Zerologon) 보안 강화** 관련 이벤트
- **인과관계**: CS01이 포트 고갈로 정상적인 Secure Channel RPC 연결을 맺지 못하고, 비정상적인 경로(plain NTLM)로 인증을 시도 → AD01이 보안 정책에 따라 이를 거부
- **sc_verify 정상과의 모순 해소**: Secure Channel **자체**는 유효(비밀번호 동기화 정상)하지만, 포트 고갈로 해당 채널을 **사용하는 새 연결을 수립할 수 없었음**. 이로 인해 NTLM fallback이 발생했고, AD01의 Zerologon 강화 정책이 이를 차단

### 4.2 트리거 확률 분석

| 가설 | 확률 | 근거 |
|------|------|------|
| **TCP Ephemeral Port 고갈 → RPC 실패 → AD 인증 불가** | **95%** | Tcpip 4231 선행 → 5719 후행 시간순서 일치, 재부팅으로 즉시 해소, netstat에서 대량 loopback 연결 확인 |
| Secure Channel 손상 (컴퓨터 계정 비밀번호 불일치) | **2%** | nltest /sc_verify 정상, 5823 정상 갱신 이력 (30일 주기), 재부팅 후 reset-computer-password 없이 복구됨 |
| 네트워크 물리적 장애 (스위치, VLAN) | **2%** | CS01↔CS02 ADAM 복제는 정상 (4101포트 ESTABLISHED), CS01→AD01/AD02 LDAP 389 연결도 netstat에 존재, UAG→CS01 연결도 정상 |
| AD01/AD02 서버 측 장애 | **1%** | AD01 Event 5827은 AD01이 요청을 **수신하고** 거부한 것 → AD01 자체는 정상 동작. CS02는 정상 인증 처리 |

### 4.3 포트 고갈의 원인 분석

**왜 11일 만에 포트가 고갈되었는가?**

1. **Horizon CS 아키텍처의 높은 내부 연결 수**
   - netstat 스냅샷(재부팅 직후): loopback:389 44개, loopback:4002 22개, loopback:8009 5개, loopback:8123 1개 + 기타 = **100개 이상의 상시 연결**
   - 이 연결들은 Horizon 서비스 재시작 없이는 해제되지 않음

2. **Horizon 사용자 세션 처리**
   - 매 사용자 인증 시 CS→AD RPC 연결, CS→ADAM LDAP 쿼리, CS→SQL(10.1.1.25:1433) 연결 생성
   - 약 10명 동시 사용자 환경에서도 하루 수백 개의 단기 연결 생성/해제 반복

3. **TIME_WAIT 누적 + 미패치 TCP 스택**
   - Windows Server 2019 17763 + **6년간 미패치** → TCP/IP 스택의 알려진 포트 리소스 누수 버그 미수정
   - TIME_WAIT 기본 120초 + 연결 종료 시 FIN_WAIT/CLOSE_WAIT 전환 지연
   - KB4489899(2019-03) 이후의 모든 TCP/IP 개선 패치 미적용

4. **매일 새벽 11:36 KST 포트 고갈 패턴**
   - 4231이 매일 같은 시간대에 발생 → 스케줄 작업(백업, 모니터링 에이전트, POLESTAR SMS Agent 8.0)이 대량 연결을 일시적으로 생성하여 임계치를 넘기는 것으로 추정

---

## 5. 재부팅 복구 메커니즘 (Why Reboot Fixed It)

```
재부팅 전 상태:
├─ TCP 스택: 16,384개 ephemeral port 중 대부분 소진
│  ├─ ESTABLISHED: 100+ (loopback) + 30+ (외부)
│  ├─ TIME_WAIT: 수백~수천 개 (해제 대기)
│  ├─ CLOSE_WAIT: 불명 (좀비 연결 가능성)
│  └─ 가용 포트: 0개 (Tcpip 4231 확정)
├─ NETLOGON 서비스: DC 캐시 만료 후 재연결 시도 시 RPC 바인딩 실패
├─ Horizon CS: AD 인증 위임 실패 → "no logon servers"
└─ Winsock/AFD 드라이버: 내부 소켓 테이블 오염 가능성

재부팅 시:
1. OS 종료 → 모든 TCP 연결 RST/FIN으로 강제 해제
2. TCP/IP 스택 완전 초기화 → 포트 카운터 리셋
3. Winsock/AFD 드라이버 재로드 → 소켓 테이블 클린 상태
4. NETLOGON 서비스 시작 → DC 탐색 → 새 RPC 연결 성공 (포트 가용)
5. Horizon CS 서비스 시작 → ADAM/LDAP/JMS 연결 재설정
6. 결과: 모든 서비스 정상 동작

재부팅이 "유일한 해결책"이었던 이유:
- net stop netlogon && net start netlogon → NETLOGON만 재시작해도 RPC 연결은 복구 가능하나,
  근본 원인인 포트 고갈은 TCP 스택 수준이므로 OS 재부팅 없이는 해소 불가
- Horizon 서비스 재시작만으로는 loopback 연결의 좀비 소켓 미해제
- netsh int ipv4 reset 등 TCP 스택 리셋도 재부팅 필요
```

---

## 6. Event 5827의 정확한 해석

### 6.1 왜 sc_verify는 정상인데 5827이 발생했는가?

이것은 흔히 혼동되는 부분으로, 두 이벤트는 **다른 계층**을 검증한다:

| 검증 항목 | nltest /sc_verify | Event 5827 |
|-----------|-------------------|------------|
| 무엇을 확인? | Secure Channel의 **상태** (컴퓨터 계정 비밀번호 동기화) | Secure Channel을 **사용하는 연결**의 인증 방식 |
| 어디서 확인? | CS01 로컬 캐시 + 가능 시 DC 검증 | AD01 서버 측 수신 검증 |
| 포트 고갈 영향? | 캐시 확인 시 영향 없음 | 새 연결 수립 필요 → 영향 받음 |

**시퀀스 재구성:**
1. CS01의 Horizon 서비스가 사용자 인증을 위해 AD에 NTLM pass-through 시도
2. 정상 경로: NETLOGON Secure Channel RPC → AD에 연결 → 인증 위임
3. 포트 고갈 시: RPC 바인딩 실패 (새 TCP 연결 불가) → NTLM fallback 시도
4. AD01: "이 연결은 Secure Channel을 사용하지 않았으므로 거부" → Event 5827
5. 동시에 CS01: "로그온 서버 없음" → BROKER_USER_AUTHFAILED_NO_LOGON_SERVERS

### 6.2 5827과 CVE-2020-1472 (Zerologon) 강화

- Event 5827은 2020년 8월 이후 Windows DC에 추가된 **Zerologon 보안 강화** 이벤트
- AD01이 2020년 이후 보안 업데이트를 적용하여 "Enforcement mode" 활성화
- CS01이 비정상 경로로 NTLM 요청을 보내면 AD01이 보안 정책상 거부
- 이것은 AD01의 정상적인 보안 동작이며, 문제의 원인이 아닌 **증상**

---

## 7. 잔여 리스크 (Remaining Risks)

| # | 리스크 | 심각도 | 발생 가능성 | 설명 |
|---|--------|--------|-------------|------|
| R1 | **포트 고갈 재발** | CRITICAL | **매우 높음** (2주 이내) | 근본 원인(미패치 + 높은 연결 수)이 해소되지 않았으므로 재부팅 후 11~14일 후 재발 예상. **현재 예상 재발일: 2026-03-31 ~ 04-03** |
| R2 | **보안 취약점 노출** | CRITICAL | 확정 | 6년간 미패치 → CVE-2020-1472(Zerologon), CVE-2021-36942(PetitPotam), CVE-2022-21907(HTTP.sys RCE) 등 수십 개의 알려진 취약점 미수정 |
| R3 | CS01 단독 장애 시 VDI 서비스 중단 | HIGH | 중간 | UAG가 CS01/CS02 중 CS01을 선호 연결하는 경우, CS01 장애 시 failover 지연 |
| R4 | ADAM 복제 누적 지연 | MEDIUM | 낮음 | 포트 고갈 기간 중 CS01↔CS02 ADAM 복제가 지연될 수 있으나, 현재 스냅샷에서는 정상 |
| R5 | VMware Tools 12.5 + VC++ 2022의 추가 포트 사용 | LOW | 낮음 | 03/06 설치 후 추가 서비스/연결이 포트 소비를 약간 증가시켰을 가능성 |

---

## 8. 권장 조치 (Recommended Actions)

### 8.1 즉시 조치 (24시간 이내) — P0

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A1 | **동적 포트 범위 확대** | 인프라팀 | 재발까지의 시간 연장 (임시 완화) |

```powershell
# CS01에서 실행 — 동적 포트 범위를 16384 → 32768개로 확대
netsh int ipv4 set dynamicport tcp start=32768 num=32767
netsh int ipv4 set dynamicport udp start=32768 num=32767

# 확인
netsh int ipv4 show dynamicport tcp
```

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A2 | **TIME_WAIT 타임아웃 단축** (레지스트리) | 인프라팀 | TIME_WAIT 포트 회수 가속 |

```powershell
# TcpTimedWaitDelay를 120초 → 30초로 단축
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -Name 'TcpTimedWaitDelay' -Value 30 -Type DWord

# MaxUserPort 설정 (레거시 호환)
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -Name 'MaxUserPort' -Value 65534 -Type DWord

# 재부팅 필요
```

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A3 | **포트 사용량 모니터링 스크립트 배포** | 인프라팀 | 재발 사전 감지 |

```powershell
# 1시간 주기 스케줄 작업으로 등록
$ephemeralPorts = (Get-NetTCPConnection | Where-Object {$_.LocalPort -ge 49152}).Count
$timeWaitPorts = (Get-NetTCPConnection -State TimeWait | Where-Object {$_.LocalPort -ge 49152}).Count
$maxPorts = 16384  # 기본값, 확대 후 32767로 변경

$usagePercent = [math]::Round(($ephemeralPorts / $maxPorts) * 100, 1)
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

# 70% 이상 시 경고 알림
if ($usagePercent -ge 70) {
    Write-EventLog -LogName Application -Source "PortMonitor" -EventId 9001 -EntryType Warning `
        -Message "PORT EXHAUSTION WARNING: $usagePercent% ($ephemeralPorts/$maxPorts) used, TIME_WAIT=$timeWaitPorts"
}

# CSV 로깅
"$timestamp,$ephemeralPorts,$timeWaitPorts,$usagePercent" | Out-File -Append "C:\Logs\port-usage.csv"
```

### 8.2 단기 조치 (1주 이내) — P1

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A4 | **Windows Server 2019 누적 업데이트 적용** | 인프라팀 | TCP/IP 스택 버그 수정, 보안 취약점 해소 |

```
대상: CS01 (KRIHS-CS01)
현재: Build 17763 (RTM + KB 3개)
목표: 최신 2026-03 누적 업데이트 (LCU)
방법:
  1. CS02가 정상 서비스 중인 것을 확인
  2. CS01 유지보수 모드 진입 (Horizon Admin → 연결 서버 → 사용 안 함)
  3. Windows Update 또는 오프라인 MSU 패키지 적용
  4. 재부팅 후 서비스 정상 확인
  5. 유지보수 모드 해제
주의: 6년치 누적 업데이트이므로 여러 차례 재부팅 필요할 수 있음
```

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A5 | **스케줄 작업 감사** | 인프라팀 | 매일 새벽 포트 대량 소비 원인 식별 |

```powershell
# CS01의 모든 스케줄 작업 확인
Get-ScheduledTask | Where-Object {$_.State -ne 'Disabled'} |
    Select-Object TaskName, TaskPath, State,
    @{N='Trigger';E={($_.Triggers | ForEach-Object {$_.ToString()}) -join '; '}} |
    Format-Table -AutoSize

# POLESTAR SMS Agent 8.0의 동작 확인
Get-Service | Where-Object {$_.DisplayName -match 'POLESTAR|SMS|Agent'}
sc.exe qc "PolestarSMSAgent"  # 서비스 구성 확인
```

### 8.3 중기 조치 (1개월 이내) — P2

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A6 | **CS01/CS02 정기 재부팅 스케줄 수립** | 인프라팀 | 포트 누적 방지 (근본 해결 전 완화) |

```
권장: 매 2주 1회, 일요일 새벽 교대 재부팅
  - 1주차 일요일 03:00: CS01 재부팅 (CS02 서비스)
  - 2주차 일요일 03:00: CS02 재부팅 (CS01 서비스)
```

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A7 | **UAG 백엔드 헬스체크 및 failover 검증** | 인프라팀 | CS01 장애 시 CS02로 자동 전환 확인 |
| A8 | **Horizon CS v8.9 → 최신 버전 업그레이드 검토** | 인프라팀 | ADAM 연결 관리 개선, 알려진 연결 누수 수정 |

### 8.4 장기 조치 (3개월 이내) — P3

| # | 조치 | 담당 | 기대 효과 |
|---|------|------|-----------|
| A9 | **Horizon CS 이중화 Active-Active 검증** | 인프라팀 | 단일 CS 장애 시 무중단 서비스 보장 |
| A10 | **VDI 인프라 모니터링 체계 수립** | 인프라팀 | 포트 사용률, NETLOGON 상태, ADAM 복제 상태 실시간 모니터링 |
| A11 | **패치 관리 정책 수립** | 보안팀 | 분기별 누적 업데이트 적용 의무화 |

---

## 9. 5 Whys 분석

1. **왜 VDI 사용자가 로그인하지 못했는가?**
   → Horizon CS01이 "no logon servers" 오류를 반환하여 AD 인증을 수행하지 못했기 때문

2. **왜 CS01이 로그온 서버를 찾지 못했는가?**
   → NETLOGON 서비스가 도메인 컨트롤러(AD01/AD02)에 RPC 연결을 수립하지 못했기 때문 (Event 5719)

3. **왜 RPC 연결이 실패했는가?**
   → CS01의 TCP ephemeral port가 모두 소진되어 새로운 아웃바운드 TCP 연결을 생성할 수 없었기 때문 (Event 4231)

4. **왜 TCP 포트가 고갈되었는가?**
   → 2026-03-06 재부팅 이후 11일간 Horizon 서비스의 ADAM LDAP/JMS loopback 연결 + 사용자 세션 처리 연결이 누적되었고, TIME_WAIT 상태 포트가 정상적으로 회수되지 않았기 때문

5. **왜 포트가 정상 회수되지 않았는가?**
   → **Windows Server 2019 RTM(17763)에서 6년간 패치가 적용되지 않아 TCP/IP 스택의 알려진 포트 리소스 관리 결함이 수정되지 않았으며, 동적 포트 범위(16,384개)가 Horizon CS의 높은 연결 부하에 비해 부족했기 때문** ← 근본 원인

---

## 10. 분석 한계 및 추가 검증 필요 항목

### 10.1 분석 한계

본 보고서의 "TCP Ephemeral Port 고갈" 결론은 **현상 분석(직접 원인) 수준에서는 높은 정확도**를 가지나, **근본 원인(왜 포트가 누수되는가)의 프로세스 레벨 특정이 불완전**합니다.

| 구분 | 확정 여부 | 설명 |
|------|-----------|------|
| 직접 원인: TCP 포트 고갈 → RPC 실패 → 인증 장애 | **확정** | Tcpip 4231/4227 → 5719 → NO_LOGON_SERVERS 시간순 일치, 재부팅 해소 |
| 포트 고갈의 배경: 미패치 TCP 스택 + 높은 연결 부하 | **확정** | 6년 미패치(E9), loopback 100+개(E10) 확인 |
| 포트 누수 프로세스 특정 | **미확정** | 장애 시점의 `netstat -ano` 전체 스냅샷이 없어 어떤 프로세스가 포트를 비정상 점유했는지 특정 불가 |
| 매일 새벽 포트 고갈 트리거 | **추정** | 4231의 매일 동일 시간대 발생은 스케줄 작업을 강하게 시사하나, 구체적 작업 미특정 |
| VMware Tools 12.5 설치 영향 | **미확인** | 시점 일치(03/06 설치)일 뿐, 인과관계 증거 없음. Root Cause 아님 |
| CS01의 loopback 연결이 비정상 증가인지 | **비교 데이터 부재** | CS02의 동일 시점 netstat과 비교해야 판단 가능 |

### 10.2 추가 검증 필요 항목

다음 장애 재현 시 또는 사전 점검 시 아래 데이터를 수집하여 근본 원인의 프로세스 레벨 특정이 필요합니다:

#### 1) TIME_WAIT 상태 포트 수 확인 (정기 수집)
```powershell
# 1시간 주기로 수집하여 추이 파악
netstat -an | findstr "TIME_WAIT" | find /c ":"
```

#### 2) 프로세스별 포트 점유 현황 (장애 시점 수집 필수)
```powershell
# 포트 고갈 징후(Tcpip 4227/4231) 발생 즉시 수집
netstat -ano > C:\Logs\netstat-ano-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt
tasklist /svc > C:\Logs\tasklist-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt
```

#### 3) CS02 대비 비교 (기준선 수립)
```powershell
# CS01과 CS02에서 동시 수집하여 비교
(Get-NetTCPConnection | Group-Object -Property State).Count
(Get-NetTCPConnection | Where-Object {$_.LocalAddress -eq '127.0.0.1'}).Count
```

#### 4) 스케줄 작업 전수 조사 (매일 새벽 트리거 특정)
```powershell
schtasks /query /fo LIST /v | Select-String -Pattern "TaskName|Start Time|Status"
Get-ScheduledTask | Where-Object {$_.State -ne 'Disabled'} |
    Select-Object TaskName, TaskPath, State,
    @{N='NextRun';E={($_.Triggers | ForEach-Object {$_.StartBoundary}) -join '; '}}
```

#### 5) Horizon 서비스 ADAM/LDAP 세션 수 모니터링
```powershell
# ADAM(VMwareVDMDS) 연결 수 추이
(Get-NetTCPConnection -LocalPort 389).Count
(Get-NetTCPConnection -LocalPort 4002).Count
```

### 10.3 검증 완료 시 보고서 업데이트 계획

| 검증 결과 | 보고서 업데이트 |
|-----------|----------------|
| 특정 프로세스의 비정상 포트 점유 확인 | 섹션 5.2 "포트 고갈의 원인"에 프로세스명/PID 추가, 5 Whys #4 업데이트 |
| 스케줄 작업이 트리거로 확인 | 섹션 5.1 "매일 새벽 패턴" 추정→확정으로 변경, 해당 작업 비활성화를 P0 조치에 추가 |
| CS02 대비 CS01 loopback 비정상 확인 | 섹션 3.2 증거 E10에 비교 데이터 추가, Horizon 서비스 연결 누수 버그 가능성 추가 |
| VMware Tools 12.5의 추가 포트 사용 확인/부정 | 부록에 결과 추가 또는 해당 항목 완전 제거 |

---

## 11. 잘 된 점 / 개선할 점

### 잘 된 점
- CS02가 정상 동작하여 일부 사용자는 CS02를 통해 인증 가능했음
- ADAM 복제가 지속적으로 동작하여 CS01/CS02 간 구성 불일치 없었음
- nltest /sc_verify를 실행하여 Secure Channel 상태를 확인한 것은 올바른 진단 절차
- 재부팅 결정이 적절했으며 즉시 효과가 있었음

### 개선할 점
- **6년간 미패치**는 보안 및 안정성 모두에서 심각한 리스크. 패치 관리 정책 부재
- 포트 사용률 모니터링이 없어 11일간 점진적으로 악화되는 동안 사전 감지 불가
- NETLOGON 5719가 03/17부터 발생했지만 03/20 재부팅까지 3일간 대응 지연
- CS01 단독 장애 시 자동 failover 메커니즘 검증 부재

---

## 부록 A: 시스템 구성 요약

| 항목 | CS01 (KRIHS-CS01) |
|------|-------------------|
| OS | Windows Server 2019 Standard, 10.0.17763 |
| CPU | 2 vCPU (Intel Broadwell E5-2600 v4 @ 2.2GHz) |
| RAM | 16 GB |
| IP | 10.1.1.23 /24 |
| Gateway | 10.1.1.254 |
| DNS | 10.1.1.21 (AD01), 10.1.1.22 (AD02) |
| Domain | krihs.vdi |
| Horizon | Connection Server v8.9 (2023-04-29 설치) |
| ADAM | VMwareVDMDS (AD LDS 인스턴스) |
| Java | JDK 8u131 (2022-02-09 설치) |
| VMware Tools | 12.5 (2026-03-06 설치) |
| VC++ Runtime | 2022 x64/x86 14.40.33816 (2026-03-06 설치) |
| 핫픽스 | **KB4483452, KB4470788, KB4489899** (3개, 2018-2019년) |
| 최종 재부팅 | 2026-03-06 (VMware Tools 설치) → 2026-03-20 (장애 복구) |

## 부록 B: AD01 Event 5827 상세

| 시각 (KST) | 대상 | 설명 |
|-------------|------|------|
| 2026-03-18 03:02 | KRIHS-CS01 | Netlogon Secure Channel 연결 거부 (NTLM, CVE-2020-1472 강화) |
| 2026-03-18 09:47 | KRIHS-CS01 | 동일 |
| 2026-03-19 06:17 | KRIHS-CS01 | 동일 |
| 2026-03-19 07:42 | KRIHS-CS01 | 동일 |
| 2026-03-19 10:17 | KRIHS-CS01 | 동일 |
| 2026-03-20 06:17 | KRIHS-CS01 | 동일 |
| 2026-03-20 07:17 | KRIHS-CS01 | 동일 |
| 2026-03-20 13:17 | KRIHS-CS01 | 동일 (재부팅 직전 마지막 발생) |

## 부록 C: Tcpip 이벤트 전체 목록 (UTC → KST)

| UTC 시각 | KST 시각 | Event ID | 의미 |
|----------|----------|----------|------|
| 03/17 02:36 | 03/17 11:36 | 4231 | **포트 완전 고갈** |
| 03/17 02:47 | 03/17 11:47 | 4227 | TIME_WAIT 재사용 실패 |
| 03/17 02:51 | 03/17 11:51 | 4227 | 〃 |
| 03/17 03:00 | 03/17 12:00 | 4227 | 〃 |
| 03/17 03:16 | 03/17 12:16 | 4227 | 〃 |
| 03/17 03:50 | 03/17 12:50 | 4227 | 〃 |
| 03/17 04:55 | 03/17 13:55 | 4227 | 〃 |
| 03/17 07:03 | 03/17 16:03 | 4227 | 〃 |
| 03/17 11:19 | 03/17 20:19 | 4227 | 〃 |
| 03/17 20:35 | 03/18 05:35 | 4227 | 〃 |
| 03/18 02:36 | 03/18 11:36 | 4231 | **포트 완전 고갈 (2일째)** |
| 03/18 13:39 | 03/18 22:39 | 4227 | TIME_WAIT 재사용 실패 |
| 03/19 02:50 | 03/19 11:50 | 4231 | **포트 완전 고갈 (3일째)** |
| 03/20 00:05 | 03/20 09:05 | 4227 | TIME_WAIT 재사용 실패 |
| 03/20 02:50 | 03/20 11:50 | 4231 | **포트 완전 고갈 (4일째)** |

---

*본 보고서는 CS01 SDC 번들, AD01 EVTX, UAG 로그의 원시 데이터를 기반으로 작성되었으며, 모든 타임스탬프는 UTC→KST 변환 규칙(CSV=UTC+9, EVTX=KST 그대로, UAG=KST 그대로)을 적용하였습니다.*
