# VMware AIOps & Automation — Knowledge Base

> **vSphere 7.0 EOL Notice**: vSphere 7.0은 2025-10-02 일반 지원 종료 예정입니다.
> pyVmomi 8.0은 vSphere 8.0 API를 지원하며, 본 문서의 자동화 패턴은 7.0/8.0 모두에 적용 가능합니다.
> vSphere 8.0에서는 Aria Operations (구 vRealize Operations)로 리브랜딩되었습니다.
> 참고: [Broadcom KB 322186 — vSphere 7.0 EOL](https://knowledge.broadcom.com/external/article/322186)

AI 기반 VMware vCenter/ESXi 모니터링 및 운영 자동화 가이드.
AI-powered VMware vCenter/ESXi monitoring and operations automation guide.

---

## 개요 / Overview

pyVmomi(vSphere SOAP API)를 기반으로 AI CLI 도구와 Python 백엔드를 연동하여
자연어로 VMware 인프라를 관리하는 AIOps 패턴을 설명합니다.

This document covers AIOps automation patterns using pyVmomi (vSphere SOAP API),
Python-based CLI tooling, structured audit logging, scheduled scanning, and
webhook alerting for VMware vCenter and ESXi environments.

---

## 1. 버전 호환성 / Version Compatibility

| vSphere 버전 | 지원 | 비고 |
|---|---|---|
| 8.0 / 8.0U1-U3 | 완전 지원 / Full | `CreateSnapshot_Task` deprecated → `CreateSnapshotEx_Task` 사용 |
| 7.0 / 7.0U1-U3 | 완전 지원 / Full | 모든 API 정상 지원 |
| 6.7 | 호환 / Compatible | 하위 호환 테스트 완료 |
| 6.5 | 호환 / Compatible | 하위 호환 테스트 완료 |

> pyVmomi는 SOAP 핸드셰이크 시점에 API 버전을 자동 협상합니다.
> 동일 코드베이스로 7.0과 8.0 환경을 동시에 관리할 수 있습니다.

### vSphere 버전별 주의사항

- **vSphere 8.0**: `SmartConnectNoSSL()` 제거됨 → `SmartConnect(disableSslCertValidation=True)` 사용
- **vSphere 8.0**: `CreateSnapshot_Task` deprecated → `CreateSnapshotEx_Task` 권장
- **vSphere 7.0**: 모든 표준 API 완전 지원

---

## 2. pyVmomi 연결 패턴 / Connection Pattern

### 설정 파일 구조 (`~/.vmware-aiops/config.yaml`)

```yaml
targets:
  # vCenter Server
  - name: prod-vcenter
    host: vcenter-prod.example.com   # FQDN 권장 (Kerberos 인증 필요시)
    port: 443
    username: administrator@vsphere.local
    # 비밀번호는 환경변수로: VMWARE_PROD_VCENTER_PASSWORD
    type: vcenter
    verify_ssl: false

  # 독립 ESXi 호스트
  - name: lab-esxi
    host: esxi-lab.example.com
    port: 443
    username: root
    # 비밀번호는 환경변수로: VMWARE_LAB_ESXI_PASSWORD
    type: esxi
    verify_ssl: false

scanner:
  enabled: true
  interval_minutes: 15
  log_types:
    - vpxd
    - hostd
    - vmkernel
  severity_threshold: warning   # critical, warning, info
  lookback_hours: 1

notify:
  log_file: ~/.vmware-aiops/scan.log
  webhook_url: ""   # Slack, Discord, 또는 일반 HTTP 엔드포인트
  webhook_timeout: 10
```

### 비밀번호 환경변수 명명 규칙

```
VMWARE_{TARGET_NAME_UPPER}_PASSWORD
# 하이픈 → 언더스코어, 대문자
# 예: target "home-esxi"      → VMWARE_HOME_ESXI_PASSWORD
# 예: target "prod-vcenter"   → VMWARE_PROD_VCENTER_PASSWORD
```

`.env` 파일 사용 (권장):
```bash
cp .env.example ~/.vmware-aiops/.env
chmod 600 ~/.vmware-aiops/.env   # 반드시 권한 제한
```

### Python 연결 코드

```python
from pyVmomi import vim
import ssl
from pyVim.connect import SmartConnect, Disconnect
import atexit

def connect_to_vsphere(host, user, pwd, port=443, verify_ssl=False):
    """vCenter 또는 ESXi에 pyVmomi로 연결."""
    context = None
    if not verify_ssl:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    si = SmartConnect(
        host=host,
        user=user,
        pwd=pwd,
        port=port,
        sslContext=context,
        disableSslCertValidation=not verify_ssl,
    )
    atexit.register(Disconnect, si)
    return si

# 연결 재사용 (세션 유효성 확인)
def get_or_reconnect(si, target):
    try:
        _ = si.content.sessionManager.currentSession
        return si
    except Exception:
        return connect_to_vsphere(target.host, target.username, target.password)
```

---

## 3. 인벤토리 조회 / Inventory Queries

### VM 목록 조회

```python
from pyVmomi import vim

def list_vms(si):
    """모든 VM의 기본 정보 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True
    )
    results = []
    for vm in container.view:
        config = vm.config
        results.append({
            "name": vm.name,
            "power_state": str(vm.runtime.powerState),
            "cpu": config.hardware.numCPU if config else 0,
            "memory_mb": config.hardware.memoryMB if config else 0,
            "guest_os": config.guestFullName if config else "N/A",
            "ip_address": vm.guest.ipAddress if vm.guest else None,
            "host": vm.runtime.host.name if vm.runtime.host else "N/A",
            "uuid": config.uuid if config else "N/A",
            "tools_status": str(vm.guest.toolsRunningStatus) if vm.guest else "N/A",
        })
    container.Destroy()
    return sorted(results, key=lambda x: x["name"])
```

### 호스트 목록 조회

```python
def list_hosts(si):
    """모든 ESXi 호스트 정보 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.HostSystem], True
    )
    results = []
    for host in container.view:
        hw = host.hardware
        results.append({
            "name": host.name,
            "connection_state": str(host.runtime.connectionState),
            "power_state": str(host.runtime.powerState),
            "cpu_cores": hw.cpuInfo.numCpuCores if hw else 0,
            "cpu_threads": hw.cpuInfo.numCpuThreads if hw else 0,
            "memory_gb": round(hw.memorySize / (1024**3)) if hw else 0,
            "esxi_version": host.config.product.version if host.config else "N/A",
            "esxi_build": host.config.product.build if host.config else "N/A",
            "vm_count": len(host.vm) if host.vm else 0,
            "uptime_seconds": host.summary.quickStats.uptime or 0,
        })
    container.Destroy()
    return sorted(results, key=lambda x: x["name"])
```

### 데이터스토어 목록 조회

```python
def list_datastores(si):
    """데이터스토어 용량 및 상태 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True
    )
    results = []
    for ds in container.view:
        summary = ds.summary
        results.append({
            "name": ds.name,
            "type": summary.type,           # VMFS, NFS, vSAN 등
            "free_gb": round(summary.freeSpace / (1024**3), 1),
            "total_gb": round(summary.capacity / (1024**3), 1),
            "accessible": summary.accessible,
            "url": summary.url,
            "vm_count": len(ds.vm) if ds.vm else 0,
        })
    container.Destroy()
    return sorted(results, key=lambda x: x["name"])
```

### 클러스터 목록 조회 (vCenter 전용)

```python
def list_clusters(si):
    """클러스터 구성 정보 조회 (vCenter 전용)."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.ClusterComputeResource], True
    )
    results = []
    for cluster in container.view:
        cfg = cluster.configuration
        results.append({
            "name": cluster.name,
            "host_count": len(cluster.host) if cluster.host else 0,
            "drs_enabled": cfg.drsConfig.enabled if cfg.drsConfig else False,
            "drs_behavior": str(cfg.drsConfig.defaultVmBehavior) if cfg.drsConfig else "N/A",
            "ha_enabled": cfg.dasConfig.enabled if cfg.dasConfig else False,
            "total_cpu_mhz": cluster.summary.totalCpu if cluster.summary else 0,
            "total_memory_gb": round(
                cluster.summary.totalMemory / (1024**3)
            ) if cluster.summary and cluster.summary.totalMemory else 0,
        })
    container.Destroy()
    return sorted(results, key=lambda x: x["name"])
```

---

## 4. 헬스 체크 / Health Checks

### 활성 알람 조회

```python
def get_active_alarms(si):
    """전체 인벤토리의 활성 알람 조회."""
    content = si.RetrieveContent()
    results = []

    def _collect_alarms(entity):
        if not hasattr(entity, "triggeredAlarmState"):
            return
        for alarm_state in entity.triggeredAlarmState:
            severity = str(alarm_state.overallStatus)
            severity_map = {"red": "critical", "yellow": "warning", "green": "info"}
            results.append({
                "severity": severity_map.get(severity, severity),
                "alarm_name": alarm_state.alarm.info.name,
                "entity_name": alarm_state.entity.name,
                "entity_type": type(alarm_state.entity).__name__,
                "time": str(alarm_state.time),
                "acknowledged": getattr(alarm_state, "acknowledged", False),
            })

    # rootFolder 및 Datacenter, Cluster, Host 포함하여 수집
    _collect_alarms(content.rootFolder)
    for obj_type in [vim.Datacenter, vim.ClusterComputeResource, vim.HostSystem]:
        container = content.viewManager.CreateContainerView(
            content.rootFolder, [obj_type], True
        )
        for entity in container.view:
            _collect_alarms(entity)
        container.Destroy()

    # alarm + entity 기준 중복 제거
    seen = set()
    unique = []
    for a in results:
        key = (a["alarm_name"], a["entity_name"])
        if key not in seen:
            seen.add(key)
            unique.append(a)

    return sorted(unique, key=lambda x: {"critical": 0, "warning": 1, "info": 2}.get(x["severity"], 9))
```

### 이벤트 조회 및 심각도 분류

```python
from datetime import datetime, timedelta, timezone

# 이벤트 타입별 심각도 분류
CRITICAL_EVENTS = {
    "VmFailedToPowerOnEvent",
    "HostConnectionLostEvent",
    "HostShutdownEvent",
    "VmDiskFailedEvent",
    "DasHostFailedEvent",
    "DatastoreRemovedOnHostEvent",
}

WARNING_EVENTS = {
    "VmFailoverFailed",
    "DrsVmMigratedEvent",
    "DrsSoftRuleViolationEvent",
    "VmFailedToRebootGuestEvent",
    "DVPortGroupReconfiguredEvent",
    "VmGuestShutdownEvent",
    "HostIpChangedEvent",
    "BadUsernameSessionEvent",
}

INFO_EVENTS = {
    "VmPoweredOnEvent",
    "VmPoweredOffEvent",
    "VmMigratedEvent",
    "VmReconfiguredEvent",
    "UserLoginSessionEvent",
    "UserLogoutSessionEvent",
    "VmCreatedEvent",
    "VmRemovedEvent",
    "VmClonedEvent",
}

def get_recent_events(si, hours=24, severity="warning"):
    """최근 이벤트를 심각도로 필터링하여 조회."""
    content = si.RetrieveContent()
    event_mgr = content.eventManager

    now = datetime.now(tz=timezone.utc)
    begin = now - timedelta(hours=hours)

    filter_spec = vim.event.EventFilterSpec(
        time=vim.event.EventFilterSpec.ByTime(beginTime=begin, endTime=now)
    )
    events = event_mgr.QueryEvents(filter_spec)

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    min_level = severity_rank.get(severity, 1)

    results = []
    for event in events:
        event_type = type(event).__name__
        if event_type in CRITICAL_EVENTS:
            sev = "critical"
        elif event_type in WARNING_EVENTS:
            sev = "warning"
        elif event_type in INFO_EVENTS:
            sev = "info"
        else:
            sev = "info"

        if severity_rank.get(sev, 2) > min_level:
            continue

        results.append({
            "severity": sev,
            "event_type": event_type,
            "message": event.fullFormattedMessage or str(event),
            "time": str(event.createdTime),
            "username": event.userName if hasattr(event, "userName") else "N/A",
        })

    return sorted(results, key=lambda x: x["time"], reverse=True)
```

### 모니터링 대상 이벤트 타입 전체 목록

| 카테고리 | 이벤트 타입 | 심각도 |
|---|---|---|
| VM 장애 | `VmFailedToPowerOnEvent` | Critical |
| VM 장애 | `VmDiskFailedEvent` | Critical |
| 호스트 연결 | `HostConnectionLostEvent` | Critical |
| 호스트 연결 | `HostShutdownEvent` | Critical |
| 스토리지 | `DatastoreRemovedOnHostEvent` | Critical |
| HA | `DasHostFailedEvent` | Critical |
| VM 장애 | `VmFailoverFailed` | Warning |
| DRS | `DrsVmMigratedEvent` | Warning |
| DRS | `DrsSoftRuleViolationEvent` | Warning |
| 네트워크 | `DVPortGroupReconfiguredEvent` | Warning |
| 인증 | `BadUsernameSessionEvent` | Warning |
| 호스트 | `HostIpChangedEvent` | Warning |
| VM 작업 | `VmPoweredOnEvent` | Info |
| VM 작업 | `VmPoweredOffEvent` | Info |
| VM 작업 | `VmMigratedEvent` | Info |
| VM 작업 | `VmCreatedEvent` | Info |
| VM 작업 | `VmRemovedEvent` | Info |
| 인증 | `UserLoginSessionEvent` | Info |

### 하드웨어 센서 상태 조회

```python
def get_host_hardware_status(si):
    """호스트 하드웨어 센서 상태 조회 (온도, 전압, 팬)."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.HostSystem], True
    )
    results = []
    for host in container.view:
        runtime_health = host.runtime.healthSystemRuntime
        if not runtime_health or not runtime_health.systemHealthInfo:
            continue
        for sensor in runtime_health.systemHealthInfo.numericSensorInfo:
            results.append({
                "host": host.name,
                "sensor_name": sensor.name,
                "reading": sensor.currentReading,
                "unit": sensor.baseUnits,
                "sensor_type": str(sensor.sensorType) if hasattr(sensor, "sensorType") else "unknown",
            })
    container.Destroy()
    return results
```

### 호스트 서비스 상태 조회

```python
def get_host_services(si, host_name=None):
    """hostd, vpxa 등 호스트 서비스 실행 상태 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.HostSystem], True
    )
    results = []
    for host in container.view:
        if host_name and host.name != host_name:
            continue
        svc_system = host.configManager.serviceSystem
        if not svc_system:
            continue
        for svc in svc_system.serviceInfo.service:
            results.append({
                "host": host.name,
                "service": svc.key,
                "label": svc.label,
                "running": svc.running,
                "policy": svc.policy,
            })
    container.Destroy()
    return results
```

---

## 5. VM 생명주기 관리 / VM Lifecycle Operations

### 전원 조작

```python
import time

def power_on_vm(si, vm_name):
    vm = find_vm_by_name(si, vm_name)
    if vm.runtime.powerState == vim.VirtualMachine.PowerState.poweredOn:
        return f"VM '{vm_name}' is already powered on."
    task = vm.PowerOn()
    wait_for_task(task)
    return f"VM '{vm_name}' powered on successfully."

def power_off_vm(si, vm_name, force=False):
    vm = find_vm_by_name(si, vm_name)
    if vm.runtime.powerState == vim.VirtualMachine.PowerState.poweredOff:
        return f"VM '{vm_name}' is already powered off."

    if force:
        task = vm.PowerOff()
        wait_for_task(task)
        return f"VM '{vm_name}' force powered off."

    # VMware Tools를 통한 그레이스풀 종료
    try:
        vm.ShutdownGuest()
        for _ in range(60):
            time.sleep(2)
            if vm.runtime.powerState == vim.VirtualMachine.PowerState.poweredOff:
                return f"VM '{vm_name}' gracefully shut down."
        return f"VM '{vm_name}' shutdown initiated but still running after 120s. Use force=True if needed."
    except vim.fault.ToolsUnavailable:
        return f"VMware Tools not running on '{vm_name}'. Use force=True for hard power off."

def reset_vm(si, vm_name):
    vm = find_vm_by_name(si, vm_name)
    task = vm.Reset()
    wait_for_task(task)
    return f"VM '{vm_name}' reset successfully."

def suspend_vm(si, vm_name):
    vm = find_vm_by_name(si, vm_name)
    task = vm.Suspend()
    wait_for_task(task)
    return f"VM '{vm_name}' suspended successfully."
```

### VM 생성

```python
def create_vm(si, vm_name, cpu=2, memory_mb=4096, disk_gb=40,
              network_name="VM Network", datastore_name=None,
              folder_path=None, guest_id="otherGuest64"):
    """기본 구성으로 새 VM 생성."""
    content = si.RetrieveContent()

    # 데이터센터 및 폴더 찾기
    datacenter = content.rootFolder.childEntity[0]
    vm_folder = datacenter.vmFolder

    # 리소스 풀 설정
    resource_pool = datacenter.hostFolder.childEntity[0].resourcePool

    # 데이터스토어 경로
    ds_path = f"[{datastore_name}] {vm_name}" if datastore_name else vm_name

    # SCSI 컨트롤러
    scsi_spec = vim.vm.device.VirtualDeviceSpec(
        operation=vim.vm.device.VirtualDeviceSpec.Operation.add,
        device=vim.vm.device.ParaVirtualSCSIController(
            key=1000,
            sharedBus=vim.vm.device.VirtualSCSIController.Sharing.noSharing,
        ),
    )

    # 디스크
    disk_spec = vim.vm.device.VirtualDeviceSpec(
        fileOperation=vim.vm.device.VirtualDeviceSpec.FileOperation.create,
        operation=vim.vm.device.VirtualDeviceSpec.Operation.add,
        device=vim.vm.device.VirtualDisk(
            backing=vim.vm.device.VirtualDisk.FlatVer2BackingInfo(
                diskMode="persistent",
                thinProvisioned=True,
            ),
            capacityInKB=disk_gb * 1024 * 1024,
            controllerKey=1000,
            unitNumber=0,
        ),
    )

    # NIC (VMXNET3)
    nic_spec = vim.vm.device.VirtualDeviceSpec(
        operation=vim.vm.device.VirtualDeviceSpec.Operation.add,
        device=vim.vm.device.VirtualVmxnet3(
            backing=vim.vm.device.VirtualEthernetCard.NetworkBackingInfo(
                useAutoDetect=False,
                deviceName=network_name,
            ),
            connectable=vim.vm.device.VirtualDevice.ConnectInfo(
                startConnected=True,
                allowGuestControl=True,
                connected=True,
            ),
            addressType="assigned",
        ),
    )

    config_spec = vim.vm.ConfigSpec(
        name=vm_name,
        memoryMB=memory_mb,
        numCPUs=cpu,
        files=vim.vm.FileInfo(vmPathName=ds_path),
        guestId=guest_id,
        deviceChange=[scsi_spec, disk_spec, nic_spec],
    )

    task = vm_folder.CreateVM_Task(config=config_spec, pool=resource_pool)
    wait_for_task(task)
    return f"VM '{vm_name}' created (CPU: {cpu}, Mem: {memory_mb}MB, Disk: {disk_gb}GB)."
```

### VM 삭제

```python
def delete_vm(si, vm_name):
    """VM 삭제 (실행 중이면 강제 종료 후 삭제)."""
    vm = find_vm_by_name(si, vm_name)
    if vm.runtime.powerState == vim.VirtualMachine.PowerState.poweredOn:
        task = vm.PowerOff()
        wait_for_task(task)
    task = vm.Destroy_Task()
    wait_for_task(task)
    return f"VM '{vm_name}' deleted successfully."
```

### VM 리소스 변경

```python
def reconfigure_vm(si, vm_name, cpu=None, memory_mb=None):
    """VM CPU/메모리 재구성 (메모리 변경은 전원 OFF 권장)."""
    vm = find_vm_by_name(si, vm_name)
    spec = vim.vm.ConfigSpec()
    changes = []
    if cpu is not None:
        spec.numCPUs = cpu
        changes.append(f"CPU: {cpu}")
    if memory_mb is not None:
        spec.memoryMB = memory_mb
        changes.append(f"Memory: {memory_mb}MB")
    task = vm.ReconfigVM_Task(spec=spec)
    wait_for_task(task)
    return f"VM '{vm_name}' reconfigured: {', '.join(changes)}."
```

### 스냅샷 관리

```python
def create_snapshot(si, vm_name, snap_name, description="", memory=True):
    """VM 스냅샷 생성."""
    vm = find_vm_by_name(si, vm_name)
    # vSphere 8.0에서는 CreateSnapshotEx_Task 권장
    task = vm.CreateSnapshot_Task(
        name=snap_name,
        description=description,
        memory=memory,
        quiesce=not memory,   # 메모리 스냅샷과 quiesce 동시 사용 불가
    )
    wait_for_task(task)
    return f"Snapshot '{snap_name}' created for VM '{vm_name}'."

def list_snapshots(si, vm_name):
    """VM 스냅샷 목록 조회 (트리 구조 평탄화)."""
    vm = find_vm_by_name(si, vm_name)
    if not vm.snapshot:
        return []
    results = []
    def _walk(snap_list, level=0):
        for snap in snap_list:
            results.append({
                "name": snap.name,
                "description": snap.description,
                "created": str(snap.createTime),
                "state": str(snap.state),
                "level": level,
                "snapshot_ref": snap.snapshot,
            })
            if snap.childSnapshotList:
                _walk(snap.childSnapshotList, level + 1)
    _walk(vm.snapshot.rootSnapshotList)
    return results

def revert_to_snapshot(si, vm_name, snap_name):
    """특정 스냅샷으로 VM 복원."""
    snaps = list_snapshots(si, vm_name)
    target = next((s for s in snaps if s["name"] == snap_name), None)
    if target is None:
        available = ", ".join(s["name"] for s in snaps) or "none"
        return f"Snapshot '{snap_name}' not found. Available: {available}"
    task = target["snapshot_ref"].RevertToSnapshot_Task()
    wait_for_task(task)
    return f"VM '{vm_name}' reverted to snapshot '{snap_name}'."

def delete_snapshot(si, vm_name, snap_name, remove_children=False):
    """스냅샷 삭제."""
    snaps = list_snapshots(si, vm_name)
    target = next((s for s in snaps if s["name"] == snap_name), None)
    if target is None:
        return f"Snapshot '{snap_name}' not found."
    task = target["snapshot_ref"].RemoveSnapshot_Task(removeChildren=remove_children)
    wait_for_task(task)
    return f"Snapshot '{snap_name}' deleted from VM '{vm_name}'."
```

### VM 클론 및 vMotion

```python
def clone_vm(si, vm_name, new_name):
    """VM 클론 (동일 설정으로 복제)."""
    vm = find_vm_by_name(si, vm_name)
    folder = vm.parent
    relocate_spec = vim.vm.RelocateSpec()
    clone_spec = vim.vm.CloneSpec(
        location=relocate_spec,
        powerOn=False,
        template=False,
    )
    task = vm.Clone(folder=folder, name=new_name, spec=clone_spec)
    wait_for_task(task, timeout=600)
    return f"VM '{vm_name}' cloned as '{new_name}'."

def migrate_vm(si, vm_name, target_host_name):
    """vMotion으로 VM을 다른 호스트로 마이그레이션 (vCenter 전용)."""
    vm = find_vm_by_name(si, vm_name)
    target_host = find_host_by_name(si, target_host_name)
    if target_host is None:
        return f"Target host '{target_host_name}' not found."
    current_host = vm.runtime.host.name if vm.runtime.host else "unknown"
    if current_host == target_host_name:
        return f"VM '{vm_name}' is already on host '{target_host_name}'."
    relocate_spec = vim.vm.RelocateSpec(
        host=target_host,
        pool=target_host.parent.resourcePool,
    )
    task = vm.Relocate(spec=relocate_spec)
    wait_for_task(task, timeout=600)
    return f"VM '{vm_name}' migrated from '{current_host}' to '{target_host_name}'."
```

### 태스크 완료 대기 (공통 유틸리티)

```python
def wait_for_task(task, timeout=300):
    """vSphere 태스크 완료까지 대기. 실패 시 예외 발생."""
    start = time.time()
    while task.info.state in (vim.TaskInfo.State.running, vim.TaskInfo.State.queued):
        if time.time() - start > timeout:
            raise TimeoutError(f"Task timed out after {timeout}s")
        time.sleep(2)
    if task.info.state == vim.TaskInfo.State.success:
        return task.info.result
    error_msg = str(task.info.error.msg) if task.info.error else "Unknown error"
    raise Exception(f"Task failed: {error_msg}")
```

---

## 6. vSAN 관리 / vSAN Management

> vSAN SDK는 pyVmomi 8.0.3+에 통합되어 있습니다. 별도 설치 불필요.
> Reference: https://developer.broadcom.com/sdks/vsan-management-sdk-for-python/latest/

### vSAN 클러스터 헬스 체크

```python
def vsan_cluster_health(si, cluster_ref):
    """vSAN 클러스터 전체 헬스 요약 조회."""
    content = si.RetrieveContent()
    vsan_cluster_system = content.vsan.VsanVcClusterHealthSystem
    health = vsan_cluster_system.VsanQueryVcClusterHealthSummary(
        cluster=cluster_ref,
        fetchFromCache=False
    )
    print(f"Overall health: {health.overallHealth}")
    for group in health.groups:
        print(f"  [{group.groupHealth}] {group.groupName}")
        for test in group.groupTests:
            if test.testHealth != "green":
                print(f"    - {test.testName}: {test.testHealth}")
    return health
```

### vSAN 용량 조회

```python
def vsan_capacity(si, cluster_ref):
    """vSAN 스토리지 용량 사용 현황."""
    content = si.RetrieveContent()
    vsan_space = content.vsan.VsanSpaceReportSystem
    report = vsan_space.VsanQuerySpaceUsage(cluster=cluster_ref)
    total_tb = report.totalCapacityB / (1024**4)
    free_tb = report.freeCapacityB / (1024**4)
    used_tb = total_tb - free_tb
    print(f"Total: {total_tb:.2f} TB")
    print(f"Used:  {used_tb:.2f} TB ({used_tb/total_tb*100:.1f}%)")
    print(f"Free:  {free_tb:.2f} TB")
    return report
```

### vSAN 성능 지표 조회

```python
from datetime import datetime, timedelta

def vsan_performance(si, cluster_ref, hours=1):
    """vSAN IOPS, 지연시간, 처리량 지표 조회."""
    content = si.RetrieveContent()
    vsan_perf = content.vsan.VsanPerformanceManager

    spec = vim.cluster.VsanPerfQuerySpec(
        entityRefId="cluster-domclient:*",
        startTime=datetime.now() - timedelta(hours=hours),
        endTime=datetime.now(),
        labels=["iopsRead", "iopsWrite", "latencyAvgRead", "latencyAvgWrite",
                "throughputRead", "throughputWrite"]
    )
    metrics = vsan_perf.VsanPerfQueryPerf(querySpecs=[spec], cluster=cluster_ref)
    return metrics
```

---

## 7. Aria Operations / VCF Operations 연동

> REST API 엔드포인트: `/suite-api/`
> VCF 9.0에서 VCF Operations로 리브랜딩
> Reference: https://developer.broadcom.com/xapis/vmware-aria-operations-api/latest/

### 인증

```python
import requests

def aria_authenticate(ops_host, username="admin", password="", auth_source="local"):
    """Aria Operations REST API 토큰 획득."""
    resp = requests.post(
        f"https://{ops_host}/suite-api/api/auth/token/acquire",
        json={"username": username, "password": password, "authSource": auth_source},
        verify=False
    )
    resp.raise_for_status()
    token = resp.json()["token"]
    return {"Authorization": f"vRealizeOpsToken {token}", "Accept": "application/json"}
```

### 주요 API 엔드포인트

```python
# 지능형 알람 조회 (근본 원인 포함)
# GET /suite-api/api/alerts?alertCriticality=CRITICAL&status=ACTIVE

# 시계열 메트릭 조회
# POST /suite-api/api/resources/{id}/stats/query
# Body: {"statKey": ["cpu|usage_average", "mem|usage_average"],
#        "begin": begin_epoch_ms, "end": end_epoch_ms}

# Right-sizing 권장 사항
# GET /suite-api/api/recommendations

# 클러스터 잔여 용량
# GET /suite-api/api/resources/{id}/stats?statKey=summary|capacity_remaining_percentage

def aria_get_critical_alerts(ops_host, headers):
    """Critical 상태 활성 알람 조회."""
    resp = requests.get(
        f"https://{ops_host}/suite-api/api/alerts",
        params={"alertCriticality": "CRITICAL", "status": "ACTIVE"},
        headers=headers, verify=False
    )
    return resp.json().get("alerts", [])

def aria_get_metrics(ops_host, headers, resource_id, stat_keys, hours=24):
    """시계열 메트릭 조회."""
    import time as _time
    end_ms = int(_time.time() * 1000)
    begin_ms = end_ms - hours * 3600 * 1000
    resp = requests.post(
        f"https://{ops_host}/suite-api/api/resources/{resource_id}/stats/query",
        json={"statKey": stat_keys, "begin": begin_ms, "end": end_ms},
        headers=headers, verify=False
    )
    return resp.json()
```

---

## 8. vSphere Kubernetes Service (VKS) 관리

> VKS 3.6+는 Cluster API 규격 사용
> Reference: https://developer.broadcom.com/xapis/vmware-vsphere-kubernetes-service/3.6.0/api-docs.html

```python
import subprocess, json

def vks_list_clusters(kubeconfig_path, namespace="default"):
    """Tanzu Kubernetes 클러스터 목록 조회."""
    result = subprocess.run(
        ["kubectl", "--kubeconfig", kubeconfig_path,
         "-n", namespace, "get", "clusters", "-o", "json"],
        capture_output=True, text=True
    )
    clusters = json.loads(result.stdout).get("items", [])
    for c in clusters:
        name = c["metadata"]["name"]
        phase = c.get("status", {}).get("phase", "Unknown")
        print(f"{name} | Phase: {phase}")
    return clusters

def vks_cluster_health(kubeconfig_path, cluster_name, namespace="default"):
    """클러스터 헬스 조건 확인 (InfrastructureReady, ControlPlaneAvailable, WorkersAvailable)."""
    result = subprocess.run(
        ["kubectl", "--kubeconfig", kubeconfig_path,
         "-n", namespace, "get", "cluster", cluster_name, "-o", "json"],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    conditions = data.get("status", {}).get("conditions", [])
    for cond in conditions:
        status_icon = "OK" if cond["status"] == "True" else "FAIL"
        print(f"  [{status_icon}] {cond['type']}: {cond.get('message','')}")
    return conditions

def vks_scale_workers(kubeconfig_path, machine_deployment, replicas, namespace="default"):
    """워커 노드 수 조정."""
    subprocess.run([
        "kubectl", "--kubeconfig", kubeconfig_path, "-n", namespace,
        "patch", "machinedeployment", machine_deployment,
        "-p", json.dumps({"spec": {"replicas": replicas}}),
        "--type=merge"
    ])
    print(f"Scaled {machine_deployment} to {replicas} replicas.")
```

---

## 9. 스케줄드 스캐닝 데몬 / Scheduled Scanning Daemon

APScheduler 기반 주기적 스캔 데몬 패턴:

```python
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger
import signal, sys, os
from pathlib import Path

PID_FILE = Path.home() / ".vmware-aiops" / "daemon.pid"

def run_scan_cycle(config, conn_mgr):
    """모든 타겟에 대한 단일 스캔 사이클 실행."""
    all_issues = []

    for target_name in conn_mgr.list_targets():
        try:
            si = conn_mgr.connect(target_name)
        except Exception as e:
            all_issues.append({
                "severity": "critical",
                "source": "connection",
                "message": f"Failed to connect to {target_name}: {e}",
                "entity": target_name,
            })
            continue

        # 알람 스캔
        all_issues.extend(scan_alarms(si))
        # 이벤트 스캔
        all_issues.extend(scan_events(si, config.scanner))
        # 호스트 로그 스캔
        all_issues.extend(scan_host_logs(si))

    # JSONL 로그 기록
    for issue in all_issues:
        log_issue_to_jsonl(issue)

    # Critical/Warning 이슈 웹훅 발송
    important = [i for i in all_issues if i["severity"] in ("critical", "warning")]
    if important and config.notify.webhook_url:
        send_webhook(config.notify.webhook_url, important)

def start_daemon(config):
    """스캔 데몬 시작."""
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))

    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_scan_cycle,
        trigger=IntervalTrigger(minutes=config.scanner.interval_minutes),
        args=[config, conn_mgr],
        max_instances=1,
    )

    def shutdown(signum, frame):
        scheduler.shutdown(wait=False)
        PID_FILE.unlink(missing_ok=True)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 시작 즉시 첫 스캔 실행 후 스케줄러 시작
    run_scan_cycle(config, conn_mgr)
    scheduler.start()
```

### 호스트 로그 패턴 스캔

```python
ERROR_PATTERNS = [
    "error", "fail", "critical", "panic", "lost access",
    "cannot", "timeout", "refused", "corrupt",
]

def scan_host_logs(si, host_name=None, log_keys=("hostd", "vmkernel", "vpxa"), lines=500):
    """ESXi 호스트 진단 로그에서 오류 패턴 스캔."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.HostSystem], True
    )
    issues = []
    for host in container.view:
        if host_name and host.name != host_name:
            continue
        diag_mgr = host.configManager.diagnosticSystem
        if not diag_mgr:
            continue
        for log_key in log_keys:
            try:
                log_data = diag_mgr.BrowseDiagnosticLog(key=log_key, start=max(1, lines))
            except Exception:
                continue
            if not log_data or not log_data.lineText:
                continue
            for line in log_data.lineText:
                line_lower = line.lower()
                if any(pattern in line_lower for pattern in ERROR_PATTERNS):
                    severity = (
                        "critical"
                        if any(p in line_lower for p in ("critical", "panic", "corrupt"))
                        else "warning"
                    )
                    issues.append({
                        "severity": severity,
                        "source": f"host_log:{log_key}",
                        "message": f"[{host.name}] {line.strip()[:200]}",
                        "entity": host.name,
                    })
    container.Destroy()
    return issues
```

---

## 10. 감사 로그 / Audit Logging

모든 운영 작업은 JSONL 형식으로 감사 로그에 기록되어야 합니다.

```python
import json, getpass
from datetime import datetime, timezone
from pathlib import Path

AUDIT_LOG = Path.home() / ".vmware-aiops" / "audit.log"

def audit_log(target, operation, resource, parameters=None,
              before_state=None, after_state=None, result="", skill="aiops"):
    """운영 감사 로그 기록 (JSONL 형식, 추가 전용)."""
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "target": target,
        "operation": operation,
        "resource": resource,
        "skill": skill,
        "parameters": parameters or {},
        "before_state": before_state or {},
        "after_state": after_state or {},
        "result": result,
        "user": getpass.getuser(),
    }
    with open(AUDIT_LOG, "a") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
```

### 감사 로그 항목 예시

```json
{
  "timestamp": "2026-02-28T10:23:45.123456+00:00",
  "target": "prod-vcenter",
  "operation": "power_off",
  "resource": "web-server-01",
  "skill": "aiops",
  "parameters": {"force": false},
  "before_state": {"power_state": "poweredOn"},
  "after_state": {"power_state": "poweredOff"},
  "result": "VM 'web-server-01' gracefully shut down.",
  "user": "admin"
}
```

### Dry-Run 감사 로그

```json
{
  "timestamp": "2026-02-28T10:20:00.000000+00:00",
  "target": "prod-vcenter",
  "operation": "delete_vm",
  "resource": "test-vm",
  "skill": "aiops",
  "parameters": {"dry_run": true},
  "before_state": {"power_state": "poweredOff", "cpu": 2},
  "after_state": {},
  "result": "dry-run",
  "user": "admin"
}
```

---

## 11. 웹훅 알림 / Webhook Notifications

```python
import httpx, json
from datetime import datetime, timezone

def send_webhook(url, issues, timeout=10):
    """Slack/Discord/일반 HTTP 엔드포인트로 이슈 발송."""
    critical = [i for i in issues if i["severity"] == "critical"]
    warning = [i for i in issues if i["severity"] == "warning"]

    # Slack 호환 텍스트 포맷
    lines = ["*VMware AIops Scanner Alert*\n"]
    for issue in issues[:20]:
        icon = ":red_circle:" if issue["severity"] == "critical" else ":warning:"
        lines.append(f"{icon} `{issue.get('entity', 'N/A')}` {issue['message']}")
    if len(issues) > 20:
        lines.append(f"\n... and {len(issues) - 20} more")

    payload = {
        "source": "vmware-aiops",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "summary": f"VMware AIops: {len(critical)} critical, {len(warning)} warning issue(s)",
        "issues": issues,
        "text": "\n".join(lines),   # Slack incoming webhook 호환
    }

    try:
        response = httpx.post(
            url,
            content=json.dumps(payload, ensure_ascii=False),
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        return response.status_code < 300
    except httpx.HTTPError as e:
        print(f"Webhook failed: {e}")
        return False
```

---

## 12. MCP 서버 패턴 / MCP Server Pattern

FastMCP를 사용한 VMware 작업의 MCP 도구 노출:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "vmware-aiops",
    instructions="VMware vCenter/ESXi AI-powered monitoring and operations.",
)

@mcp.tool()
def list_virtual_machines(target: str | None = None) -> list[dict]:
    """List all VMs with name, power state, CPU, memory, guest OS, and IP."""
    si = get_connection(target)
    return list_vms(si)

@mcp.tool()
def get_alarms(target: str | None = None) -> list[dict]:
    """Get all active/triggered alarms across the VMware inventory."""
    si = get_connection(target)
    return get_active_alarms(si)

@mcp.tool()
def vm_power_on(vm_name: str, target: str | None = None) -> str:
    """Power on a virtual machine."""
    si = get_connection(target)
    return power_on_vm(si, vm_name)

def main():
    mcp.run(transport="stdio")
```

### Claude Desktop 구성

```json
{
  "mcpServers": {
    "vmware-aiops": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "env": {
        "VMWARE_AIOPS_CONFIG": "/path/to/config.yaml"
      }
    }
  }
}
```

---

## 13. 안전 운영 원칙 / Safety Principles

### 이중 확인 패턴 (파괴적 작업)

다음 작업은 반드시 이중 확인을 요구해야 합니다:
- VM 삭제 (`delete`)
- VM 강제/그레이스풀 종료 (`power-off`)
- VM 리소스 변경 (`reconfigure`)
- 스냅샷 복원 (`snapshot-revert`)
- 스냅샷 삭제 (`snapshot-delete`)
- VM 클론 (`clone`)
- VM 마이그레이션 (`migrate`)

```python
def double_confirm(action, resource_name):
    """파괴적 작업 이중 확인."""
    print(f"WARNING: About to {action} '{resource_name}'")
    confirm1 = input(f"Confirm 1: Type 'yes' to {action} '{resource_name}': ")
    if confirm1.strip().lower() != "yes":
        raise SystemExit("Operation cancelled.")
    confirm2 = input(f"Confirm 2: Type '{resource_name}' to confirm: ")
    if confirm2.strip() != resource_name:
        raise SystemExit("Operation cancelled.")
```

### Dry-Run 패턴

```python
def dry_run_preview(target, vm_name, operation, api_call, parameters=None, before_state=None):
    """실행하지 않고 API 호출을 미리 보여주는 dry-run 출력."""
    print(f"\n[DRY-RUN] No changes will be made.")
    print(f"  Target:    {target}")
    print(f"  VM:        {vm_name}")
    print(f"  Operation: {operation}")
    print(f"  API Call:  {api_call}")
    if parameters:
        for k, v in parameters.items():
            print(f"  Param:     {k} = {v}")
    if before_state:
        print(f"  Current:   {before_state}")
    print(f"  Run without --dry-run to execute.\n")
```

### 입력 검증 규칙

| 파라미터 | 유효 범위 | 비고 |
|---|---|---|
| VM 이름 | 1-80자 | `-` 또는 `.`으로 시작 불가 |
| CPU | 1-128 | 정수 |
| 메모리 | 128-1,048,576 MB | 128MB 최소 |
| 디스크 | 1-65,536 GB | 정수 |

### 보안 체크리스트

- [ ] 비밀번호를 스크립트나 설정 파일에 하드코딩하지 않음
- [ ] `.env` 파일 권한을 `chmod 600`으로 설정
- [ ] 환경변수 `VMWARE_{TARGET_NAME}_PASSWORD` 명명 규칙 준수
- [ ] 출력이나 로그에 비밀번호가 표시되지 않음
- [ ] 항상 `ConnectionManager.from_config()`를 통해 연결
- [ ] 프로덕션 환경 작업 전 반드시 확인 절차 수행
- [ ] 모든 작업에 감사 로그 기록

---

## 14. vCenter vs ESXi 차이 / vCenter vs ESXi Differences

| 기능 | vCenter | ESXi 단독 |
|---|:---:|:---:|
| 전체 클러스터 인벤토리 | ✅ | ❌ 자체 호스트만 |
| DRS/HA 관리 | ✅ | ❌ |
| vMotion 마이그레이션 | ✅ | ❌ |
| 교차 호스트 클론 | ✅ | ❌ |
| 모든 VM 생명주기 작업 | ✅ | ✅ |
| 알람 및 이벤트 | ✅ | ✅ |
| 하드웨어 센서 | ✅ | ✅ |
| 호스트 서비스 | ✅ | ✅ |
| 스냅샷 | ✅ | ✅ |
| 스케줄드 스캐닝 | ✅ | ✅ |

---

## 15. pyVmomi API 객체 참조

| API 객체 | 용도 |
|---|---|
| `vim.VirtualMachine` | VM 생명주기, 스냅샷, 클론, 마이그레이션 |
| `vim.HostSystem` | ESXi 호스트 정보, 센서, 서비스 |
| `vim.Datastore` | 스토리지 용량, 타입, 접근성 |
| `vim.ClusterComputeResource` | 클러스터, DRS, HA |
| `vim.Network` | 네트워크 목록 |
| `vim.alarm.AlarmManager` | 활성 알람 모니터링 |
| `vim.event.EventManager` | 이벤트/로그 쿼리 |
| `content.vsan.VsanVcClusterHealthSystem` | vSAN 헬스 |
| `content.vsan.VsanSpaceReportSystem` | vSAN 용량 |
| `content.vsan.VsanPerformanceManager` | vSAN 성능 |

---

## References

- pyVmomi: https://github.com/vmware/pyvmomi
- vSphere Web Services API: https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/
- vSAN Management SDK: https://developer.broadcom.com/sdks/vsan-management-sdk-for-python/latest/
- Aria Operations API: https://developer.broadcom.com/xapis/vmware-aria-operations-api/latest/
- VKS API: https://developer.broadcom.com/xapis/vmware-vsphere-kubernetes-service/3.6.0/api-docs.html
- VCF 9.0 API Spec: https://developer.broadcom.com/sdks/vcf-api-specification/latest/
- VMware AIops (zw008): https://github.com/zw008/VMware-AIops
- pyVmomi Community Samples: https://github.com/vmware/pyvmomi-community-samples

---

## 16. OVA/OVF 배포 자동화 / OVA/OVF Deployment Automation

> Source: [pyvmomi-community-samples/samples/deploy_ova.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/samples/deploy_ova.py) and [deploy_ovf.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/samples/deploy_ovf.py)

OVA/OVF 파일을 pyVmomi로 프로그래밍 방식으로 배포하는 패턴입니다.
OVA는 tarball 형식이므로 `tarfile` 모듈을 병행 사용합니다.

This section covers programmatic OVA/OVF deployment using pyVmomi.
OVA files are tarballs — the `tarfile` module is used alongside the OVF manager API.

### 핵심 흐름 / Core Deployment Flow

```
1. OVF 디스크립터 읽기  →  2. CreateImportSpec 호출  →  3. ImportVApp(lease 획득)
→  4. HttpNfcLease 초기화 대기  →  5. 디스크 업로드(진행률 유지)  →  6. lease.Complete()
```

### 리소스 및 데이터스토어 선택 / Resource & Datastore Selection

```python
from pyVmomi import vim

def get_largest_free_rp(si, datacenter):
    """가용 메모리가 가장 큰 리소스 풀 자동 선택."""
    view_manager = si.content.viewManager
    container_view = view_manager.CreateContainerView(
        datacenter, [vim.ResourcePool], True)
    largest_rp = None
    unreserved_for_vm = 0
    try:
        for rp in container_view.view:
            if rp.runtime.memory.unreservedForVm > unreserved_for_vm:
                largest_rp = rp
                unreserved_for_vm = rp.runtime.memory.unreservedForVm
    finally:
        container_view.Destroy()
    if largest_rp is None:
        raise Exception("No resource pool found in datacenter %s" % datacenter.name)
    return largest_rp

def get_largest_free_ds(datacenter):
    """접근 가능한 데이터스토어 중 여유 공간이 가장 큰 것 선택."""
    largest = None
    largest_free = 0
    for ds in datacenter.datastore:
        try:
            free = ds.summary.freeSpace
            if free > largest_free and ds.summary.accessible:
                largest_free = free
                largest = ds
        except Exception:
            pass
    if largest is None:
        raise Exception("No free datastores on %s" % datacenter.name)
    return largest
```

### OVF 배포 (로컬 .ovf + .vmdk) / OVF Deployment Pattern

```python
import threading
import time
from pyVmomi import vim

def get_ovf_descriptor(ovf_path):
    """OVF 디스크립터(XML) 읽기."""
    with open(ovf_path, 'r') as f:
        return f.read()

def keep_lease_alive(lease):
    """디스크 업로드 중 HttpNfcLease 만료 방지 (별도 스레드)."""
    while True:
        time.sleep(5)
        try:
            lease.HttpNfcLeaseProgress(50)
            if lease.state == vim.HttpNfcLease.State.done:
                return
        except Exception:
            return

def deploy_ovf(si, ovf_path, vmdk_path, datacenter_name=None,
               datastore_name=None, cluster_name=None):
    """OVF + VMDK 파일로 VM 배포."""
    content = si.RetrieveContent()
    ovfd = get_ovf_descriptor(ovf_path)

    # 리소스 해석
    datacenter = content.rootFolder.childEntity[0]
    datastore = datacenter.datastoreFolder.childEntity[0]
    cluster = datacenter.hostFolder.childEntity[0]
    resource_pool = cluster.resourcePool

    # ImportSpec 생성
    manager = content.ovfManager
    spec_params = vim.OvfManager.CreateImportSpecParams()
    import_spec = manager.CreateImportSpec(ovfd, resource_pool, datastore, spec_params)

    # ImportVApp — lease 획득
    lease = resource_pool.ImportVApp(import_spec.importSpec, datacenter.vmFolder)
    while lease.state == vim.HttpNfcLease.State.initializing:
        time.sleep(1)
    if lease.state == vim.HttpNfcLease.State.error:
        raise Exception("Lease error: %s" % lease.error)

    # 진행률 유지 스레드 시작
    keepalive_thread = threading.Thread(target=keep_lease_alive, args=(lease,))
    keepalive_thread.start()

    # 디스크 업로드
    for device_url in lease.info.deviceUrl:
        url = device_url.url.replace('*', si._stub.host.split(':')[0])
        import urllib.request
        with open(vmdk_path, 'rb') as f:
            req = urllib.request.Request(url, f,
                headers={'Content-length': str(os.path.getsize(vmdk_path))})
            urllib.request.urlopen(req)

    lease.Complete()
    keepalive_thread.join()
    print("OVF deployment complete.")
```

### OVA 배포 (tarball 처리) / OVA Deployment Pattern

```python
import tarfile
import ssl
from urllib.request import Request, urlopen
from threading import Timer
from pyVmomi import vim, vmodl

class OvfHandler:
    """OVA tarball 처리 및 디스크 업로드 핸들러."""

    def __init__(self, ova_path):
        # 로컬 파일 또는 URL 지원
        if os.path.exists(ova_path):
            fh = open(ova_path, 'rb')
        else:
            fh = urlopen(ova_path)  # URL 핸들러
        self.tarfile = tarfile.open(fileobj=fh)
        # OVF 디스크립터 추출
        ovf_name = [n for n in self.tarfile.getnames() if n.endswith('.ovf')][0]
        self.descriptor = self.tarfile.extractfile(ovf_name).read().decode()

    def get_descriptor(self):
        return self.descriptor

    def upload_disks(self, lease, host, spec):
        """모든 디스크 업로드 후 lease 완료."""
        try:
            for file_item in spec.fileItem:
                # 디스크 키 → 파일명 매핑
                ovf_file = self.tarfile.extractfile(file_item.path)
                device_url = next(
                    u for u in lease.info.deviceUrl
                    if u.importKey == file_item.deviceId)
                url = device_url.url.replace('*', host)
                ssl_ctx = ssl._create_unverified_context()
                req = Request(url, ovf_file,
                              headers={'Content-length': file_item.size or 0})
                urlopen(req, context=ssl_ctx)
            lease.Complete()
        except Exception as ex:
            lease.Abort(vmodl.fault.SystemError(reason=str(ex)))
            raise

def deploy_ova(si, ova_path, datacenter=None, resource_pool=None, datastore=None):
    """OVA 파일 배포 (로컬 경로 또는 URL)."""
    import time
    content = si.RetrieveContent()

    if datacenter is None:
        datacenter = content.rootFolder.childEntity[0]
    if resource_pool is None:
        resource_pool = get_largest_free_rp(si, datacenter)
    if datastore is None:
        datastore = get_largest_free_ds(datacenter)

    handler = OvfHandler(ova_path)
    ovf_manager = content.ovfManager

    # CreateImportSpec: diskProvisioning, networkMapping, propertyMapping 지정 가능
    cisp = vim.OvfManager.CreateImportSpecParams(
        diskProvisioning='thin',        # thin / thick / eagerZeroedThick
        # networkMapping=[              # 네트워크 매핑 예시
        #   vim.OvfManager.NetworkMapping(name='VM Network', network=network_ref)
        # ],
    )
    cisr = ovf_manager.CreateImportSpec(
        handler.get_descriptor(), resource_pool, datastore, cisp)

    if cisr.error:
        for err in cisr.error:
            print("Import spec error: %s" % err)
        raise Exception("OVA import spec creation failed.")

    lease = resource_pool.ImportVApp(cisr.importSpec, datacenter.vmFolder)
    while lease.state == vim.HttpNfcLease.State.initializing:
        time.sleep(1)
    if lease.state == vim.HttpNfcLease.State.error:
        raise Exception("Lease error: %s" % lease.error)

    host = si._stub.host.split(':')[0]
    handler.upload_disks(lease, host, cisr)
    print("OVA deployment complete.")
```

### CreateImportSpecParams 주요 옵션

| 파라미터 | 설명 | 예시 값 |
|----------|------|---------|
| `diskProvisioning` | 디스크 프로비저닝 타입 | `thin`, `thick`, `eagerZeroedThick` |
| `networkMapping` | OVF 네트워크명 → vSphere 네트워크 매핑 | `[vim.OvfManager.NetworkMapping(name='VM Network', network=ref)]` |
| `propertyMapping` | OVF 프로퍼티 키-값 (예: IP 설정) | `[vim.KeyValue(key='ip0', value='192.168.1.10')]` |
| `entityName` | 배포 후 VM 이름 지정 | `'my-appliance-01'` |

### OVF 배포 주의사항 / OVF Deployment Notes

- **Lease 만료 방지**: 대용량 OVA 업로드 시 별도 스레드로 `lease.HttpNfcLeaseProgress()` 주기적 호출 필수
- **네트워크 매핑**: `cisr.warning` 항목에 매핑 오류가 표시되므로 반드시 확인
- **에러 처리**: `cisr.error`와 `cisr.warning` 모두 확인 후 업로드 진행
- **롤백**: 실패 시 `lease.Abort()` 호출로 불완전한 VM 정리

---

## 17. 성능 카운터 수집 / Performance Counter Collection

> Source: [pyvmomi-community-samples/samples/esxi_perf_sample.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/samples/esxi_perf_sample.py)

vSphere `perfManager` API를 사용하여 ESXi 호스트 및 VM의 성능 지표를 수집합니다.
esxtop과 동일한 데이터를 프로그래밍 방식으로 수집할 수 있습니다.

The vSphere `perfManager` API provides the same performance data as esxtop,
accessible programmatically via `PerfQuerySpec` and `QueryPerf`.

### 기본 성능 쿼리 패턴 / Basic PerfQuerySpec Pattern

```python
import datetime
from pyVmomi import vim

def query_host_perf(si, host_dns_name, counter_id=6, instance="*", hours=1):
    """
    ESXi 호스트 성능 카운터 조회.
    counter_id=6 은 CPU 사용률(cpu.usage.average, %)에 해당.
    instance="*" 는 모든 코어/인스턴스 포함.
    """
    content = si.RetrieveContent()

    # DNS명으로 호스트 검색
    search_index = content.searchIndex
    host = search_index.FindByDnsName(dnsName=host_dns_name, vmSearch=False)
    if host is None:
        raise Exception("Host '%s' not found." % host_dns_name)

    perf_manager = content.perfManager

    # MetricId: counterId + instance 지정
    metric_id = vim.PerformanceManager.MetricId(
        counterId=counter_id,
        instance=instance   # "" = 집계값만, "*" = 모든 인스턴스
    )

    start_time = datetime.datetime.now() - datetime.timedelta(hours=hours)
    end_time = datetime.datetime.now()

    query = vim.PerformanceManager.QuerySpec(
        maxSample=1,           # 최신 샘플 1개 (실시간 조회)
        entity=host,
        metricId=[metric_id],
        startTime=start_time,
        endTime=end_time,
        intervalId=20,         # 20초 실시간 / 300=5분 롤업 / 1800=30분 / 7200=2시간
    )

    results = perf_manager.QueryPerf(querySpec=[query])
    return results
```

### 카운터 ID 조회 / Discovering Counter IDs

```python
def get_perf_counter_map(si):
    """
    전체 성능 카운터 목록을 {group.key: {counter_name: counter_id}} 형태로 반환.
    카운터 ID를 모를 때 이 함수로 먼저 조회.
    """
    content = si.RetrieveContent()
    perf_manager = content.perfManager
    counter_map = {}
    for counter in perf_manager.perfCounter:
        group = counter.groupInfo.key
        name = counter.nameInfo.key
        rollup = counter.rollupType        # average, maximum, minimum, summation, latest, none
        unit = counter.unitInfo.key
        key = counter.key
        counter_map.setdefault(group, {})[f"{name}.{rollup}"] = {
            "id": key, "unit": unit
        }
    return counter_map

def find_counter_id(si, group, name, rollup="average"):
    """특정 그룹/이름/롤업 타입으로 카운터 ID 조회."""
    content = si.RetrieveContent()
    for counter in content.perfManager.perfCounter:
        if (counter.groupInfo.key == group and
                counter.nameInfo.key == name and
                str(counter.rollupType) == rollup):
            return counter.key
    return None
```

### 주요 성능 카운터 ID (vSphere 7.0 기준)

| 그룹 | 카운터명 | 롤업 | 설명 | 단위 |
|------|----------|------|------|------|
| `cpu` | `usage` | `average` | CPU 전체 사용률 | % (100분율) |
| `cpu` | `ready` | `summation` | CPU Ready 시간 | ms |
| `cpu` | `costop` | `summation` | Co-Stop 시간 | ms |
| `cpu` | `latency` | `average` | CPU 스케줄 지연 | % |
| `mem` | `usage` | `average` | 메모리 사용률 | % |
| `mem` | `active` | `average` | 활성 메모리 | KB |
| `mem` | `consumed` | `average` | 소비 메모리 | KB |
| `mem` | `swapused` | `average` | 스왑 사용량 | KB |
| `mem` | `balloned` | `average` | 벌룬 메모리 | KB |
| `disk` | `read` | `average` | 디스크 읽기 처리량 | KB/s |
| `disk` | `write` | `average` | 디스크 쓰기 처리량 | KB/s |
| `disk` | `commandsAveraged` | `average` | IOPS | 횟수/s |
| `disk` | `totalLatency` | `average` | 총 I/O 지연 | ms |
| `net` | `received` | `average` | 수신 처리량 | KB/s |
| `net` | `transmitted` | `average` | 송신 처리량 | KB/s |
| `net` | `droppedRx` | `summation` | 수신 드롭 패킷 | 횟수 |
| `datastore` | `totalReadLatency` | `average` | 데이터스토어 읽기 지연 | ms |
| `datastore` | `totalWriteLatency` | `average` | 데이터스토어 쓰기 지연 | ms |

### 다중 엔티티 일괄 수집 / Bulk Collection for Multiple Entities

```python
def collect_vm_perf_bulk(si, counter_ids, interval_id=20, max_sample=3):
    """
    모든 VM의 지정 카운터를 한 번의 QueryPerf 호출로 일괄 수집.
    개별 쿼리보다 훨씬 효율적.
    """
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True)

    perf_manager = content.perfManager
    metric_ids = [
        vim.PerformanceManager.MetricId(counterId=cid, instance="")
        for cid in counter_ids
    ]

    query_specs = []
    for vm in container.view:
        if vm.runtime.powerState == vim.VirtualMachine.PowerState.poweredOn:
            query_specs.append(vim.PerformanceManager.QuerySpec(
                entity=vm,
                metricId=metric_ids,
                intervalId=interval_id,
                maxSample=max_sample,
            ))
    container.Destroy()

    if not query_specs:
        return []

    results = perf_manager.QueryPerf(querySpec=query_specs)

    output = []
    for result in results:
        vm_name = result.entity.name
        for series in result.value:
            output.append({
                "vm": vm_name,
                "counter_id": series.id.counterId,
                "instance": series.id.instance,
                "values": list(series.value),   # 정수 리스트 (단위는 카운터마다 다름)
            })
    return output

# 사용 예:
# cpu_id = find_counter_id(si, "cpu", "usage", "average")
# mem_id = find_counter_id(si, "mem", "usage", "average")
# data = collect_vm_perf_bulk(si, counter_ids=[cpu_id, mem_id])
```

### QuerySpec 주요 파라미터

| 파라미터 | 설명 | 권장값 |
|----------|------|--------|
| `intervalId` | 수집 간격(초) | `20` (실시간), `300` (5분 롤업) |
| `maxSample` | 반환 샘플 수 | 실시간: `1`, 추세: `12`(1시간) |
| `startTime` / `endTime` | 쿼리 기간 | 지정하지 않으면 가장 최근 샘플 |
| `instance` | `""` = 집계, `"*"` = 전체 인스턴스, `"0"` = vCPU 0 | 용도에 따라 선택 |

---

## 18. FCD (First Class Disk) 관리 / First Class Disk Management

> Source: [pyvmomi-community-samples/samples/fcd_*.py](https://github.com/vmware/pyvmomi-community-samples/tree/master/samples)

FCD(First Class Disk, vStorage Object)는 VM과 독립적으로 존재하는 가상 디스크입니다.
VADP/CBT 기반 백업 솔루션, Kubernetes PersistentVolume(vSAN CNS), 그리고
독립적인 디스크 스냅샷 관리에 사용됩니다.

FCD (also called vStorage Object) is a virtual disk that exists independently of any VM.
It is the foundation for VADP/CBT backup, Kubernetes PersistentVolumes (vSAN CNS),
and independent disk snapshot workflows.

### FCD 생성 / Create FCD

```python
from pyVmomi import vim

def create_fcd(si, datastore_name, fcd_name, capacity_gb,
               provisioning="thin", storage_policy_name=None,
               keep_after_delete_vm=False):
    """
    FCD(First Class Disk) 생성.
    storage_policy_name: SPBM 정책명 (None이면 기본 정책 사용)
    keep_after_delete_vm: VM 삭제 후에도 디스크 유지 여부
    """
    content = si.RetrieveContent()

    # 데이터스토어 조회
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True)
    datastore = next((ds for ds in container.view if ds.name == datastore_name), None)
    container.Destroy()
    if datastore is None:
        raise Exception("Datastore '%s' not found." % datastore_name)

    # FCD 스펙 구성
    spec = vim.vslm.CreateSpec()
    spec.name = fcd_name
    spec.capacityInMB = capacity_gb * 1024
    if keep_after_delete_vm:
        spec.keepAfterDeleteVm = True

    spec.backingSpec = vim.vslm.CreateSpec.DiskFileBackingSpec()
    spec.backingSpec.provisioningType = provisioning   # thin / thick / eagerZeroedThick
    spec.backingSpec.datastore = datastore

    # 스토리지 정책 연결 (선택)
    if storage_policy_name:
        # SPBM 연결은 pbmhelper 사용 (pyvmomi-community-samples/tools/pbmhelper.py 참고)
        pass

    # 생성 태스크 실행
    storage = content.vStorageObjectManager
    task = storage.CreateDisk_Task(spec)
    wait_for_task(task)
    print("FCD '%s' created (%d GB, %s)." % (fcd_name, capacity_gb, provisioning))
    return task.info.result   # vim.vslm.VStorageObject
```

### FCD 조회 / List and Retrieve FCD

```python
def list_fcds(si, datastore_name):
    """데이터스토어의 모든 FCD 목록 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True)
    datastore = next((ds for ds in container.view if ds.name == datastore_name), None)
    container.Destroy()

    storage = content.vStorageObjectManager
    fcd_ids = storage.ListVStorageObject(datastore)
    results = []
    for fcd_id in fcd_ids:
        vdisk = storage.RetrieveVStorageObject(fcd_id, datastore)
        results.append({
            "id": vdisk.config.id.id,
            "name": vdisk.config.name,
            "capacity_gb": vdisk.config.capacityInMB / 1024,
            "file_path": vdisk.config.backing.filePath,
            "datastore": datastore_name,
        })
    return results

def retrieve_fcd_by_name(si, datastore_name, fcd_name):
    """이름으로 FCD 조회."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True)
    datastore = next((ds for ds in container.view if ds.name == datastore_name), None)
    container.Destroy()

    storage = content.vStorageObjectManager
    fcd_ids = storage.ListVStorageObject(datastore)
    for fcd_id in fcd_ids:
        vdisk = storage.RetrieveVStorageObject(fcd_id, datastore)
        if vdisk.config.name == fcd_name:
            return vdisk
    raise Exception("FCD '%s' not found on datastore '%s'." % (fcd_name, datastore_name))
```

### FCD 스냅샷 / FCD Snapshot Operations

```python
def create_fcd_snapshot(si, datastore_name, fcd_name, snapshot_description):
    """FCD 스냅샷 생성 (VM 스냅샷과 독립적으로 동작)."""
    content = si.RetrieveContent()
    vdisk = retrieve_fcd_by_name(si, datastore_name, fcd_name)
    storage = content.vStorageObjectManager
    task = storage.VStorageObjectCreateSnapshot_Task(
        vdisk.config.id,
        vdisk.config.backing.datastore,
        snapshot_description
    )
    wait_for_task(task)
    print("FCD snapshot '%s' created." % snapshot_description)

def list_fcd_snapshots(si, datastore_name, fcd_name):
    """FCD의 모든 스냅샷 목록 조회."""
    content = si.RetrieveContent()
    vdisk = retrieve_fcd_by_name(si, datastore_name, fcd_name)
    storage = content.vStorageObjectManager
    snap_info = storage.RetrieveSnapshotInfo(
        vdisk.config.id,
        vdisk.config.backing.datastore
    )
    results = []
    for snap in (snap_info.snapshots or []):
        results.append({
            "id": snap.id.id,
            "description": snap.description,
            "create_time": str(snap.createTime),
        })
        print("Name: %s  ID: %s  Created: %s" % (
            snap.description, snap.id.id, snap.createTime))
    return results

def create_fcd_from_snapshot(si, datastore_name, fcd_name, snapshot_id, new_fcd_name):
    """스냅샷에서 새 FCD 생성 (VADP 복구 패턴)."""
    content = si.RetrieveContent()
    vdisk = retrieve_fcd_by_name(si, datastore_name, fcd_name)
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True)
    datastore = next((ds for ds in container.view if ds.name == datastore_name), None)
    container.Destroy()

    snap_ref = vim.vslm.ID(id=snapshot_id)
    spec = vim.vslm.CreateSpec()
    spec.name = new_fcd_name
    spec.backingSpec = vim.vslm.CreateSpec.DiskFileBackingSpec()
    spec.backingSpec.datastore = datastore

    storage = content.vStorageObjectManager
    task = storage.CreateDiskFromSnapshot_Task(
        vdisk.config.id, datastore, snap_ref, new_fcd_name)
    wait_for_task(task)
    print("FCD '%s' created from snapshot." % new_fcd_name)
```

### FCD를 VM에 연결/분리 / Attach and Detach FCD

```python
def attach_fcd_to_vm(si, vm_name, datastore_name, fcd_name):
    """
    기존 FCD를 VM에 연결. 다음 사용 가능한 SCSI 유닛 번호에 자동 배치.
    """
    content = si.RetrieveContent()
    vdisk = retrieve_fcd_by_name(si, datastore_name, fcd_name)

    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True)
    vm = next((v for v in container.view if v.name == vm_name), None)
    container.Destroy()
    if vm is None:
        raise Exception("VM '%s' not found." % vm_name)

    # 사용 가능한 유닛 번호 및 SCSI 컨트롤러 탐색
    unit_number = 0
    controller = None
    for dev in vm.config.hardware.device:
        if hasattr(dev.backing, 'fileName'):
            unit_number = int(dev.unitNumber) + 1
            if unit_number == 7:   # SCSI 컨트롤러 예약 번호
                unit_number += 1
            if unit_number >= 16:
                raise Exception("SCSI unit number limit reached.")
        if isinstance(dev, vim.vm.device.VirtualSCSIController):
            controller = dev
    if controller is None:
        raise Exception("No SCSI controller found on VM '%s'." % vm_name)

    # 디스크 스펙 구성 (FCD의 파일 경로 직접 참조)
    disk_spec = vim.vm.device.VirtualDeviceSpec()
    disk_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.add
    disk_spec.device = vim.vm.device.VirtualDisk()
    disk_spec.device.backing = vim.vm.device.VirtualDisk.FlatVer2BackingInfo()
    disk_spec.device.backing.diskMode = 'persistent'
    disk_spec.device.backing.fileName = vdisk.config.backing.filePath
    disk_spec.device.unitNumber = unit_number
    disk_spec.device.controllerKey = controller.key

    spec = vim.vm.ConfigSpec(deviceChange=[disk_spec])
    task = vm.ReconfigVM_Task(spec=spec)
    wait_for_task(task)
    print("FCD '%s' attached to VM '%s' at unit %d." % (fcd_name, vm_name, unit_number))

def detach_disk_from_vm(si, vm_name, disk_file_path):
    """VM에서 특정 파일 경로의 디스크 분리 (디스크 삭제 없이)."""
    content = si.RetrieveContent()
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True)
    vm = next((v for v in container.view if v.name == vm_name), None)
    container.Destroy()

    for dev in vm.config.hardware.device:
        if (isinstance(dev, vim.vm.device.VirtualDisk) and
                hasattr(dev.backing, 'fileName') and
                dev.backing.fileName == disk_file_path):
            disk_spec = vim.vm.device.VirtualDeviceSpec()
            disk_spec.operation = vim.vm.device.VirtualDeviceSpec.Operation.remove
            disk_spec.device = dev
            # fileOperation 미설정 → 파일 삭제 없이 분리만
            spec = vim.vm.ConfigSpec(deviceChange=[disk_spec])
            task = vm.ReconfigVM_Task(spec=spec)
            wait_for_task(task)
            print("Disk '%s' detached from VM '%s'." % (disk_file_path, vm_name))
            return
    raise Exception("Disk '%s' not found on VM '%s'." % (disk_file_path, vm_name))
```

### FCD 삭제 / Delete FCD

```python
def delete_fcd(si, datastore_name, fcd_name, confirm=False):
    """FCD 삭제. confirm=True 필수 (파괴적 작업)."""
    if not confirm:
        raise Exception("Set confirm=True to delete FCD '%s'." % fcd_name)
    content = si.RetrieveContent()
    vdisk = retrieve_fcd_by_name(si, datastore_name, fcd_name)
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.Datastore], True)
    datastore = next((ds for ds in container.view if ds.name == datastore_name), None)
    container.Destroy()

    storage = content.vStorageObjectManager
    task = storage.DeleteVStorageObject_Task(vdisk.config.id, datastore)
    wait_for_task(task)
    print("FCD '%s' deleted." % fcd_name)
```

### FCD API 핵심 객체 참조

| API | 설명 |
|-----|------|
| `content.vStorageObjectManager` | FCD CRUD 작업의 진입점 |
| `storage.CreateDisk_Task(spec)` | FCD 생성 |
| `storage.ListVStorageObject(datastore)` | 데이터스토어의 FCD ID 목록 |
| `storage.RetrieveVStorageObject(id, ds)` | FCD 상세 정보 조회 |
| `storage.VStorageObjectCreateSnapshot_Task(id, ds, desc)` | FCD 스냅샷 생성 |
| `storage.RetrieveSnapshotInfo(id, ds)` | FCD 스냅샷 목록 |
| `storage.CreateDiskFromSnapshot_Task(id, ds, snap_id, name)` | 스냅샷에서 FCD 복원 |
| `storage.DeleteVStorageObject_Task(id, ds)` | FCD 삭제 |
| `vim.vslm.CreateSpec` | FCD 생성 스펙 |
| `vim.vslm.CreateSpec.DiskFileBackingSpec` | 디스크 파일 백킹 스펙 |

### VADP/CBT 백업과 FCD의 관계

```
[VADP 백업 워크플로]
1. FCD 스냅샷 생성 (storage.VStorageObjectCreateSnapshot_Task)
2. 스냅샷 기반 CBT(Changed Block Tracking) 조회
3. 변경 블록만 전송 (incremental backup)
4. 백업 완료 후 스냅샷 삭제 (storage.DeleteSnapshot_Task)

FCD는 VM 스냅샷 트리와 독립적이므로
VM 파워 상태와 무관하게 백업 스냅샷 생성/삭제 가능.
```

---

## 19. vSAN API 확장 / Extended vSAN API Operations

> Source: [pyvmomi-community-samples/vsan-samples/](https://github.com/vmware/pyvmomi-community-samples/tree/master/vsan-samples)
> vSAN SDK Python 바인딩 필요: `vsanmgmtObjects`, `vsanapiutils`

이 섹션은 기존 섹션 6(vSAN 기본 관리)을 확장하여 고급 vSAN API 패턴을 다룹니다.

This section extends the basic vSAN management (Section 6) with advanced
vSAN API patterns extracted from the official pyvmomi-community-samples.

### vSAN API 연결 설정 / vSAN API Connection Setup

```python
import ssl
import vsanapiutils   # vSAN SDK 유틸리티
import vsanmgmtObjects  # vSAN VMODL 객체 바인딩
from pyVim.connect import SmartConnect, Disconnect
import atexit

def connect_vsan(host, user, password, port=443):
    """
    vCenter에 연결하고 vSAN MO stub 딕셔너리를 반환.
    반환값: (vcServiceInst, vsanMos)
    """
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    si = SmartConnect(host=host, user=user, pwd=password,
                      port=port, sslContext=context)
    atexit.register(Disconnect, si)

    # 최신 vSAN VMODL 버전 자동 탐지
    api_version = vsanapiutils.GetLatestVmodlVersion(host, port)

    # vSAN VC 관리 객체(MO) stub 딕셔너리 획득
    vsan_mos = vsanapiutils.GetVsanVcMos(
        si._stub, context=context, version=api_version)

    return si, vsan_mos

# 주요 vSAN MO 키
# vsan_mos['vsan-cluster-health-system']    → VsanVcClusterHealthSystem
# vsan_mos['vsan-cluster-config-system']    → VsanVcClusterConfigSystem
# vsan_mos['vsan-performance-manager']      → VsanPerformanceManager
# vsan_mos['vsan-space-report-system']      → VsanSpaceReportSystem
# vsan_mos['vsan-disk-management-system']   → VsanDiskManagementSystem
# vsan_mos['cns-volume-manager']            → CnsVolumeManager (CNS)
# vsan_mos['vsan-io-trip-analyzer']         → VsanIoTripAnalyzer
```

### Cloud Native Storage (CNS) — Kubernetes PV 관리

> Source: [vsancnssamples.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/vsan-samples/vsancnssamples.py)
> 요구사항: vSAN CNS API는 `vim.version.version11` 이상의 stub 필요

```python
from pyVmomi import vim

def cns_create_volume(si, vsan_mos, cluster_name, volume_name, capacity_mb=10240):
    """
    vSAN Cloud Native Storage 볼륨 생성.
    Kubernetes PersistentVolume으로 사용되는 블록 볼륨.
    """
    cns_volume_manager = vsan_mos['cns-volume-manager']

    # vSAN 데이터스토어 조회
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vsan_ds = next(
        (ds for ds in cluster.datastore
         if ds.summary.type == 'vsan'),
        None
    )
    if vsan_ds is None:
        raise Exception("No vSAN datastore found for cluster '%s'." % cluster_name)

    # CNS 볼륨 생성 스펙
    create_spec = vim.cns.VolumeCreateSpec()
    create_spec.name = volume_name
    create_spec.volumeType = "BLOCK"
    create_spec.datastores = [vsan_ds]
    create_spec.backingObjectDetails = vim.cns.BlockBackingDetails()
    create_spec.backingObjectDetails.capacityInMb = capacity_mb

    cns_task = cns_volume_manager.Create([create_spec])
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(cns_task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("CNS volume '%s' created. State: %s" % (volume_name, vc_task.info.state))

def cns_query_volumes(si, vsan_mos, volume_names=None):
    """
    CNS 볼륨 쿼리. volume_names=None이면 전체 조회.
    """
    cns_volume_manager = vsan_mos['cns-volume-manager']
    filter_spec = vim.cns.QueryFilter()
    if volume_names:
        filter_spec.names = volume_names
    result = cns_volume_manager.Query(filter_spec)
    volumes = result.volumes if result else []
    for vol in volumes:
        print("Volume: %s  ID: %s  Type: %s" % (
            vol.name, vol.volumeId.id, vol.volumeType))
    return volumes

def cns_delete_volume(si, vsan_mos, volume_id, delete_disk=True):
    """
    CNS 볼륨 삭제.
    delete_disk=True: 실제 디스크 데이터도 함께 삭제
    delete_disk=False: CNS 등록만 해제
    """
    cns_volume_manager = vsan_mos['cns-volume-manager']
    cns_task = cns_volume_manager.Delete([volume_id], deleteDisk=delete_disk)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(cns_task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("CNS volume deleted. State: %s" % vc_task.info.state)

def _find_cluster(content, cluster_name):
    search_index = content.searchIndex
    for dc in content.rootFolder.childEntity:
        cluster = search_index.FindChild(dc.hostFolder, cluster_name)
        if cluster is not None:
            return cluster
    raise Exception("Cluster '%s' not found." % cluster_name)
```

### vSAN 전송 중 암호화 / Data-In-Transit Encryption

> Source: [vsandataintransitencryptionsamples.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/vsan-samples/vsandataintransitencryptionsamples.py)
> 요구사항: vCenter 6.7U3+ / vSphere 7.0 권장

```python
from pyVmomi import vim

def enable_vsan_data_in_transit_encryption(si, vsan_mos, cluster_name,
                                            rekey_interval_minutes=1440):
    """
    vSAN 전송 중 암호화(Data-In-Transit Encryption) 활성화.

    rekey_interval_minutes: 재키잉 간격 (분)
      - 기본값: 1440분 (24시간)
      - 최소: 30분 (프로덕션 릴리즈 기준)
      - 최대: 10080분 (7일)
    """
    vccs = vsan_mos['vsan-cluster-config-system']
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)

    reconfig_spec = vim.vsan.ReconfigSpec()
    reconfig_spec.dataInTransitEncryptionConfig = \
        vim.vsan.DataInTransitEncryptionConfig()
    # True: 활성화, False: 비활성화, 미설정: 현재 상태 유지
    reconfig_spec.dataInTransitEncryptionConfig.enabled = True
    reconfig_spec.dataInTransitEncryptionConfig.rekeyInterval = rekey_interval_minutes

    task = vccs.ReconfigureEx(cluster, reconfig_spec)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("vSAN DIT encryption configured. State: %s" % vc_task.info.state)

def disable_vsan_data_in_transit_encryption(si, vsan_mos, cluster_name):
    """vSAN 전송 중 암호화 비활성화."""
    vccs = vsan_mos['vsan-cluster-config-system']
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)

    reconfig_spec = vim.vsan.ReconfigSpec()
    reconfig_spec.dataInTransitEncryptionConfig = \
        vim.vsan.DataInTransitEncryptionConfig()
    reconfig_spec.dataInTransitEncryptionConfig.enabled = False

    task = vccs.ReconfigureEx(cluster, reconfig_spec)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("vSAN DIT encryption disabled.")
```

### vSAN File Services API

> Source: [vsanfssamples.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/vsan-samples/vsanfssamples.py)

```python
from pyVmomi import vim

def create_vsan_file_share(si, vsan_mos, cluster_name, domain_name,
                            share_name, quota="10G",
                            ip_fqdn_map=None, subnet_mask="255.255.255.0",
                            gateway="", dns_addresses=None):
    """
    vSAN File Services 파일 공유 생성.
    사전 조건: File Service 활성화 및 도메인 구성 완료.
    """
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)

    # 파일 서비스 시스템 stub (vsan-file-service-system)
    vsan_file_svc = vsan_mos.get('vsan-file-service-system')
    if vsan_file_svc is None:
        raise Exception("vSAN File Service MO not available.")

    # 네트워크 퍼미션 설정
    net_permission = vim.vsan.FileShareNetPermission(
        ips='*',                                              # 허용 IP (CIDR 또는 *)
        permissions=vim.vsan.FileShareAccessType.READ_WRITE,  # READ_ONLY / READ_WRITE
        allowRoot=True
    )

    # 파일 공유 구성 스펙
    # vSAN 기본 스토리지 정책 ID: 'aa6d5a82-1c88-45da-85d3-3d74b91a5bad'
    file_share_config = vim.vsan.FileShareConfig(
        name=share_name,
        domainName=domain_name,
        quota=quota,
        permission=[net_permission]
    )

    task = vsan_file_svc.AddFileShare(cluster, file_share_config)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("vSAN File Share '%s' created." % share_name)

def remove_vsan_file_share(si, vsan_mos, cluster_name, share_name):
    """vSAN 파일 공유 삭제."""
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vsan_file_svc = vsan_mos.get('vsan-file-service-system')
    task = vsan_file_svc.RemoveFileShare(cluster, share_name)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("vSAN File Share '%s' removed." % share_name)
```

### vSAN Direct — NVMe 디스크 직접 관리

> Source: [vsandirectsamples.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/vsan-samples/vsandirectsamples.py)
> 요구사항: vSphere 7.0 U1+

```python
from pyVmomi import vim
from pyVim import task as vim_task

def query_vsan_direct_eligible_disks(si, cluster_name):
    """
    vSAN Direct용 사용 가능한 디스크 조회.
    각 호스트별 eligible 상태 디스크 목록 반환.
    """
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)

    host_disks = {}
    for host in cluster.host:
        disks = host.configManager.vsanSystem.QueryDisksForVsan()
        eligible = [d.disk for d in disks if d.state == 'eligible']
        host_disks[host.name] = [d.canonicalName for d in eligible]
        print("Host %s: eligible disks = %s" % (host.name, host_disks[host.name]))
    return host_disks

def claim_vsan_direct_disks(si, vsan_mos, cluster_name):
    """
    vSAN Direct 스토리지로 디스크 클레임.
    creationType='vsandirect': NVMe 등 고성능 디스크를 vSAN Direct로 사용
    creationType='allflash': 올플래시 vSAN 구성
    """
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vdms = vsan_mos['vsan-disk-management-system']

    for host in cluster.host:
        disks = host.configManager.vsanSystem.QueryDisksForVsan()
        eligible = [d.disk for d in disks if d.state == 'eligible']
        if not eligible:
            continue

        spec = vim.vsan.host.DiskMappingCreationSpec()
        spec.host = host
        spec.capacityDisks = [eligible[0]]
        spec.creationType = "vsandirect"  # 또는 "allflash", "hybrid"

        tsk = vdms.InitializeDiskMappings(spec)
        # vSAN 태스크를 vim.Task로 변환
        tsk = vim.Task(tsk._moId, si._stub)
        if vim_task.WaitForTask(tsk) != vim.TaskInfo.State.success:
            raise Exception("Disk claim failed for host %s." % host.name)
        print("vSAN Direct disks claimed for host %s." % host.name)

def query_vsan_direct_storages(si, vsan_mos, cluster_name):
    """클레임된 vSAN Direct 스토리지 현황 조회."""
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vdms = vsan_mos['vsan-disk-management-system']

    result = {}
    for host in cluster.host:
        ret = vdms.QueryVsanManagedDisks(host)
        disks = set()
        for direct_storage in (ret.vSANDirectDisks or []):
            disks.update([d.canonicalName for d in direct_storage.scsiDisks])
        result[host.name] = disks
        print("Host %s: vSAN Direct disks = %s" % (host.name, disks))
    return result
```

### vSAN IO Trip Analyzer 스케줄링

> Source: [vsanIOTripAnalyzerScheduleSamples.py](https://github.com/vmware/pyvmomi-community-samples/blob/master/vsan-samples/vsanIOTripAnalyzerScheduleSamples.py)

```python
import datetime
from pyVmomi import vim

def create_io_trip_analyzer_schedule(si, vsan_mos, cluster_name, vm_name,
                                      start_time, duration_seconds,
                                      interval_seconds, recurrence_name,
                                      end_time=None):
    """
    vSAN IO Trip Analyzer 주기적 실행 스케줄 생성.

    IO Trip Analyzer: VM I/O 경로의 각 컴포넌트(호스트, 네트워크, 디스크)별
    지연시간을 분석하는 vSAN 내장 진단 도구.

    duration_seconds: 각 실행당 진단 시간 (초)
    interval_seconds: 실행 간격 (0이면 1회 실행)
    """
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)

    # VM 조회
    container = content.viewManager.CreateContainerView(
        content.rootFolder, [vim.VirtualMachine], True)
    vm = next((v for v in container.view if v.name == vm_name), None)
    container.Destroy()
    if vm is None:
        raise Exception("VM '%s' not found." % vm_name)

    vsan_iot = vsan_mos.get('vsan-io-trip-analyzer')
    if vsan_iot is None:
        raise Exception("vSAN IO Trip Analyzer MO not available.")

    recurrence_spec = vim.vsan.VsanIOTripAnalyzerRecurrenceSpec()
    recurrence_spec.name = recurrence_name
    recurrence_spec.vm = vm
    recurrence_spec.startTime = start_time          # datetime.datetime (UTC)
    recurrence_spec.duration = duration_seconds
    recurrence_spec.interval = interval_seconds     # 0 = one-time
    if end_time:
        recurrence_spec.endTime = end_time
    recurrence_spec.status = \
        vim.vsan.VsanIOTripAnalyzerRecurrenceStatus.recurrenceEnabled

    task = vsan_iot.CreateRecurrence(cluster, recurrence_spec)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("IO Trip Analyzer schedule '%s' created." % recurrence_name)

def get_io_trip_analyzer_schedules(si, vsan_mos, cluster_name):
    """클러스터의 IO Trip Analyzer 스케줄 목록 조회."""
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vsan_iot = vsan_mos.get('vsan-io-trip-analyzer')

    schedules = vsan_iot.GetRecurrences(cluster)
    for sched in (schedules or []):
        print("Schedule: %s  VM: %s  Interval: %ds  Status: %s" % (
            sched.name,
            sched.vm.name if sched.vm else 'N/A',
            sched.interval,
            sched.status
        ))
    return schedules

def delete_io_trip_analyzer_schedule(si, vsan_mos, cluster_name, recurrence_name):
    """IO Trip Analyzer 스케줄 삭제."""
    content = si.RetrieveContent()
    cluster = _find_cluster(content, cluster_name)
    vsan_iot = vsan_mos.get('vsan-io-trip-analyzer')
    task = vsan_iot.RemoveRecurrence(cluster, recurrence_name)
    vc_task = vsanapiutils.ConvertVsanTaskToVcTask(task, si._stub)
    vsanapiutils.WaitForTasks([vc_task], si)
    print("IO Trip Analyzer schedule '%s' deleted." % recurrence_name)
```

### vSAN API 확장 MO 참조표

| MO 키 | 관리 객체 | 주요 용도 |
|--------|-----------|-----------|
| `vsan-cluster-health-system` | `VsanVcClusterHealthSystem` | 헬스 요약, 그룹별 테스트 |
| `vsan-cluster-config-system` | `VsanVcClusterConfigSystem` | 클러스터 재구성, DIT 암호화 |
| `vsan-performance-manager` | `VsanPerformanceManager` | IOPS/지연/처리량 쿼리 |
| `vsan-space-report-system` | `VsanSpaceReportSystem` | 용량 사용 현황 |
| `vsan-disk-management-system` | `VsanDiskManagementSystem` | 디스크 클레임, Direct 스토리지 |
| `cns-volume-manager` | `CnsVolumeManager` | K8s PV(CNS 볼륨) CRUD |
| `vsan-file-service-system` | `VsanFileServiceSystem` | NFS 파일 공유 관리 |
| `vsan-io-trip-analyzer` | `VsanIoTripAnalyzer` | I/O 경로 진단 스케줄링 |

### vSAN 태스크 변환 패턴 / Task Conversion Pattern

```python
# vSAN API는 자체 태스크 타입을 반환하므로 반드시 VC 태스크로 변환 필요
vsan_task = vsan_mo.SomeOperation(...)
vc_task = vsanapiutils.ConvertVsanTaskToVcTask(vsan_task, si._stub)
vsanapiutils.WaitForTasks([vc_task], si)
print("Result: %s" % vc_task.info.state)
```
