# Research notes

Things checked by hand on 2026-10-02, so we don't have to look them up again.

## Prior art

- GitHub Dungeons: gh extension in Go, terminal only. BSP map seeded by latest
  commit SHA. Same commit, same map.
- waking-git: Rust + Bevy, turns code structure into creatures. WIP.
- Neither uses per-function metrics for gameplay or runs in a browser.

## lizard 1.24.0

- `lizard.analyze_file.analyze_source_code(name, src)` gives functions with
  `name, long_name, cyclomatic_complexity, nloc, parameter_count, token_count,
  start_line, end_line`.
- `max_nesting_depth` is 0 unless you load the `nd` extension:

  ```python
  an = lizard.FileAnalyzer(lizard.get_extensions(["nd"]))
  r = an.analyze_source_code("x.py", src)
  ```

  That gave depth 4 for a for/if/while/if function in both Python and JS.
- The `ns` extension gives `max_nested_structures` instead. Not needed.

## tree-sitter-language-pack 1.20.0

- Grammars are not in the wheel. They download on first use into
  `%LOCALAPPDATA%\tree-sitter-language-pack\v1.20.0\libs`. Use `prefetch` /
  `download([...])` during setup, and pin the version.
- `process(source, ProcessConfig(language=..., imports=True, comments=True,
  structure=True))` returns:
  - `imports`: `ImportInfo(source, items, alias, is_wildcard, span)`. For
    Python and TS, `source` is the whole statement text (`from .util import
    helper as h`), so we still parse the module out of it. For Go it is the
    quoted path. `require()` calls in JS are not reported.
  - `comments`: `CommentInfo(text, kind, span, associated_node)`. Strings
    that contain "TODO" are not comments, as expected.
  - `structure`: functions, classes, modules with spans.
  - `metrics`: code_lines, comment_lines, max_depth, error_count.
- `detect_language_from_path(path)` exists.

## git

- This clone works on Git for Windows (`/dev/null` is understood):

  ```
  GIT_TERMINAL_PROMPT=0 GIT_LFS_SKIP_SMUDGE=1 git \
    -c core.hooksPath=/dev/null -c core.symlinks=false \
    -c protocol.file.allow=never -c core.fsmonitor=false \
    clone --quiet --filter=blob:limit=1m --no-recurse-submodules \
    --single-branch --depth 500 <https url> <dir>
  ```
- `git log --numstat` on a partial clone fetches old blobs one by one. Slow.
  `git log --name-only` only needs trees, so use that for churn (count of
  commits touching a file).
- Symlinks: `git ls-files -s`, mode `120000`.

## Versions (latest on 2026-10-02)

Python: lizard 1.24.0, tree-sitter 0.26.0, tree-sitter-language-pack 1.20.0,
pydantic 2.13.5, hypothesis 6.168.3.

npm: rot-js 2.2.1 (ships its own types), vite 8.3.2, typescript 7.0.2,
vitest 5.0.3, fast-check 4.10.2, fflate 0.8.3.

## Local machine

- No `python` on PATH. uv 0.10.4 has CPython 3.12.12. Use `uv run`.
- Node 24.15, npm 11.12. No pnpm.
- Ollama 0.23.2 with `deepseek-r1:8b` and `gemma4`. Prefer gemma4, r1 spends
  tokens thinking.
- gh is logged in.

## ROT.js bits we use

`Display`, `RNG.setSeed`, `FOV.PreciseShadowcasting`, `Path.AStar`,
`Scheduler.Speed`, `Engine` (or our own loop). Tile mode in `Display` for a
tileset later.
