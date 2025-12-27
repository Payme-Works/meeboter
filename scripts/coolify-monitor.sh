#!/bin/bash
# Coolify Performance Monitor Script
# Usage: ./coolify-monitor.sh [duration_seconds]

DURATION=${1:-60}
INTERVAL=2
LOGFILE="/tmp/coolify-monitor-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "$1" | tee -a "$LOGFILE"; }
header() { log "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"; log "${BLUE}  $1${NC}"; log "${BLUE}═══════════════════════════════════════════════════════════════${NC}"; }

# Trap for clean exit
trap 'log "\n${YELLOW}Monitoring stopped. Log saved to: $LOGFILE${NC}"; exit 0' INT TERM

header "COOLIFY PERFORMANCE MONITOR"
log "Duration: ${DURATION}s | Interval: ${INTERVAL}s | Started: $(date)"
log "Log file: $LOGFILE"

# Initial system snapshot
header "SYSTEM SNAPSHOT"

log "\n${GREEN}[PHP-FPM Config]${NC}"
php-fpm -tt 2>&1 | grep -E "pm\." | head -10 || echo "Cannot read PHP-FPM config"

log "\n${GREEN}[PHP-FPM Workers]${NC}"
ps aux | grep -E "php-fpm" | grep -v grep

log "\n${GREEN}[Memory Info]${NC}"
free -h 2>/dev/null || cat /proc/meminfo | head -5

log "\n${GREEN}[CPU Info]${NC}"
nproc && cat /proc/loadavg

log "\n${GREEN}[Disk I/O]${NC}"
df -h / 2>/dev/null | tail -1

log "\n${GREEN}[Network Connections]${NC}"
ss -s 2>/dev/null || netstat -s 2>/dev/null | head -10

log "\n${GREEN}[PHP-FPM Status]${NC}"
curl -s "http://127.0.0.1:9000/status?full" 2>/dev/null || curl -s "http://127.0.0.1:8080/status" 2>/dev/null || echo "FPM status not available"

# Monitoring loop
header "LIVE MONITORING (${DURATION}s)"
log "Timestamp | Workers | Active | CPU% | Mem% | LoadAvg | Connections"
log "----------|---------|--------|------|------|---------|------------"

START_TIME=$(date +%s)
ALERTS=""

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    [ $ELAPSED -ge $DURATION ] && break

    TIMESTAMP=$(date +%H:%M:%S)

    # PHP-FPM workers
    WORKERS=$(ps aux | grep -c "[p]hp-fpm: pool")
    ACTIVE=$(ps aux | grep "[p]hp-fpm: pool" | grep -v idle | wc -l)

    # CPU and Memory
    CPU=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 || echo "N/A")
    MEM=$(free 2>/dev/null | grep Mem | awk '{printf "%.1f", $3/$2 * 100}' || echo "N/A")

    # Load average
    LOAD=$(cat /proc/loadavg | awk '{print $1}')

    # Active connections
    CONNS=$(ss -s 2>/dev/null | grep "estab" | awk '{print $4}' | tr -d ',' || echo "N/A")

    # Log line
    log "$TIMESTAMP | $WORKERS | $ACTIVE | $CPU | $MEM% | $LOAD | $CONNS"

    # Alert conditions
    [ "$WORKERS" -eq "$ACTIVE" ] && [ "$WORKERS" -gt 0 ] && ALERTS="${ALERTS}${TIMESTAMP}: All workers busy (${WORKERS}/${WORKERS})\n"
    [ "$(echo "$LOAD > 10" | bc 2>/dev/null)" = "1" ] && ALERTS="${ALERTS}${TIMESTAMP}: High load average (${LOAD})\n"
    [ "$(echo "$MEM > 90" | bc 2>/dev/null)" = "1" ] && ALERTS="${ALERTS}${TIMESTAMP}: High memory usage (${MEM}%)\n"

    sleep $INTERVAL
done

# Final report
header "FINAL REPORT"

log "\n${GREEN}[PHP-FPM Workers After Test]${NC}"
ps aux | grep -E "php-fpm" | grep -v grep

log "\n${GREEN}[PHP-FPM Status After Test]${NC}"
curl -s "http://127.0.0.1:9000/status?full" 2>/dev/null || curl -s "http://127.0.0.1:8080/status" 2>/dev/null || echo "FPM status not available"

log "\n${GREEN}[Recent Error Logs]${NC}"
tail -20 /var/www/html/storage/logs/laravel.log 2>/dev/null | grep -iE "error|exception|timeout|failed" | tail -10 || echo "No recent errors"

log "\n${GREEN}[Slow Queries/Requests]${NC}"
tail -50 /var/www/html/storage/logs/laravel.log 2>/dev/null | grep -iE "slow|took [0-9]+s" | tail -5 || echo "No slow queries logged"

if [ -n "$ALERTS" ]; then
    log "\n${RED}[ALERTS DETECTED]${NC}"
    echo -e "$ALERTS"
else
    log "\n${GREEN}[NO ALERTS]${NC}"
fi

log "\n${GREEN}[Summary]${NC}"
log "Monitoring completed. Duration: ${DURATION}s"
log "Log saved to: $LOGFILE"

# Quick recommendations
header "RECOMMENDATIONS"
FINAL_WORKERS=$(ps aux | grep -c "[p]hp-fpm: pool")
if [ "$FINAL_WORKERS" -lt 5 ]; then
    log "${YELLOW}⚠ Low worker count ($FINAL_WORKERS). Consider increasing PHP_FPM_PM_START_SERVERS${NC}"
fi

FINAL_LOAD=$(cat /proc/loadavg | awk '{print $1}')
if [ "$(echo "$FINAL_LOAD > 5" | bc 2>/dev/null)" = "1" ]; then
    log "${YELLOW}⚠ High load average ($FINAL_LOAD). Check for CPU-intensive processes${NC}"
fi

log "\n${GREEN}Done!${NC}"
