"""Keep query strings out of uvicorn's access log (section 7 of ideas/architecture.md).

uvicorn logs ``'%s - "%s %s HTTP/%s" %d'`` with the full path, query string included,
as the third argument. This filter truncates that argument at the first ``?``.
"""

import logging


class StripQueryString(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5 and isinstance(args[2], str):
            record.args = (*args[:2], args[2].partition("?")[0], *args[3:])
        return True


_FILTER = StripQueryString()


def install() -> None:
    logging.getLogger("uvicorn.access").addFilter(_FILTER)
