"""Per-function numbers from lizard."""

from dataclasses import dataclass

import lizard

# The "nd" extension is what fills in max_nesting_depth. Without it lizard
# reports 0 for every function.
_ANALYZER = lizard.FileAnalyzer(lizard.get_extensions(["nd"]))


@dataclass(frozen=True)
class FunctionMetric:
    name: str
    long_name: str
    ccn: int
    nloc: int
    params: int
    nesting: int
    start_line: int
    end_line: int


@dataclass(frozen=True)
class FileMetric:
    nloc: int
    functions: tuple[FunctionMetric, ...]


def measure(path: str, text: str) -> FileMetric:
    info = _ANALYZER.analyze_source_code(path, text)
    funcs = tuple(
        FunctionMetric(
            name=f.name,
            long_name=f.long_name,
            ccn=max(1, int(f.cyclomatic_complexity)),
            nloc=int(f.nloc),
            params=int(f.parameter_count),
            nesting=max(0, int(getattr(f, "max_nesting_depth", 0) or 0)),
            start_line=int(f.start_line),
            end_line=int(f.end_line),
        )
        for f in info.function_list
    )
    return FileMetric(nloc=int(info.nloc), functions=funcs)
