#!/bin/bash
#=============================================================================
# vSphere Certificate Expiration Monitoring Script
# Target: VCSA 7.0 + ESXi 7.0
# Risk Level: SAFE (read-only, no changes made)
# Usage: SSH to VCSA as root, then run: bash check-certificate-expiry.sh
#=============================================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
WARN_DAYS=${1:-30}       # Default: warn if expiring within 30 days
VECS_CLI="/usr/lib/vmware-vmafd/bin/vecs-cli"
NOW_EPOCH=$(date +%s)
WARN_EPOCH=$((NOW_EPOCH + WARN_DAYS * 86400))

# ── Color Codes ────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# ── Counters ───────────────────────────────────────────────────────────────
TOTAL=0
EXPIRED=0
WARNING=0
HEALTHY=0

#=============================================================================
# Functions
#=============================================================================

print_header() {
    echo ""
    echo "============================================================================="
    echo " vSphere Certificate Expiration Report"
    echo " Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo " Hostname:  $(hostname)"
    echo " Warning Threshold: ${WARN_DAYS} days"
    echo "============================================================================="
}

check_status() {
    local expiry_epoch=$1
    if [ "$expiry_epoch" -lt "$NOW_EPOCH" ]; then
        echo "EXPIRED"
    elif [ "$expiry_epoch" -lt "$WARN_EPOCH" ]; then
        echo "WARNING"
    else
        echo "OK"
    fi
}

print_status() {
    local status=$1
    case $status in
        EXPIRED) echo -e "${RED}[EXPIRED]${NC}" ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC}" ;;
        OK)      echo -e "${GREEN}[OK]${NC}" ;;
    esac
}

days_remaining() {
    local expiry_epoch=$1
    local diff=$(( (expiry_epoch - NOW_EPOCH) / 86400 ))
    echo "$diff"
}

#=============================================================================
# 1. VECS Store Certificates (Machine SSL, Solution Users, etc.)
#=============================================================================

check_vecs_certs() {
    echo ""
    echo "─────────────────────────────────────────────────────────────────────────────"
    echo " [1/3] VECS Store Certificates"
    echo "─────────────────────────────────────────────────────────────────────────────"

    if [ ! -x "$VECS_CLI" ]; then
        echo "  ERROR: vecs-cli not found at $VECS_CLI"
        return 1
    fi

    local stores
    stores=$($VECS_CLI store list 2>/dev/null)

    for store in $stores; do
        echo ""
        echo "  Store: $store"
        echo "  ────────────────────────────────────"

        local aliases
        aliases=$($VECS_CLI entry list --store "$store" 2>/dev/null | \
                  grep "Alias" | awk -F: '{print $2}' | xargs)

        if [ -z "$aliases" ]; then
            echo "    (empty store)"
            continue
        fi

        for alias in $aliases; do
            local cert_pem
            cert_pem=$($VECS_CLI entry getcert --store "$store" --alias "$alias" 2>/dev/null) || continue

            local not_after
            not_after=$(echo "$cert_pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2) || continue

            if [ -z "$not_after" ]; then
                continue
            fi

            local expiry_epoch
            expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null) || continue

            local status
            status=$(check_status "$expiry_epoch")
            local remaining
            remaining=$(days_remaining "$expiry_epoch")

            TOTAL=$((TOTAL + 1))
            case $status in
                EXPIRED) EXPIRED=$((EXPIRED + 1)) ;;
                WARNING) WARNING=$((WARNING + 1)) ;;
                OK)      HEALTHY=$((HEALTHY + 1)) ;;
            esac

            printf "    %-30s  Expires: %-25s  %3s days  %s\n" \
                "$alias" "$not_after" "$remaining" "$(print_status "$status")"
        done
    done
}

#=============================================================================
# 2. STS Signing Certificate (SSO Token Signing)
#=============================================================================

check_sts_cert() {
    echo ""
    echo "─────────────────────────────────────────────────────────────────────────────"
    echo " [2/3] STS Signing Certificate"
    echo "─────────────────────────────────────────────────────────────────────────────"

    local sts_cert
    sts_cert=$($VECS_CLI entry getcert \
        --store STS_INTERNAL_SSL_CERT --alias __MACHINE_CERT 2>/dev/null) || {
        echo "  Could not retrieve STS certificate (store may not exist)"
        return 0
    }

    local not_after subject
    not_after=$(echo "$sts_cert" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    subject=$(echo "$sts_cert" | openssl x509 -noout -subject 2>/dev/null | sed 's/subject=//')

    if [ -z "$not_after" ]; then
        echo "  Could not parse STS certificate"
        return 0
    fi

    local expiry_epoch
    expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null)
    local status
    status=$(check_status "$expiry_epoch")
    local remaining
    remaining=$(days_remaining "$expiry_epoch")

    TOTAL=$((TOTAL + 1))
    case $status in
        EXPIRED) EXPIRED=$((EXPIRED + 1)) ;;
        WARNING) WARNING=$((WARNING + 1)) ;;
        OK)      HEALTHY=$((HEALTHY + 1)) ;;
    esac

    echo ""
    printf "    Subject:  %s\n" "$subject"
    printf "    Expires:  %-25s  %3s days  %s\n" "$not_after" "$remaining" "$(print_status "$status")"
}

#=============================================================================
# 3. VMCA Root Certificate
#=============================================================================

check_vmca_root() {
    echo ""
    echo "─────────────────────────────────────────────────────────────────────────────"
    echo " [3/3] VMCA Root Certificate"
    echo "─────────────────────────────────────────────────────────────────────────────"

    local root_cert_path="/etc/vmware-vpx/docmanager/


/vpxd-certificate.pem"
    local alt_path="/var/lib/vmware/vmca/root.cer"

    local cert_file=""
    if [ -f "$alt_path" ]; then
        cert_file="$alt_path"
    fi

    if [ -z "$cert_file" ]; then
        # Fallback: extract from VECS TRUSTED_ROOTS store
        local root_alias
        root_alias=$($VECS_CLI entry list --store TRUSTED_ROOTS 2>/dev/null | \
                     grep "Alias" | head -1 | awk -F: '{print $2}' | xargs)

        if [ -n "$root_alias" ]; then
            local root_pem
            root_pem=$($VECS_CLI entry getcert --store TRUSTED_ROOTS --alias "$root_alias" 2>/dev/null)
            local not_after subject
            not_after=$(echo "$root_pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
            subject=$(echo "$root_pem" | openssl x509 -noout -subject 2>/dev/null | sed 's/subject=//')

            if [ -n "$not_after" ]; then
                local expiry_epoch
                expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null)
                local status
                status=$(check_status "$expiry_epoch")
                local remaining
                remaining=$(days_remaining "$expiry_epoch")

                TOTAL=$((TOTAL + 1))
                case $status in
                    EXPIRED) EXPIRED=$((EXPIRED + 1)) ;;
                    WARNING) WARNING=$((WARNING + 1)) ;;
                    OK)      HEALTHY=$((HEALTHY + 1)) ;;
                esac

                echo ""
                printf "    Subject:  %s\n" "$subject"
                printf "    Expires:  %-25s  %3s days  %s\n" \
                    "$not_after" "$remaining" "$(print_status "$status")"
                return 0
            fi
        fi
        echo "  Could not locate VMCA root certificate"
        return 0
    fi

    local not_after subject
    not_after=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
    subject=$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null | sed 's/subject=//')

    local expiry_epoch
    expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null)
    local status
    status=$(check_status "$expiry_epoch")
    local remaining
    remaining=$(days_remaining "$expiry_epoch")

    TOTAL=$((TOTAL + 1))
    case $status in
        EXPIRED) EXPIRED=$((EXPIRED + 1)) ;;
        WARNING) WARNING=$((WARNING + 1)) ;;
        OK)      HEALTHY=$((HEALTHY + 1)) ;;
    esac

    echo ""
    printf "    File:     %s\n" "$cert_file"
    printf "    Subject:  %s\n" "$subject"
    printf "    Expires:  %-25s  %3s days  %s\n" \
        "$not_after" "$remaining" "$(print_status "$status")"
}

#=============================================================================
# Summary
#=============================================================================

print_summary() {
    echo ""
    echo "============================================================================="
    echo " Summary"
    echo "============================================================================="
    echo ""
    printf "  Total Certificates Checked:  %d\n" "$TOTAL"
    echo ""
    printf "  ${GREEN}Healthy:  %d${NC}\n" "$HEALTHY"
    printf "  ${YELLOW}Warning:  %d${NC}  (expiring within %d days)\n" "$WARNING" "$WARN_DAYS"
    printf "  ${RED}Expired:  %d${NC}\n" "$EXPIRED"
    echo ""

    if [ "$EXPIRED" -gt 0 ]; then
        echo -e "  ${RED}ACTION REQUIRED: Expired certificates detected.${NC}"
        echo "  Run: /usr/lib/vmware-vmca/bin/certificate-manager"
        echo "  Ref: KB 76719, KB 79248"
    elif [ "$WARNING" -gt 0 ]; then
        echo -e "  ${YELLOW}ATTENTION: Certificates expiring soon. Plan renewal.${NC}"
        echo "  Ref: KB 79248"
    else
        echo -e "  ${GREEN}All certificates are healthy.${NC}"
    fi

    echo ""
    echo "============================================================================="
}

#=============================================================================
# Main
#=============================================================================

main() {
    print_header
    check_vecs_certs
    check_sts_cert
    check_vmca_root
    print_summary
}

main
