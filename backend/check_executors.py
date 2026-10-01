"""
Check executors for real monitoring.
HTTP, ICMP ping, TCP port checks.
"""

import asyncio
import socket
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx


@dataclass
class CheckResult:
    """Result of a single check execution."""
    status: str  # "up", "degraded", "down"
    latency_ms: Optional[float]  # None if down
    error: Optional[str] = None
    checked_at: float = None

    def __post_init__(self):
        if self.checked_at is None:
            self.checked_at = datetime.now(timezone.utc).timestamp() * 1000


class CheckExecutor:
    """Base class for check executors."""

    async def execute(self) -> CheckResult:
        raise NotImplementedError


class HTTPCheck(CheckExecutor):
    """HTTP/HTTPS check executor."""

    def __init__(self, url: str, timeout_ms: int = 5000, warn_ms: int = 200, crit_ms: int = 600):
        self.url = url
        self.timeout_sec = timeout_ms / 1000.0
        self.warn_ms = warn_ms
        self.crit_ms = crit_ms

    async def execute(self) -> CheckResult:
        """Execute HTTP check."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                start = datetime.now(timezone.utc)
                response = await client.get(self.url, follow_redirects=True)
                elapsed_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000

                # Determine status based on response code and latency
                if response.status_code >= 400:
                    return CheckResult(
                        status="down",
                        latency_ms=elapsed_ms,
                        error=f"HTTP {response.status_code}",
                    )
                elif elapsed_ms > self.crit_ms:
                    return CheckResult(
                        status="degraded",
                        latency_ms=elapsed_ms,
                        error=f"Latency {elapsed_ms:.0f}ms exceeds critical {self.crit_ms}ms",
                    )
                elif elapsed_ms > self.warn_ms:
                    return CheckResult(
                        status="degraded",
                        latency_ms=elapsed_ms,
                        error=f"Latency {elapsed_ms:.0f}ms exceeds warning {self.warn_ms}ms",
                    )
                else:
                    return CheckResult(
                        status="up",
                        latency_ms=elapsed_ms,
                    )

        except asyncio.TimeoutError:
            return CheckResult(
                status="down",
                latency_ms=self.timeout_sec * 1000,
                error="Connection timeout",
            )
        except httpx.RequestError as e:
            return CheckResult(
                status="down",
                latency_ms=None,
                error=str(e),
            )


class ICMPCheck(CheckExecutor):
    """ICMP ping check executor."""

    def __init__(self, host: str, timeout_ms: int = 5000, warn_ms: int = 100, crit_ms: int = 300):
        self.host = host
        self.timeout_sec = timeout_ms / 1000.0
        self.warn_ms = warn_ms
        self.crit_ms = crit_ms

    async def execute(self) -> CheckResult:
        """Execute ICMP ping check."""
        try:
            # Use ping command (cross-platform via subprocess)
            cmd = ["ping", "-c", "1", "-W", str(int(self.timeout_sec)), self.host]
            if not self._is_linux():
                cmd = ["ping", "-n", "1", "-w", str(int(self.timeout_sec * 1000)), self.host]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout_sec + 2)

            if process.returncode != 0:
                return CheckResult(
                    status="down",
                    latency_ms=None,
                    error="Ping failed",
                )

            # Parse latency from output
            latency_ms = self._parse_latency(stdout.decode())
            if latency_ms is None:
                return CheckResult(status="up", latency_ms=0)

            if latency_ms > self.crit_ms:
                return CheckResult(status="degraded", latency_ms=latency_ms)
            elif latency_ms > self.warn_ms:
                return CheckResult(status="degraded", latency_ms=latency_ms)
            else:
                return CheckResult(status="up", latency_ms=latency_ms)

        except asyncio.TimeoutError:
            return CheckResult(
                status="down",
                latency_ms=None,
                error="Ping timeout",
            )
        except Exception as e:
            return CheckResult(
                status="down",
                latency_ms=None,
                error=str(e),
            )

    def _parse_latency(self, output: str) -> Optional[float]:
        """Extract latency from ping output."""
        # Linux: "time=45.2 ms"
        # Windows: "time=45ms"
        for line in output.split("\n"):
            if "time=" in line:
                parts = line.split("time=")
                if len(parts) > 1:
                    val = parts[1].split()[0].replace("ms", "")
                    try:
                        return float(val)
                    except ValueError:
                        pass
        return None

    def _is_linux(self) -> bool:
        """Check if running on Linux."""
        import sys
        return sys.platform.startswith("linux")


class TCPPortCheck(CheckExecutor):
    """TCP port connectivity check."""

    def __init__(self, host: str, port: int, timeout_ms: int = 5000, warn_ms: int = 100, crit_ms: int = 300):
        self.host = host
        self.port = port
        self.timeout_sec = timeout_ms / 1000.0
        self.warn_ms = warn_ms
        self.crit_ms = crit_ms

    async def execute(self) -> CheckResult:
        """Execute TCP port check."""
        try:
            start = datetime.now(timezone.utc)

            try:
                await asyncio.wait_for(
                    asyncio.open_connection(self.host, self.port),
                    timeout=self.timeout_sec,
                )
            except asyncio.TimeoutError:
                return CheckResult(
                    status="down",
                    latency_ms=self.timeout_sec * 1000,
                    error="Connection timeout",
                )

            elapsed_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000

            if elapsed_ms > self.crit_ms:
                return CheckResult(status="degraded", latency_ms=elapsed_ms)
            elif elapsed_ms > self.warn_ms:
                return CheckResult(status="degraded", latency_ms=elapsed_ms)
            else:
                return CheckResult(status="up", latency_ms=elapsed_ms)

        except Exception as e:
            return CheckResult(
                status="down",
                latency_ms=None,
                error=str(e),
            )


def get_executor(check_type: str, target: str, **kwargs) -> Optional[CheckExecutor]:
    """Factory function to create check executor by type."""
    check_type = check_type.lower()

    if check_type == "http":
        return HTTPCheck(url=target, **kwargs)
    elif check_type == "ping":
        return ICMPCheck(host=target, **kwargs)
    elif check_type == "port":
        # Parse host:port from target
        parts = target.rsplit(":", 1)
        host = parts[0]
        port = int(parts[1]) if len(parts) > 1 else 80
        return TCPPortCheck(host=host, port=port, **kwargs)
    elif check_type == "tcp":
        # Same as port
        parts = target.rsplit(":", 1)
        host = parts[0]
        port = int(parts[1]) if len(parts) > 1 else 80
        return TCPPortCheck(host=host, port=port, **kwargs)

    return None
