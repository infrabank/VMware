# RCA 교차 검증 결과 (CS01 AD Connectivity 이슈)

## 1. 핵심 결론

- 직접 원인: TCP Ephemeral Port 고갈
- 결과: NETLOGON RPC 실패 → AD 인증 실패 → Horizon 로그인 장애
- 구조적 타당성: 높음 (기술적으로 일관됨)

---

## 2. 사실 vs 추정

### ✔ 확정된 사실
- Tcpip 4227 / 4231 이벤트 → 포트 고갈 증거
- NETLOGON 5719 → RPC 통신 실패
- 재부팅 후 정상화 → 리소스 고갈형 장애

---

### ⚠️ 보완 필요

#### 1) “장시간 운영 → 고갈”
- 단순 시간 문제가 아님
- 비정상 TCP 세션 누적 또는 누수 존재

#### 2) VMware Tools 영향
- 인과관계 부족
- 단순 시점 일치 수준 (Root Cause 아님)

#### 3) Loopback Connection 증가
- 핵심 원인 후보
- Horizon 내부 통신 (LDAP / Broker) 가능성 높음

#### 4) 동일 시간대 반복 발생
- 주기성 작업 존재 강하게 의심
- 스케줄 / 내부 서비스 영향 가능성

---

## 3. 최종 구조 정리

1. 직접 원인  
→ TCP Ephemeral Port 고갈  

2. 결과  
→ NETLOGON RPC 실패  
→ Horizon 인증 장애  

3. 근본 원인  
→ 비정상 TCP 세션 증가 / 미해제  
→ Loopback 포함 내부 연결 과다  

4. 트리거  
→ 재부팅 이후 장시간 운영  

---

## 4. 운영 리스크 평가

- 현상 분석 정확도: 높음
- 근본 원인 분석: 불완전
- 재발 가능성: 높음

---

## 5. 추가 검증 필수 항목

### 1) TIME_WAIT 확인
```powershell
netstat -an | find "TIME_WAIT" | find /c ":"
```

---

### 2) 프로세스별 포트 점유
```powershell
netstat -ano
tasklist /svc
```

---

### 3) Horizon 서비스 로그
- Connection Server logs
- ADAM / LDAP 세션 수

---

### 4) 스케줄 작업 확인
```powershell
schtasks /query /fo LIST /v
```

---

## 6. 최종 평가

- 운영 보고서 수준: 적합 (약 80점)
- 재발 방지 기준: 부족 (약 60점)

---

## 7. 핵심 결론

이 이슈의 본질은:

“단순 장애가 아니라  
비정상 TCP 세션 누적으로 인한 리소스 고갈 문제”

→ 반드시 근본 원인 추가 분석 필요
