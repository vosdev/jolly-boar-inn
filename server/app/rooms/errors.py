"""The errors ``RoomManager`` raises, each with its HTTP status and wire code."""

from app.errors import ApiError


class RoomNotFound(ApiError):
    status, code = 404, "not_found"


class RoomExpired(ApiError):
    status, code = 410, "expired"


class NotOpen(ApiError):
    status, code = 409, "not_open"


class NameTaken(ApiError):
    status, code = 409, "name_taken"


class RoomFull(ApiError):
    status, code = 409, "room_full"


class BadName(ApiError):
    status, code = 422, "bad_name"


class BadAvatar(ApiError):
    """An ``avatar`` that is not a pet a player can pick (``app/pets.py``)."""

    status, code = 422, "bad_avatar"


class BadCode(ApiError):
    """A requested room code no draw from the word list could give."""

    status, code = 422, "bad_code"


class CodeTaken(ApiError):
    """A requested room code another room already holds."""

    status, code = 409, "code_taken"


class KeyRequired(ApiError):
    """A join to an invite-only room without its key."""

    status, code = 403, "key_required"


class BadKey(ApiError):
    """A join to an invite-only room with a key that is not, or is no longer, its own."""

    status, code = 403, "bad_key"


class RequestsFull(ApiError):
    """``MAX_JOIN_REQUESTS`` are already waiting on this room's admins."""

    status, code = 409, "requests_full"


class RequestDenied(ApiError):
    """An admin turned the join request away."""

    status, code = 403, "request_denied"


class RequestGone(ApiError):
    """A join request that lapsed, was withdrawn, or never existed."""

    status, code = 410, "request_gone"


class BadSettings(ApiError):
    status, code = 422, "bad_settings"


class BadQuestion(ApiError):
    """One of the host's own questions fails the schema or its type's ``check``."""

    status, code = 422, "bad_question"


class BadSession(ApiError):
    """``hello`` carried a session that belongs to nobody in this room."""

    status, code = 401, "bad_session"


class NotAdmin(ApiError):
    """A player sent one of the admin messages. ``code`` is a websocket error code."""

    status, code = 403, "not_admin"


class BadState(ApiError):
    """The message is valid but the room is in no state to act on it."""

    status, code = 409, "bad_state"


class AlreadyAnswered(ApiError):
    status, code = 409, "already_answered"


class Excluded(ApiError):
    """A ``host_only`` question, or an answer from the TV (section 6)."""

    status, code = 403, "excluded"


class BadValue(ApiError):
    status, code = 422, "bad_value"
