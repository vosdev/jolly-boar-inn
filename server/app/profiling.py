"""Continuous CPU profiling with Pyroscope, off unless an address is configured."""

import logging

from app.config import APP_VERSION, Settings

log = logging.getLogger(__name__)

SERVICE_NAME = "jolly-boar-inn"


def start(settings: Settings) -> bool:
    """Start the profiler when `pyroscope_server_address` is set; True if it started.

    A failure is logged and swallowed: a profiler must never keep the game from starting.
    """
    if not settings.pyroscope_server_address:
        return False
    try:
        # Imported here so a server without an address never loads the native extension.
        import pyroscope

        pyroscope.configure(
            application_name=SERVICE_NAME,
            server_address=settings.pyroscope_server_address,
            # Only these two tags: nothing that identifies a player, a room or an address.
            tags={"service_name": SERVICE_NAME, "version": APP_VERSION},
            basic_auth_username=settings.pyroscope_basic_auth_user,
            basic_auth_password=settings.pyroscope_basic_auth_password,
            tenant_id=settings.pyroscope_tenant_id,
        )
    except Exception as exc:
        log.warning("profiling not started: %s", exc)
        return False
    log.info("profiling to %s", settings.pyroscope_server_address)
    return True
