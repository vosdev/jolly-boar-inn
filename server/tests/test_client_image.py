"""The image builds the client in a stage that holds only ``client/``, so every file the
client imports from outside it has to be copied in by name, or ``pnpm build`` fails there
while the dev server and vitest, which see the whole checkout, stay green."""

import re

from app.config import REPO_ROOT


def test_the_client_stage_copies_every_outside_file_the_client_reads() -> None:
    config = (REPO_ROOT / "client" / "vite.config.ts").read_text(encoding="utf-8")
    allowed = re.search(r"allow: \[(.*?)\]", config, re.S).group(1)
    outside = re.findall(r"'\.\./([^']+)'", allowed)
    assert outside, "vite.config.ts no longer lists what the client reads outside client/"

    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    stage = dockerfile.split("AS client", 1)[1].split("\nFROM ", 1)[0]
    copied = {
        source
        for line in stage.splitlines()
        if line.startswith("COPY ")
        for source in line.split()[1:-1]
    }
    assert [path for path in outside if path not in copied] == []
