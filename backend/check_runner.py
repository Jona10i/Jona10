"""
Background check execution task.
Runs checks on schedule and records metrics.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

from check_executors import get_executor
from models import Alert, Check, Device, Metric
from slack_alerter import send_slack_alert

logger = logging.getLogger(__name__)


class CheckRunner:
    """Runs checks on schedule and updates database."""

    def __init__(self, engine, session_factory):
        self.engine = engine
        self.session_factory = session_factory
        self.running = False

    async def start(self):
        """Start the check runner task."""
        self.running = True
        logger.info("Check runner started")
        await self._run_loop()

    async def stop(self):
        """Stop the check runner task."""
        self.running = False
        logger.info("Check runner stopped")

    async def _run_loop(self):
        """Main loop that executes checks on schedule."""
        while self.running:
            try:
                await self._execute_due_checks()
            except Exception as e:
                logger.error(f"Error in check runner loop: {e}")

            # Sleep before next iteration (check every 10 seconds)
            await asyncio.sleep(10)

    async def _execute_due_checks(self):
        """Find and execute checks that are due."""
        db = self.session_factory()
        try:
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            now = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)

            # Find checks that are enabled and due
            due_checks = (
                db.query(Check)
                .filter(Check.enabled == True)
                .filter((Check.next_due_at == None) | (Check.next_due_at <= now))
                .all()
            )

            for check in due_checks:
                await self._execute_check(db, check, now)

            db.commit()
        finally:
            db.close()

    async def _execute_check(self, db, check: Check, executed_at: datetime):
        """Execute a single check and update database."""
        device = db.query(Device).filter(Device.id == check.device_id).first()
        if not device:
            return

        # Get executor for this check type
        executor = get_executor(
            check.type,
            check.target,
            timeout_ms=check.timeout_ms,
            warn_ms=check.warn_ms,
            crit_ms=check.crit_ms,
        )
        if not executor:
            logger.warning(f"No executor for check type: {check.type}")
            return

        # Execute check
        try:
            result = await executor.execute()
        except Exception as e:
            logger.error(f"Error executing check {check.id}: {e}")
            result_status = "down"
            result_latency = None
        else:
            result_status = result.status
            result_latency = result.latency_ms

        # Update check record
        now_ms = int(executed_at.timestamp() * 1000)
        check.last_checked_at = executed_at
        check.next_due_at = executed_at.replace(microsecond=0) if check.interval else executed_at
        if check.next_due_at:
            from datetime import timedelta
            check.next_due_at = check.next_due_at + timedelta(seconds=check.interval)

        # Track metrics
        check.total_checks += 1
        if result_status == "down":
            check.consecutive_failures += 1
            check.failed_checks += 1
        else:
            check.consecutive_failures = 0

        check.uptime_pct = ((check.total_checks - check.failed_checks) / check.total_checks * 100) if check.total_checks > 0 else 100.0
        check.status = result_status
        check.latency_ms = result_latency

        # Record metric
        metric = Metric(
            check_id=check.id,
            t=executed_at,
            latency_ms=result_latency,
            status=result_status,
        )
        db.add(metric)

        # Handle state transitions and alerting
        await self._handle_status_change(db, device, check, result_status)

        logger.info(f"Check {check.id} ({device.name}/{check.type}) executed: {result_status}")

    async def _handle_status_change(self, db, device: Device, check: Check, new_status: str):
        """Handle status changes and trigger alerts."""
        old_status = check.status

        # Check if we should fire an alert
        if old_status != "down" and new_status == "down":
            # Device went down - fire critical alert
            await self._create_alert(
                db,
                device,
                check,
                "critical",
                f"{device.name} {check.type.upper()} check is DOWN",
            )
            # Send to Slack
            await send_slack_alert(
                rule_name="Check Down",
                device_name=device.name,
                check_type=check.type,
                severity="critical",
                message=f"{device.name} {check.type.upper()} check failed",
                state="firing",
            )

        elif old_status == "down" and new_status != "down":
            # Device recovered
            await self._resolve_alert(db, device, check)
            # Send to Slack
            await send_slack_alert(
                rule_name="Check Recovered",
                device_name=device.name,
                check_type=check.type,
                severity="info",
                message=f"{device.name} {check.type.upper()} recovered",
                state="resolved",
            )

        elif new_status == "degraded" and check.latency_ms and check.latency_ms > check.crit_ms:
            # High latency alert
            await self._create_alert(
                db,
                device,
                check,
                "warn",
                f"{device.name} latency {check.latency_ms:.0f}ms exceeds threshold",
            )
            # Send to Slack
            await send_slack_alert(
                rule_name="High Latency",
                device_name=device.name,
                check_type=check.type,
                severity="warn",
                message=f"{device.name} latency is {check.latency_ms:.0f}ms",
                state="firing",
            )

    async def _create_alert(self, db, device: Device, check: Check, severity: str, message: str):
        """Create an alert in the database."""
        # Check if alert already exists for this check in firing state
        existing = (
            db.query(Alert)
            .filter(Alert.check_id == check.id)
            .filter(Alert.state == "firing")
            .first()
        )
        if existing:
            return  # Don't create duplicate

        import uuid
        alert = Alert(
            id=f"al{uuid.uuid4().hex[:8]}",
            rule_name=f"{device.name} {check.type} check",
            device_id=device.id,
            check_id=check.id,
            severity=severity,
            state="firing",
            message=message,
            channels="slack",
        )
        db.add(alert)

    async def _resolve_alert(self, db, device: Device, check: Check):
        """Resolve any firing alerts for this check."""
        alerts = (
            db.query(Alert)
            .filter(Alert.check_id == check.id)
            .filter(Alert.state == "firing")
            .all()
        )
        for alert in alerts:
            alert.state = "resolved"
            alert.resolved_at = datetime.now(timezone.utc)
