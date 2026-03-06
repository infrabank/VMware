# VMware vSphere 7.0 Performance Tuning Guide
# VMware vSphere 7.0 성능 튜닝 가이드

> Reference: [KB 2032076](https://kb.vmware.com/s/article/2032076) | [KB 1006279](https://kb.vmware.com/s/article/1006279) | [KB 2146005](https://kb.vmware.com/s/article/2146005) | [KB 1027734](https://kb.vmware.com/s/article/1027734)

---

## 1. 개요 / Overview

### 성능 튜닝 방법론 / Performance Tuning Methodology

성능 문제 접근 순서:

1. **베이스라인 수집** — 정상 상태에서 esxtop 데이터 수집 (최소 48시간)
2. **증상 재현** — 문제 발생 시점의 데이터와 비교
3. **병목 식별** — CPU → Memory → Storage → Network 순으로 계층적 분석
4. **단일 변경** — 한 번에 하나씩 변경 후 효과 측정
5. **문서화** — 변경 전후 메트릭 기록

Performance tuning approach order:

1. **Collect baseline** — Gather esxtop data under normal load (minimum 48 hours)
2. **Reproduce symptom** — Compare against data captured during problem window
3. **Identify bottleneck** — Analyze hierarchically: CPU → Memory → Storage → Network
4. **Single change** — Change one variable at a time, measure effect
5. **Document** — Record before/after metrics for every change

### 핵심 원칙 / Core Principles

| 원칙 | 설명 |
|------|------|
| **과도한 오버커밋 금지** | vCPU 합계가 물리 코어의 4배를 초과하지 않도록 유지 |
| **예약(Reservation) 신중 사용** | 잘못된 예약은 전체 클러스터 자원 낭비 초래 |
| **HA 헤드룸 확보** | N+1 용량 기준으로 자원 계획 수립 |
| **VM 하드웨어 버전 최신 유지** | vmx-19 (vSphere 7.0) 사용 권장 |

| Principle | Description |
|-----------|-------------|
| **Avoid excessive overcommit** | Keep total vCPU count below 4x physical cores |
| **Use Reservations cautiously** | Incorrect reservations waste cluster-wide resources |
| **Maintain HA headroom** | Plan capacity based on N+1 |
| **Keep VM hardware version current** | vmx-19 (vSphere 7.0) recommended |

---

## 2. esxtop 레퍼런스 / esxtop Reference

### 대화형 모드 실행 / Interactive Mode

```bash
# ESXi SSH 접속 후 실행 / Run after SSH to ESXi
esxtop
```

### 화면 전환 키 / Screen Toggle Keys

| 키 / Key | 화면 / Screen | 주요 용도 / Primary Use |
|----------|--------------|------------------------|
| `c` | CPU | vCPU 준비 시간, 공동 정지, 사용률 |
| `m` | Memory | 풍선, 스왑, 압축, 활성 메모리 |
| `n` | Network | 처리량, 드롭, 패킷 오류 |
| `d` | Disk (Adapter) | 어댑터 레벨 I/O 대기 시간 |
| `u` | Disk (Device) | 장치 레벨 DAVG/KAVG/GAVG |
| `v` | Disk (VM) | VM별 스토리지 I/O |
| `i` | Interrupts | 인터럽트 분포 |
| `p` | Power | 전원 관리 상태 |
| `e` | Expand VM | VM → vCPU 상세 확장 |
| `h` | Help | 도움말 |
| `q` | Quit | 종료 |

### 배치 모드 수집 / Batch Mode Collection

```bash
# 30초 간격으로 120회 수집 (1시간) → CSV 파일 저장
# Collect 120 samples at 30-second intervals (1 hour) → save to CSV
esxtop -b -d 30 -n 120 > /tmp/esxtop_$(date +%Y%m%d_%H%M).csv

# 특정 시간 동안 수집 (백그라운드) / Collect for specific duration (background)
nohup esxtop -b -d 10 -n 360 > /tmp/esxtop_perf.csv &

# CSV 파일을 vCenter Performance Charts에서 Import하여 분석 가능
# CSV can be imported into vCenter Performance Charts for analysis

# Windows에서 esxtop CSV 분석: Performance Analyzer Tool 사용
# On Windows: use VMware Performance Analyzer Tool for CSV analysis
```

### esxtop 필드 커스터마이징 / Field Customization

```
# 대화형 모드에서 / In interactive mode:
f   → 필드 추가/제거 (Add/remove fields)
F   → 정렬 필드 선택 (Select sort field)
s   → 갱신 간격 설정 (Set update interval, default 5s)
W   → 현재 설정 저장 ~/.esxtop50rc (Save current config)
```

---

## 3. CPU 성능 / CPU Performance

### 핵심 esxtop CPU 메트릭 / Key esxtop CPU Metrics

| 필드 / Field | 의미 / Meaning | 임계값 / Threshold |
|-------------|---------------|-------------------|
| `%RDY` | vCPU가 실행 준비됐지만 물리 CPU를 기다리는 시간 비율 | **> 5% = 문제, > 10% = 심각** |
| `%CSTP` | 멀티-vCPU VM의 co-stop 대기 시간 (다른 vCPU 대기) | **> 3% = 문제** |
| `%MLMTD` | CPU 제한(Limit)으로 인해 throttle된 시간 | **> 0% = 제한 설정 확인** |
| `%USED` | 실제 물리 CPU 소비 시간 | 참고용 |
| `%RUN` | Scheduled 상태에서 실행된 시간 | 참고용 |
| `%SYS` | VMkernel 시스템 시간 | 참고용 |
| `%WAIT` | 대기 상태 시간 (idle 포함) | 참고용 |
| `%IDLE` | 실제 idle 시간 | 참고용 |
| `NWLD` | 월드(vCPU) 수 | 참고용 |

| Field | Meaning | Threshold |
|-------|---------|-----------|
| `%RDY` | Time vCPU is ready but waiting for physical CPU | **> 5% = problem, > 10% = critical** |
| `%CSTP` | Co-stop wait for multi-vCPU VMs (waiting for sibling vCPU) | **> 3% = problem** |
| `%MLMTD` | Time throttled due to CPU Limit setting | **> 0% = check Limit config** |

### %RDY 높은 경우 조치 / Actions for High %RDY

```bash
# 1. 클러스터 전체 CPU 사용률 확인
# Check cluster-wide CPU utilization
esxtop  # c 화면에서 전체 %Used 확인

# 2. 물리 CPU 대비 vCPU 비율 확인
# Check vCPU-to-pCPU ratio
esxcli hardware cpu list | grep "CPU Count"
vim-cmd hostsvc/hostsummary | grep numCpuCores

# 3. VM별 vCPU 수 확인 (과도한 vCPU 할당 식별)
# Check per-VM vCPU count (identify over-provisioned VMs)
esxcli vm process list

# 4. DRS 권장 사항 검토 (vCenter)
# Review DRS recommendations (vCenter)
# vCenter → Cluster → Monitor → DRS → Recommendations
```

### NUMA 최적화 / NUMA Optimization

```bash
# NUMA 토폴로지 확인 / Check NUMA topology
esxcli hardware numa list

# VM NUMA 배치 확인 (esxtop c 화면 → E로 확장)
# Check VM NUMA placement (esxtop c screen → expand with E)
# NUMA_HOME: VM의 홈 NUMA 노드 / Home NUMA node of VM
# NUMA_REMOTE: 원격 NUMA 노드 접근 비율 / Remote NUMA node access ratio

# 권장사항 / Recommendations:
# - VM 메모리 크기를 단일 NUMA 노드 크기 이하로 설정
#   Keep VM memory size below single NUMA node capacity
# - vCPU 수를 단일 NUMA 노드 코어 수 이하로 설정
#   Keep vCPU count below single NUMA node core count
# - 대형 VM: NUMA node affinity 설정 고려 (vNUMA 자동 구성)
#   Large VMs: consider NUMA node affinity (vNUMA auto-configured)
```

### CPU 어피니티 / CPU Affinity

```
# RISK: HIGH — 일반적으로 권장하지 않음 / Generally NOT recommended
# CPU affinity는 DRS를 방해하고 NUMA 최적화를 저해함
# CPU affinity interferes with DRS and degrades NUMA optimization

# 사용 사례: 특수 목적 VM (실시간, 라이센스 바인딩)
# Use case: special-purpose VMs (real-time, license-bound)
# vCenter → VM → Edit Settings → VM Options → Advanced → CPU Affinity
```

### 하이퍼스레딩 고려사항 / Hyperthreading Considerations

```bash
# HT 상태 확인 / Check HT status
esxcli hardware cpu global get | grep HyperthreadingActive

# HT 비활성화 (보안 요구사항 시, RISK: HIGH)
# Disable HT (for security requirements, RISK: HIGH)
# BIOS 레벨 또는 vSphere Client → Host → Manage → System → Advanced Settings
# esxcli system settings advanced set -o /Config/NUMA/HTEnabled -i 0
# 재부팅 필요 / Reboot required

# 보안 지침 (VMSA-2018-0020, L1TF/Spectre 관련):
# Security note (VMSA-2018-0020, L1TF/Spectre related):
# 멀티테넌트 환경에서 HT 비활성화 권장 / HT disable recommended in multi-tenant environments
```

### 전원 관리 / Power Management

```bash
# 현재 전원 정책 확인 / Check current power policy
esxcli system settings advanced list -o /Power/Policy
# 0=High Performance, 1=Balanced, 2=Low Power, 3=Custom

# High Performance 설정 (레이턴시 민감 워크로드)
# Set High Performance (for latency-sensitive workloads)
esxcli system settings advanced set -o /Power/Policy -i 0

# Balanced 설정 (기본값, 일반 워크로드)
# Set Balanced (default, general workloads)
esxcli system settings advanced set -o /Power/Policy -i 1

# BIOS에서도 Performance 모드 설정 권장
# Also recommended: set Performance mode in BIOS
```

### 레이턴시 민감도 설정 / Latency Sensitivity Settings

```
# vCenter → VM → Edit Settings → VM Options → Advanced → Latency Sensitivity
# Normal (기본값 / default): 일반 워크로드
# High: 레이턴시 민감 워크로드 (거래소, 실시간 처리 등)
#       Latency-sensitive workloads (trading, real-time processing)
#       → CPU 예약 필요, 메모리 예약 필요
#       → CPU Reservation required, Memory Reservation required

# High 설정 시 추가 고려사항 / Additional considerations for High:
# - vCPU spinlocks 최소화
# - 메모리 전체 예약 권장 (Memory Reserve All)
# - PVSCSI + VMXNET3 필수
```

---

## 4. 메모리 성능 / Memory Performance

### 핵심 esxtop 메모리 메트릭 / Key esxtop Memory Metrics

| 필드 / Field | 의미 / Meaning | 임계값 / Threshold |
|-------------|---------------|-------------------|
| `MCTLSZ` | Balloon driver가 회수한 메모리 (MB) | **> 0 = 메모리 압박** |
| `SWCUR` | 현재 스왑된 메모리 크기 (MB) | **> 0 = 심각한 압박** |
| `SWR/s` | 스왑 읽기 속도 (MB/s) | **> 0 = 성능 저하 확실** |
| `SWW/s` | 스왑 쓰기 속도 (MB/s) | **> 0 = 성능 저하 확실** |
| `CACHESZ` | 압축 캐시 크기 (MB) | 참고용 |
| `ZIP/s` | 압축률 (MB/s) | > 0 = 압축 활성 |
| `UNZIP/s` | 압축 해제율 (MB/s) | > 0 = 압축 데이터 접근 |
| `ACTVS` | 실제 활성 메모리 (short-term) | 참고용 |
| `GRANT` | 게스트에 부여된 실제 메모리 | 참고용 |
| `OVHD` | VMkernel 오버헤드 메모리 | 참고용 |

### 메모리 재확보 기술 우선순위 / Memory Reclamation Priority

VMkernel이 메모리를 회수하는 순서 (성능 영향 적은 순서):

1. **TPS (Transparent Page Sharing)** — 동일 메모리 페이지 공유 (영향 거의 없음)
2. **Balloon (vmmemctl)** — 게스트 OS에 메모리 반환 요청 (영향 낮음)
3. **Compression** — 메모리 압축 후 캐시 저장 (영향 중간)
4. **Swap** — 디스크로 스왑 (영향 높음, 성능 저하 명확)

VMkernel memory reclamation order (least to most performance impact):

1. **TPS** — Share identical memory pages (near-zero impact)
2. **Balloon** — Request guest OS to return memory (low impact)
3. **Compression** — Compress and cache memory pages (medium impact)
4. **Swap** — Swap to disk (high impact, clear performance degradation)

### 호스트 메모리 오버커밋 안전 범위 / Safe Overcommit Ratios

| 워크로드 유형 / Workload Type | 안전 비율 / Safe Ratio | 주의 / Notes |
|------------------------------|----------------------|-------------|
| 개발/테스트 | 1.5:1 ~ 2:1 | 스왑 발생 가능, 수용 가능 |
| 일반 운영 (VDI 등) | 1.2:1 ~ 1.5:1 | Balloon까지만 허용 |
| 중요 업무 시스템 | 1:1 ~ 1.1:1 | 오버커밋 최소화 |
| 레이턴시 민감 | 1:1 (예약 권장) | 메모리 예약 설정 |

### 메모리 예약 / Memory Reservation

```bash
# 메모리 예약 확인 / Check memory reservation
vim-cmd vmsvc/getallvms | awk '{print $1}' | while read vmid; do
  vim-cmd vmsvc/get.config $vmid 2>/dev/null | grep -E "memoryMB|reservation"
done

# 예약 설정 권장 대상 / Recommended for reservation:
# - 데이터베이스 VM (Oracle, SQL Server)
# - 레이턴시 민감 애플리케이션
# - Balloon/Swap이 허용되지 않는 워크로드

# CAUTION: 과도한 예약은 vSphere HA 어드미션 컨트롤에 영향
# CAUTION: Excessive reservations affect vSphere HA admission control
```

### Large Page 및 TPS / Large Pages and TPS

```bash
# Large Page (2MB) 사용 여부 확인
# Check Large Page (2MB) usage
esxcli system settings advanced list -o /Mem/AllocGuestLargePage

# TPS 설정 확인 (보안 강화 환경에서는 비활성화 가능)
# Check TPS setting (can disable in security-hardened environments)
esxcli system settings advanced list -o /Mem/ShareScanTime
esxcli system settings advanced list -o /Mem/ShareForceSalting
# ShareForceSalting = 2: 동일 VM 내에서만 TPS (inter-VM TPS 비활성)
# ShareForceSalting = 2: TPS only within same VM (inter-VM TPS disabled)
```

### 메모리 압박 징후 진단 / Diagnosing Memory Pressure Signs

```bash
# vmkernel.log에서 메모리 압박 징후 확인
# Check vmkernel.log for memory pressure signs
grep -i "balloon\|swap\|memSched" /var/log/vmkernel.log | tail -30

# esxtop 메모리 화면 (m)에서 확인 포인트:
# esxtop memory screen (m) check points:
# MCTLSZ > 0     → balloon 활성: DRS 이동 또는 VM 메모리 증가 고려
# SWCUR > 0      → 스왑 발생: 즉시 조치 필요 (호스트 메모리 추가 or VM 감소)
# SWR/s > 0      → 활성 스왑 읽기: VM 심각 성능 저하 상태
```

---

## 5. 스토리지 성능 / Storage Performance

### 핵심 esxtop 스토리지 메트릭 / Key esxtop Storage Metrics

esxtop `u` 화면 (Device) 주요 필드:

| 필드 / Field | 의미 / Meaning | 임계값 / Threshold |
|-------------|---------------|-------------------|
| `DAVG/cmd` | 장치 레벨 평균 I/O 레이턴시 (ms) | **> 25ms = 문제, > 50ms = 심각** |
| `KAVG/cmd` | VMkernel 큐 레이턴시 (ms) | **> 2ms = 큐 포화** |
| `GAVG/cmd` | 게스트 체감 총 레이턴시 (DAVG+KAVG) | **> 30ms = 게스트 체감 저하** |
| `QAVG/cmd` | 큐 대기 레이턴시 (ms) | **> 0ms = 큐 포화 시작** |
| `ABRTS/s` | I/O 중단(abort) 수/초 | **> 0 = 심각** |
| `RESETS/s` | 장치 리셋 수/초 | **> 0 = 장치 문제** |
| `CONS/s` | I/O 통합(consolidation) | 참고용 |
| `READS/s` | 읽기 I/O 수/초 | 참고용 |
| `WRITES/s` | 쓰기 I/O 수/초 | 참고용 |
| `MBREAD/s` | 읽기 처리량 (MB/s) | 참고용 |
| `MBWRTN/s` | 쓰기 처리량 (MB/s) | 참고용 |

### 큐 깊이 튜닝 / Queue Depth Tuning

```bash
# 어댑터 큐 깊이 확인 / Check adapter queue depth
esxcli storage core adapter list
esxcli storage core adapter get -A vmhba0

# 장치별 큐 깊이 확인 / Check per-device queue depth
esxcli storage core device list | grep -A5 "Queue Depth"

# Fibre Channel HBA 큐 깊이 조정 (MODERATE risk)
# Adjust FC HBA queue depth (MODERATE risk)
esxcli system module parameters set -m lpfc820 -p "lpfc_lun_queue_depth=64"
# 재부팅 필요 / Reboot required

# iSCSI 어댑터 큐 깊이 조정 / Adjust iSCSI adapter queue depth
esxcli iscsi adapter param set -A vmhba64 -k QueueDepth -v 64

# 장치 레벨 큐 깊이 조정 / Adjust device-level queue depth
esxcli storage core device set -d naa.xxxxxxxx -O 64
```

### KAVG 높은 경우 / High KAVG Diagnosis

```
KAVG > 2ms 의미: VMkernel 내부에서 I/O가 큐잉됨
High KAVG means: I/O is queuing inside VMkernel

원인 / Causes:
1. 장치 큐 깊이 부족 (Device Queue Depth too low)
2. 어댑터 큐 깊이 포화 (Adapter Queue Depth saturated)
3. PSP (Path Selection Policy) 비효율적 선택 (Inefficient PSP)
4. SCSI reservation storms (SCSI 예약 폭풍)

조치 / Actions:
1. esxtop u 화면에서 QAVG 확인 → 큐 깊이 증가
2. esxcli storage nmp psp list 로 PSP 확인
3. 경로 수 및 상태 확인: esxcli storage core path list
```

### 스토리지 I/O 제어 (SIOC) / Storage I/O Control

```bash
# SIOC 활성화 여부 확인 (vCenter에서 설정)
# Check SIOC enabled status (configured in vCenter)
# Datastore → Configure → General → Storage I/O Control

# SIOC 임계값 (기본값: 30ms) / SIOC threshold (default: 30ms)
# 30ms 초과 시 낮은 쉐어를 가진 VM의 I/O throttle 시작
# When exceeded, VMs with lower shares get I/O throttled

# SIOC 권장 설정 / SIOC recommendations:
# - 공유 데이터스토어에서 여러 VM의 I/O 경쟁 발생 시 활성화
#   Enable when multiple VMs compete for I/O on shared datastores
# - All-Flash 어레이: 임계값을 10ms로 낮추기
#   All-Flash arrays: lower threshold to 10ms
```

### VAAI 오프로드 / VAAI Offload

```bash
# VAAI 지원 확인 / Check VAAI support
esxcli storage core device vaai status get

# VAAI 기능별 상태 / VAAI capability status
# ATS (Atomic Test and Set): 메타데이터 잠금 오프로드
# Clone (Full Copy): 데이터스토어 내 복사 오프로드
# Zero (Write Same): 디스크 제로화 오프로드
# XCOPY: 어레이 간 복사 오프로드

# VAAI 미지원 어레이에서 Storage vMotion이 느린 경우:
# If Storage vMotion is slow on non-VAAI arrays:
# → Full software copy 발생, 예상 시간 증가는 정상
```

### vSAN 성능 튜닝 / vSAN Performance Tuning

```bash
# vSAN 성능 서비스 활성화 / Enable vSAN Performance Service
# vCenter → Cluster → Configure → vSAN → Services → Performance Service

# vSAN 상태 확인 / Check vSAN health
esxcli vsan health cluster list
esxcli vsan health cluster get -t "vSAN disk balance"

# vSAN 디스크 I/O 통계 / vSAN disk I/O statistics
esxcli vsan debug object list
esxcli vsan storage list

# Disk Group 구성 확인 / Check Disk Group configuration
esxcli vsan storage list | grep -E "In Caching Tier|Display Name"

# 권장: NVMe/SSD 캐시 계층, 성능 정책 (SPBM)
# Recommended: NVMe/SSD cache tier, performance policy (SPBM)
# SPBM: Storage Policy-Based Management
# Failures to tolerate (FTT) = 1: RAID-1, 50% 용량 사용
# Failures to tolerate (FTT) = 1: RAID-5/6 (Erasure Coding): 더 나은 용량 효율
```

---

## 6. 네트워크 성능 / Network Performance

### 핵심 esxtop 네트워크 메트릭 / Key esxtop Network Metrics

esxtop `n` 화면 주요 필드:

| 필드 / Field | 의미 / Meaning | 임계값 / Threshold |
|-------------|---------------|-------------------|
| `%DRPTX` | 전송 드롭 비율 | **> 0.1% = 문제** |
| `%DRPRX` | 수신 드롭 비율 | **> 0.1% = 문제** |
| `MbTX/s` | 전송 처리량 (Mbps) | 링크 속도 대비 80% 초과 주의 |
| `MbRX/s` | 수신 처리량 (Mbps) | 링크 속도 대비 80% 초과 주의 |
| `PKTTX/s` | 전송 패킷/초 | 참고용 |
| `PKTRX/s` | 수신 패킷/초 | 참고용 |

### TSO / LRO 설정 / TSO and LRO Configuration

```bash
# TSO (TCP Segmentation Offload) 상태 확인
# Check TSO (TCP Segmentation Offload) status
esxcli network nic get -n vmnic0 | grep -i TSO
ethtool -k vmnic0 | grep segmentation

# LRO (Large Receive Offload) 상태 확인
# Check LRO (Large Receive Offload) status
esxcli system settings advanced list -o /Net/VmxnetSwLROSL
esxcli system settings advanced list -o /Net/LROMaxLength

# 권장: TSO/LRO 활성화 (기본값) — 대용량 처리량 워크로드에 유리
# Recommended: TSO/LRO enabled (default) — beneficial for high-throughput workloads

# 레이턴시 민감 워크로드에서 LRO 비활성화 고려
# Consider disabling LRO for latency-sensitive workloads
esxcli system settings advanced set -o /Net/VmxnetSwLROSL -i 0
```

### RSS (Receive Side Scaling)

```bash
# RSS 상태 확인 / Check RSS status
esxcli network nic get -n vmnic0 | grep RSS
ethtool -l vmnic0   # 큐 수 확인 / Check queue count

# RSS 큐 수 최적화 (NIC 드라이버 의존)
# Optimize RSS queue count (driver-dependent)
# 권장: 물리 CPU 코어 수와 동일하게 설정 (최대 16)
# Recommended: match physical CPU core count (max 16)
esxcli system settings advanced set -o /Net/NetNetqNumaIOCpuPinning -i 1
```

### 인터럽트 통합 / Interrupt Coalescing

```bash
# 인터럽트 통합 확인 / Check interrupt coalescing
ethtool -c vmnic0

# 레이턴시 민감 워크로드: 인터럽트 통합 최소화
# Latency-sensitive workloads: minimize interrupt coalescing
ethtool -C vmnic0 rx-usecs 0 tx-usecs 0  # MODERATE risk

# 처리량 우선 워크로드: 기본값 유지 (adaptive 권장)
# Throughput-priority workloads: keep default (adaptive recommended)
```

### 링 버퍼 크기 / Ring Buffer Sizing

```bash
# 현재 링 버퍼 크기 확인 / Check current ring buffer size
ethtool -g vmnic0

# 드롭 발생 시 링 버퍼 증가 / Increase ring buffer on drops
ethtool -G vmnic0 rx 4096 tx 4096   # MODERATE risk
# 최대값은 NIC 드라이버 의존 / Maximum depends on NIC driver
```

### NIOC (Network I/O Control)

```bash
# NIOC는 vDS에서 구성 / NIOC configured on vDS
# vCenter → Networking → DSwitch → Configure → Settings → Properties
# → Network I/O Control: Enable

# 트래픽 유형별 대역폭 할당 / Bandwidth allocation by traffic type:
# - VM Traffic: 기본 쉐어 (variable)
# - vMotion: 50 shares (기본)
# - vSAN: 100 shares (기본)
# - Management: 50 shares (기본)
# - FT: 50 shares (기본)
# - iSCSI: 50 shares (기본)
# - NFS: 50 shares (기본)

# 권장: 중요 트래픽에 최소 대역폭 보장(Reservation) 설정
# Recommended: set minimum bandwidth Reservation for critical traffic
```

### Jumbo Frames 영향 / Jumbo Frames Impact

```bash
# Jumbo Frame (MTU 9000) 설정 확인
# Check Jumbo Frame (MTU 9000) configuration
esxcli network nic get -n vmnic0 | grep MTU
esxcli network vswitch standard get -v vSwitch0 | grep MTU

# Jumbo Frame 활성화 (vSwitch 전체 경로 일치 필수)
# Enable Jumbo Frames (entire path MTU must match)
esxcli network vswitch standard set -v vSwitch0 -m 9000
esxcli network ip interface set -i vmk0 -m 9000   # MODERATE risk

# 주의: 물리 스위치 포트도 MTU 9000 설정 필요
# CAUTION: Physical switch ports must also be set to MTU 9000
# 경로 전체 MTU 불일치 시 오히려 성능 저하 발생
# Path MTU mismatch causes performance degradation
```

---

## 7. VM 사이징 / VM Sizing Best Practices

### CPU 사이징 / CPU Sizing

```
VM CPU 과다 할당 문제 / VM CPU over-provisioning problems:
- vCPU 수가 많을수록 co-stop(%CSTP) 증가
- 스케줄러가 모든 vCPU에 동시 물리 CPU 할당 필요 → 대기 시간 증가
- vCPU 수 ≠ 성능: 단일 스레드 애플리케이션은 vCPU 1~2개가 최적

More vCPUs = more co-stop (%CSTP)
Scheduler must find simultaneous physical CPUs for all vCPUs → longer wait
vCPU count ≠ performance: single-threaded apps optimal at 1-2 vCPUs

권장사항 / Recommendations:
1. 애플리케이션 스레드 수 기반으로 vCPU 할당
   Allocate vCPUs based on application thread count
2. OS 레벨 CPU 사용률 90% 이상 도달 전에 증설
   Scale up before OS CPU utilization reaches 90%
3. 소켓 x 코어 구성 고려 (NUMA 인식 애플리케이션용)
   Consider socket x cores config (for NUMA-aware applications)
```

### 메모리 사이징 / Memory Sizing

```
메모리 Right-Sizing 기준 / Memory right-sizing criteria:
- 게스트 OS 메모리 사용률 80% 이하 유지 목표
  Target: keep guest OS memory utilization below 80%
- esxtop MCTLSZ > 0 이면 해당 VM 메모리 부족
  esxtop MCTLSZ > 0 means that VM needs more memory
- Windows VM: 커밋 크기(Commit Charge) 기준으로 측정
  Windows VM: measure based on Commit Charge
- Linux VM: Used - Buffers - Cache 기준으로 측정
  Linux VM: measure based on Used - Buffers - Cache

메모리 낭비 식별 / Identify memory waste:
- 게스트 OS 메모리 사용률 < 50% + 예약(Reservation) 설정 → 낭비
  Guest OS utilization < 50% + Reservation set → waste
```

### 가상 NIC 선택 / Virtual NIC Selection

| NIC 유형 / Type | 최대 처리량 / Max Throughput | 권장 용도 / Recommended For |
|----------------|----------------------------|---------------------------|
| **VMXNET3** | 10 Gbps (가상) | 모든 신규 VM — 기본 선택 |
| **E1000E** | 1 Gbps | 레거시 OS, VMXNET3 드라이버 없는 경우 |
| **E1000** | 1 Gbps | 구형 OS 호환성 (피할 것) |
| **PVRDMA** | 40 Gbps+ | RDMA 지원 워크로드 (특수 목적) |

```
VMXNET3 권장 이유 / Why VMXNET3:
- 멀티큐 지원 (RSS)
- TSO/LRO/Checksum Offload 지원
- 인터럽트 통합 최적화
- CPU 오버헤드 최소화
```

### 가상 스토리지 컨트롤러 / Virtual Storage Controller

| 컨트롤러 / Controller | 최대 디스크 / Max Disks | 권장 용도 / Recommended For |
|----------------------|------------------------|---------------------------|
| **PVSCSI** | 64개 / 64 | 고 I/O 워크로드 — 기본 선택 |
| **LSI Logic SAS** | 15개 / 15 | 호환성 필요 시 |
| **NVMe** | 255개 / 255 | 극한 I/O 성능 (vSphere 7.0+) |
| **SATA** | 30개 / 30 | 레거시 / Low I/O |

```
PVSCSI 권장 이유 / Why PVSCSI:
- CPU 오버헤드 최소화 (LSI 대비 최대 50% 절감)
- 높은 큐 깊이 지원
- 데이터베이스 및 고 IOPS 워크로드에 최적

주의: Windows Server 2008 이하 버전은 부팅 디스크에 PVSCSI 미지원
CAUTION: Windows Server 2008 and below do not support PVSCSI for boot disk
```

### VM 하드웨어 버전 / VM Hardware Version

```bash
# VM 하드웨어 버전 확인 / Check VM hardware version
vim-cmd vmsvc/get.config <vmid> | grep "version ="

# vSphere 7.0 기준 하드웨어 버전 / Hardware versions for vSphere 7.0
# vmx-19: vSphere 7.0 U2 (권장 / Recommended)
# vmx-18: vSphere 7.0 U1
# vmx-17: vSphere 7.0 GA

# 업그레이드 시 주의사항 / Upgrade considerations:
# - VM 전원 끄기 필요 / VM must be powered off
# - 이전 버전 vSphere에서 부팅 불가 (롤백 불가)
#   Cannot boot on older vSphere (no rollback)
# - VMware Tools 먼저 업데이트 / Update VMware Tools first
```

---

## 8. vmkfstools 레퍼런스 / vmkfstools Reference

### 디스크 복제 / Disk Clone

```bash
# 씬 프로비저닝 복제 / Clone as thin provisioned
vmkfstools -i /vmfs/volumes/datastore1/source.vmdk \
           /vmfs/volumes/datastore2/dest.vmdk \
           -d thin

# 후 제로화 두꺼운 디스크로 복제 / Clone as thick lazy-zeroed
vmkfstools -i /vmfs/volumes/datastore1/source.vmdk \
           /vmfs/volumes/datastore2/dest.vmdk \
           -d zeroedthick

# 사전 제로화 두꺼운 디스크로 복제 (최고 성능)
# Clone as thick eager-zeroed (best performance)
vmkfstools -i /vmfs/volumes/datastore1/source.vmdk \
           /vmfs/volumes/datastore2/dest.vmdk \
           -d eagerzeroedthick
```

### 디스크 확장 / Disk Extend

```bash
# VMDK 크기 확장 (VM 전원 OFF 권장) / Extend VMDK size (VM power OFF recommended)
# RISK: MODERATE
vmkfstools -X 100g /vmfs/volumes/datastore1/vm/vm.vmdk
# 게스트 OS에서 파티션 확장 추가 필요
# Additional partition extension required inside guest OS
```

### 씬 → 두꺼운 변환 / Thin to Thick Conversion

```bash
# 씬 디스크 팽창 (씬 → 두꺼운 레이지 제로화)
# Inflate thin disk (thin → thick lazy-zeroed)
vmkfstools -j /vmfs/volumes/datastore1/vm/vm.vmdk

# 사전 제로화 변환 (더 긴 시간 소요)
# Eager-zeroed conversion (takes longer)
vmkfstools -i source.vmdk dest.vmdk -d eagerzeroedthick
```

### 디스크 잠금 및 정보 조회 / Disk Lock and Geometry Query

```bash
# 디스크 잠금 소유자 확인 (APD/잠금 문제 시)
# Check disk lock owner (on APD/lock issues)
vmkfstools -D /vmfs/volumes/datastore1/vm/vm.vmdk
# 출력에서 RW 잠금 소유 호스트 확인 / Check host owning RW lock in output

# 디스크 기하 구조 및 파일 시스템 정보 확인
# Check disk geometry and filesystem info
vmkfstools -P /vmfs/volumes/datastore1/vm/vm.vmdk

# 디스크 무결성 검사 / Disk integrity check
vmkfstools -e /vmfs/volumes/datastore1/vm/vm.vmdk
# 0 = 정상, 1 = 오류 / 0 = OK, 1 = Error
```

### 스냅샷 관련 / Snapshot Related

```bash
# 스냅샷 병합 (VM 전원 OFF 상태) / Merge snapshots (VM powered off)
vmkfstools -i vm-000001.vmdk vm-flat.vmdk -d thin

# 스냅샷 체인 확인 / Check snapshot chain
vmkfstools -q vm.vmdk | grep -i parent
```

---

## 9. 성능 문제 진단 워크플로우 / Performance Diagnostics Workflow

### 워크플로우 A: "VM이 느리다" / Workflow A: "VM is Slow"

```
Step 1: 게스트 OS 내부 확인 / Check inside guest OS
├── CPU: top/Task Manager → 특정 프로세스 CPU 소비 확인
├── Memory: free -h / Task Manager → 사용률 및 스왑 확인
├── Disk I/O: iostat -x 1 / Resource Monitor → 대기 시간 확인
└── Network: netstat -s / Perfmon → 드롭/재전송 확인

Step 2: ESXi 호스트 레벨 확인 / Check ESXi host level
├── esxtop c 화면:
│   ├── 해당 VM의 %RDY > 5%? → CPU 경합 → Step 3
│   ├── %CSTP > 3%? → vCPU 수 감소 고려
│   └── %MLMTD > 0%? → CPU Limit 설정 제거
├── esxtop m 화면:
│   ├── MCTLSZ > 0? → 메모리 압박 → Step 4
│   └── SWCUR > 0? → 즉각 메모리 조치 필요
├── esxtop u 화면:
│   ├── DAVG > 25ms? → 스토리지 병목 → Step 5
│   └── KAVG > 2ms? → 큐 깊이 문제
└── esxtop n 화면:
    ├── %DRPTX or %DRPRX > 0.1%? → 네트워크 문제 → Step 6
    └── MbTX/s or MbRX/s > 80% 링크 속도? → 대역폭 포화

Step 3: CPU 경합 조치 / CPU contention actions
├── DRS 활성화 (vCenter 관리 클러스터)
├── 해당 호스트 vCPU 과다 할당 확인
├── VM vCPU 수 감소 (>4 vCPU이면 2로 줄여서 테스트)
└── 호스트 전원 정책 → High Performance 변경

Step 4: 메모리 압박 조치 / Memory pressure actions
├── 호스트 전체 메모리 사용률 확인 (vCenter)
├── Balloon 활성 VM에 메모리 추가
├── DRS로 VM을 메모리 여유 있는 호스트로 이동
└── 메모리 예약이 과도한 VM 식별 후 조정

Step 5: 스토리지 병목 조치 / Storage bottleneck actions
├── 어레이 측 성능 확인 (스토리지팀 협력)
├── 큐 깊이 확인 및 조정
├── SIOC 활성화 (경쟁 VM 간 I/O 균등화)
├── 씬 디스크 → eagerzeroedthick 변환 고려
└── vSAN: 디스크 밸런스 및 정책 확인

Step 6: 네트워크 문제 조치 / Network issue actions
├── NIC 링크 속도/duplex 확인
├── NIC 드라이버 업데이트 확인
├── 링 버퍼 크기 증가
└── NIOC로 트래픽 우선순위 조정
```

### 워크플로우 B: "호스트가 느리다" / Workflow B: "Host is Slow"

```bash
# Step 1: 전체 CPU 사용률 확인 / Check overall CPU utilization
esxtop   # c 화면, %Used 합계 > 80% 경고
         # 특정 VM이 CPU 독점하는지 확인

# Step 2: 전체 메모리 현황 확인 / Check overall memory status
esxtop   # m 화면, HOST 행 MCTLSZ/SWCUR 확인

# Step 3: vmkernel 로그 오류 확인 / Check vmkernel log errors
grep -iE "error|warning|critical|fail" /var/log/vmkernel.log | tail -50

# Step 4: 하드웨어 오류 확인 / Check hardware errors
grep -iE "MCE|NMI|hardware error|uncorrect" /var/log/vmkernel.log | tail -20

# Step 5: 스토리지 전체 상태 확인 / Check overall storage health
esxcli storage core device stats get
# ABRTS/s, RESETS/s > 0 이면 스토리지 장치 문제

# Step 6: 네트워크 오류 확인 / Check network errors
esxcli network nic stats get -n vmnic0
# Rx/Tx errors, drops > 0 이면 NIC 또는 케이블 문제
for nic in $(esxcli network nic list | awk 'NR>2 {print $1}'); do
  echo "=== $nic ===" && esxcli network nic stats get -n $nic | grep -iE "drop|error"
done
```

### 워크플로우 C: "스토리지 레이턴시가 높다" / Workflow C: "Storage Latency is High"

```bash
# Step 1: 레이턴시 위치 파악 / Identify latency location
# esxtop u 화면에서:
# DAVG: 어레이 내부 + HBA 전송 시간 (어레이 문제 가능성)
# KAVG: VMkernel 큐 대기 시간 (VMkernel 큐 포화)
# GAVG = DAVG + KAVG: 게스트 체감 총 레이턴시

# Step 2: 경로 수 및 상태 확인 / Check path count and status
esxcli storage core path list | grep -E "State|Device|Adapter"
# Active 경로 수 확인 — 경로 장애로 I/O 집중 가능성

# Step 3: 큐 깊이 현황 / Queue depth status
esxtop u 화면에서 QAVG > 0 이면 큐 포화
esxcli storage core device list | grep "Queue Depth"

# Step 4: 어레이측 확인 요청 / Request array-side check
# 스토리지팀에 해당 LUN의 레이턴시 및 I/O 통계 요청
# Request storage team for LUN latency and I/O stats

# Step 5: SCSI 오류 확인 / Check SCSI errors
grep -i "SCSI\|nmp\|H:0x0 D:0x2\|timeout" /var/log/vmkernel.log | tail -30

# Step 6: PSP 최적화 / PSP optimization
esxcli storage nmp device list   # 현재 PSP 확인
# Active-Active 어레이: Round Robin (RR) 권장
# RR로 변경 / Change to Round Robin:
esxcli storage nmp device set -d naa.xxxxxxxx -P VMW_PSP_RR
# RR I/O 횟수 최적화 (기본값 1000 → 1로 변경 고려)
esxcli storage nmp psp roundrobin deviceconfig set -d naa.xxxxxxxx -t iops -I 1
```

---

## 10. 참조 / References

### 공식 VMware KB / Official VMware KB

| KB | 제목 / Title | 용도 / Use Case |
|----|-------------|----------------|
| [KB 2032076](https://kb.vmware.com/s/article/2032076) | Using esxtop to identify storage bottlenecks | esxtop 스토리지 성능 분석 |
| [KB 1006279](https://kb.vmware.com/s/article/1006279) | Interpreting esxtop statistics | esxtop 전체 메트릭 해석 |
| [KB 2010200](https://kb.vmware.com/s/article/2010200) | Collecting esxtop statistics for analysis | esxtop 배치 수집 방법 |
| [KB 1027734](https://kb.vmware.com/s/article/1027734) | Using vmkfstools | vmkfstools 전체 레퍼런스 |
| [KB 2146005](https://kb.vmware.com/s/article/2146005) | PVSCSI performance best practices | PVSCSI 권장 설정 |
| [KB 1010877](https://kb.vmware.com/s/article/1010877) | VMXNET3 best practices | VMXNET3 권장 설정 |
| [KB 1004087](https://kb.vmware.com/s/article/1004087) | Storage I/O Control FAQ | SIOC 구성 가이드 |
| [KB 2054994](https://kb.vmware.com/s/article/2054994) | NUMA topology and VM sizing | NUMA 최적화 |
| [KB 1033665](https://kb.vmware.com/s/article/1033665) | CPU ready time and ready time percentage | %RDY 해석 |
| [KB 2019021](https://kb.vmware.com/s/article/2019021) | Memory overhead per virtual machine | VM 메모리 오버헤드 계산 |

### 빠른 참조 임계값 요약 / Quick Reference Threshold Summary

| 메트릭 / Metric | 정상 / Normal | 경고 / Warning | 심각 / Critical |
|----------------|--------------|---------------|----------------|
| CPU %RDY | < 5% | 5–10% | > 10% |
| CPU %CSTP | < 1% | 1–3% | > 3% |
| Memory MCTLSZ | 0 MB | > 0 MB | Sustained > 100 MB |
| Memory SWCUR | 0 MB | > 0 MB | Any value |
| Storage DAVG | < 10ms | 10–25ms | > 25ms |
| Storage KAVG | < 1ms | 1–2ms | > 2ms |
| Storage GAVG | < 15ms | 15–30ms | > 30ms |
| Network %DRPTX | 0% | > 0.01% | > 0.1% |
| Network %DRPRX | 0% | > 0.01% | > 0.1% |

### vSphere 7.0 공식 문서 / vSphere 7.0 Official Documentation

- [vSphere Resource Management Guide](https://docs.vmware.com/en/VMware-vSphere/7.0/vsphere-resource-management.pdf)
- [vSphere Monitoring and Performance Guide](https://docs.vmware.com/en/VMware-vSphere/7.0/vsphere-monitoring-performance.pdf)
- [vSAN Design and Sizing Guide](https://core.vmware.com/resource/vsan-design-and-sizing-guide)

### vSphere 8.0 공식 문서 / vSphere 8.0 Official Documentation

- [Performance Best Practices for vSphere 8.0 Update 3](https://www.vmware.com/docs/vsphere-esxi-vcenter-server-80U3-performance-best-practices)
- [Performance Tuning for Latency-Sensitive Workloads (2025-01)](https://www.vmware.com/docs/perf-latency-tuning-vsphere8)
- [Performance Best Practices for vSphere 9.0](https://www.vmware.com/docs/vsphere-esxi-vcenter-server-90-performance-best-practices)

---

## vSphere 8.0 Performance Changes / vSphere 8.0 성능 변경사항

> **vSphere 7.0 EOL Notice**: vSphere 7.0은 2025-10-02 End of General Support에 도달했습니다. 성능 관련 패치도 더 이상 제공되지 않습니다.

### DPU (Data Processing Unit) / Distributed Services Engine

vSphere 8.0에서 DPU(SmartNIC)를 통한 vSphere 서비스 오프로드가 도입되었습니다.

```
DPU 아키텍처:
- DPU 위에 별도의 ESXi 인스턴스 실행
- 메인 ESXi(x86)와 DPU ESXi 간 프라이빗 IPv4 채널 통신
- VMXNET3 UPTv2 모드: VM 네트워크 트래픽을 DPU에 직접 전달
- DRS, HA 등 vSphere 기능과 호환 유지

vSphere 8.0 U3 추가:
- 듀얼 DPU 지원 (Active/Standby HA 또는 Dual Independent)
- NVIDIA, Pensando DPU 지원
- vLCM을 통한 DPU 라이프사이클 관리 통합
```

| DPU 모드 | 설명 | 용도 |
|---------|------|------|
| Active/Standby | 1개 DPU 장애 시 자동 페일오버 | 고가용성 |
| Dual Independent | 2개 DPU로 오프로드 용량 2배 | 고성능 |

### 레이턴시 민감 워크로드 튜닝 (vSphere 8.0)

```bash
# esxtop에서 VM Tx 스레드 식별
# CPU 패널 확장 → NetWorld-Dev-xxx-TX 월드 확인
# VM Tx 스레드를 이그레스 NIC과 동일 NUMA 노드의 물리 CPU에 핀

# 레이턴시 민감도 설정 (VM 수준)
# vSphere Client → VM Settings → Advanced → Latency Sensitivity = High
# → vCPU가 물리 CPU 코어에 배타적 할당됨
```

### vSphere 8.0 U3 성능 관련 신기능

| 기능 | 설명 |
|------|------|
| Intel Xeon Max HBM 지원 | 64 GB 통합 HBM, HPC/AI/ML 워크로드 |
| C-State 제어 (vRAN) | vSphere Client에서 vRAN VM 전용 물리 CPU C-State 설정 |
| Live Patch | 호스트 리부팅 없이 ESXi 패치 적용 (TPM/DPU 미사용 시) |

### esxtop CPU 부하 기준 (8.0 동일)

```
esxtop CPU 패널 첫 줄 Load Average:
- >= 1.0: 과부하 (overloaded)
- 80% 사용률: 합리적 상한선
- 90% 사용률: 경고 수준 (CPU 과부하 접근)
```
