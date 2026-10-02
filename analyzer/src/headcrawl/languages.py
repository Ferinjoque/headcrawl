"""Which files we read, and what each language is called by lizard and tree-sitter."""

from dataclasses import dataclass
from pathlib import PurePosixPath


@dataclass(frozen=True)
class Language:
    name: str
    grammar: str


_BY_EXT: dict[str, Language] = {}


def _add(name: str, grammar: str, *exts: str) -> None:
    for ext in exts:
        _BY_EXT[ext] = Language(name, grammar)


_add("python", "python", ".py")
_add("javascript", "javascript", ".js", ".jsx", ".mjs", ".cjs")
_add("typescript", "typescript", ".ts", ".mts", ".cts")
_add("typescript", "tsx", ".tsx")
_add("go", "go", ".go")
_add("rust", "rust", ".rs")
_add("java", "java", ".java")
_add("kotlin", "kotlin", ".kt", ".kts")
_add("c", "c", ".c", ".h")
_add("cpp", "cpp", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx")
_add("csharp", "csharp", ".cs")
_add("ruby", "ruby", ".rb")
_add("php", "php", ".php")
_add("swift", "swift", ".swift")
_add("scala", "scala", ".scala")
_add("lua", "lua", ".lua")

GRAMMARS = sorted({lang.grammar for lang in _BY_EXT.values()})


def detect(path: str) -> Language | None:
    return _BY_EXT.get(PurePosixPath(path).suffix.lower())


def is_test_path(path: str) -> bool:
    p = PurePosixPath(path.lower())
    if any(part in ("test", "tests", "__tests__", "spec", "specs", "testing") for part in p.parts[:-1]):
        return True
    stem = p.name.split(".")[0]
    return (
        stem.startswith("test_")
        or stem.endswith("_test")
        or p.name.endswith((".test.js", ".test.ts", ".spec.js", ".spec.ts", ".test.tsx", ".spec.tsx"))
        or stem.endswith("test")
        and p.suffix in (".java", ".kt", ".cs", ".scala")
    )
