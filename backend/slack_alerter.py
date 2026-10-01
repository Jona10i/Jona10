"""
Slack alert sender.
Sends alert notifications to Slack webhooks.
"""

import os
from typing import Optional

import httpx


class SlackAlerter:
    """Send alerts to Slack via webhook."""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.getenv("SLACK_WEBHOOK_URL")

    async def send_alert(
        self,
        rule_name: str,
        device_name: str,
        check_type: str,
        severity: str,
        message: str,
        state: str = "firing",
    ) -> bool:
        """Send alert to Slack."""
        if not self.webhook_url:
            return False

        # Color based on severity
        color_map = {
            "info": "#36a64f",  # Green
            "warn": "#ff9900",  # Orange
            "critical": "#ff0000",  # Red
        }
        color = color_map.get(severity, "#808080")

        # Build Slack message
        payload = {
            "attachments": [
                {
                    "fallback": f"{rule_name}: {device_name} {state}",
                    "color": color,
                    "title": rule_name,
                    "text": message,
                    "fields": [
                        {
                            "title": "Device",
                            "value": device_name,
                            "short": True,
                        },
                        {
                            "title": "Check Type",
                            "value": check_type,
                            "short": True,
                        },
                        {
                            "title": "Severity",
                            "value": severity.upper(),
                            "short": True,
                        },
                        {
                            "title": "State",
                            "value": state,
                            "short": True,
                        },
                    ],
                    "footer": "NetPulse Monitoring",
                    "ts": int(__import__("time").time()),
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=payload, timeout=5.0)
                return response.status_code == 200
        except Exception as e:
            print(f"Error sending Slack alert: {e}")
            return False


async def send_slack_alert(
    rule_name: str,
    device_name: str,
    check_type: str,
    severity: str,
    message: str,
    state: str = "firing",
) -> bool:
    """Convenience function to send alert."""
    alerter = SlackAlerter()
    return await alerter.send_alert(
        rule_name=rule_name,
        device_name=device_name,
        check_type=check_type,
        severity=severity,
        message=message,
        state=state,
    )
