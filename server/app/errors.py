"""The one error type HTTP handlers translate into a JSON error response.

``main.py`` registers a handler that renders any ``ApiError`` as
``{"code": ..., "message": ...}`` with its status. Domain modules raise subclasses so
callers can catch a specific failure without inspecting codes.
"""


class ApiError(Exception):
    """A request failed for a reason the client can act on."""

    status: int = 400
    code: str = "bad_request"
    headers: dict[str, str] | None = None

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message
