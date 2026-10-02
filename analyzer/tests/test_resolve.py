from headcrawl.resolve import Resolver, go_module
from headcrawl.syntax import ImportRef

PATHS = [
    "pkg/__init__.py",
    "pkg/core.py",
    "pkg/sub/__init__.py",
    "pkg/sub/deep.py",
    "other/core.py",
    "src/app.ts",
    "src/lib/x.ts",
    "src/lib/index.ts",
    "src/ui/Button.tsx",
    "src/old.js",
    "cmd/main.go",
    "internal/store/db.go",
    "internal/store/db_test.go",
    "crate/src/lib.rs",
    "crate/src/net.rs",
    "crate/src/net/http.rs",
    "crate/src/util/mod.rs",
    "java/com/foo/Bar.java",
    "java/com/foo/Baz.java",
    "c/src/main.c",
    "c/src/util.h",
    "c/include/api.h",
    "rb/lib/thing.rb",
    "rb/lib/thing/part.rb",
    "rb/app.rb",
]
R = Resolver(PATHS, go_module="example.com/m")


def res(importer: str, lang: str, spec: str, level: int = 0, names: tuple[str, ...] = ()) -> list[str]:
    return R.resolve(importer, lang, ImportRef(spec, level, names))


def test_python() -> None:
    assert res("pkg/sub/deep.py", "python", "core", 2) == ["pkg/core.py"]
    assert res("pkg/core.py", "python", "", 1, ("sub",)) == ["pkg/__init__.py", "pkg/sub/__init__.py"]
    assert res("pkg/sub/deep.py", "python", "pkg.core") == ["pkg/core.py"]
    # "core" exists twice; pick the one nearest the importer
    assert res("other/x.py", "python", "core") == ["other/core.py"]
    assert res("pkg/core.py", "python", "os") == []


def test_javascript() -> None:
    assert res("src/app.ts", "typescript", "./lib/x") == ["src/lib/x.ts"]
    assert res("src/app.ts", "typescript", "./lib/x.js") == ["src/lib/x.ts"]
    assert res("src/app.ts", "typescript", "./lib") == ["src/lib/index.ts"]
    assert res("src/lib/x.ts", "typescript", "../ui/Button") == ["src/ui/Button.tsx"]
    assert res("src/app.ts", "typescript", "@/old") == ["src/old.js"]
    assert res("src/app.ts", "javascript", "react") == []


def test_go() -> None:
    assert res("cmd/main.go", "go", "example.com/m/internal/store") == ["internal/store/db.go"]
    assert res("cmd/main.go", "go", "fmt") == []
    assert go_module('module "example.com/m"\n\ngo 1.22\n') == "example.com/m"
    assert go_module(None) is None


def test_rust() -> None:
    assert res("crate/src/lib.rs", "rust", "mod:net") == ["crate/src/net.rs"]
    assert res("crate/src/net.rs", "rust", "mod:http") == ["crate/src/net/http.rs"]
    assert res("crate/src/net/http.rs", "rust", "crate::util::Thing") == ["crate/src/util/mod.rs"]
    assert res("crate/src/net/http.rs", "rust", "super::Conn") == ["crate/src/net.rs"]
    assert res("crate/src/net.rs", "rust", "self::http::get") == ["crate/src/net/http.rs"]
    assert res("crate/src/net.rs", "rust", "std::io") == []


def test_java_c_ruby() -> None:
    assert res("java/com/foo/Baz.java", "java", "com.foo.Bar") == ["java/com/foo/Bar.java"]
    assert res("java/com/foo/Baz.java", "java", "com.foo.Bar.method") == ["java/com/foo/Bar.java"]
    assert res("java/com/foo/Baz.java", "java", "java.util.List") == []
    assert res("c/src/main.c", "c", "util.h") == ["c/src/util.h"]
    assert res("c/src/main.c", "c", "api.h") == ["c/include/api.h"]
    assert res("rb/app.rb", "ruby", "./lib/thing") == ["rb/lib/thing.rb"]
    assert res("rb/app.rb", "ruby", "thing/part") == ["rb/lib/thing/part.rb"]


def test_unknown_language_and_self_import() -> None:
    assert res("x.lua", "lua", "y") == []
    assert res("pkg/core.py", "python", "pkg.core") == []
