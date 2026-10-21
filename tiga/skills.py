"""Bot skills: one SKILL.md per bot, editable from the UI. Only existing skills can be read or written."""
from pathlib import Path

MAX_SKILL_CHARS = 20000


class Skills:
    def __init__(self, directory: str):
        self.dir = Path(directory)

    def names(self) -> list[str]:
        return sorted(p.parent.name for p in self.dir.glob("*/SKILL.md"))

    def _path(self, name: str) -> Path:
        if name not in self.names():
            raise KeyError(f"no skill named {name}")
        return self.dir / name / "SKILL.md"

    def read(self, name: str) -> str:
        return self._path(name).read_text(encoding="utf-8")

    def write(self, name: str, text: str) -> None:
        path = self._path(name)
        if len(text) > MAX_SKILL_CHARS:
            raise ValueError(f"Skills are limited to {MAX_SKILL_CHARS} characters")
        path.write_text(text, encoding="utf-8")
