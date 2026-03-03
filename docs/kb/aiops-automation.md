# VMware AIOps & Automation — Knowledge Base

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
