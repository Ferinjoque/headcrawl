# Publishing to PyPI

Nothing here happens on its own. This is the checklist for the day you
decide to put `headcrawl` on PyPI.

## What it gets you

Without PyPI, playing your own repo means cloning this one, installing
Node and uv, and running two tools. With it, anyone with
[uv](https://docs.astral.sh/uv/) types one line and gets the dungeon in
their browser:

```
uvx headcrawl play pallets/flask
uvx headcrawl play .          # the repo you're standing in, private ones too
```

The package carries the built game (about 0.4 MB), so `play` needs nothing
else. The full git history is read on their machine, so TODO dates and
churn bosses work, which the in-browser builder can't fully do.

## One-time setup (about ten minutes)

1. Make an account at https://pypi.org/account/register/ and turn on
   two-factor authentication (PyPI requires it to publish).
2. The name `headcrawl` was free on 2026-10-03. Check again at
   https://pypi.org/project/headcrawl/ (a 404 means free).
3. Tell PyPI to trust this repo's workflow instead of a password. While
   logged in: Your account > Publishing > "Add a new pending publisher":
   - PyPI project name: `headcrawl`
   - Owner: `Ferinjoque`
   - Repository name: `headcrawl`
   - Workflow name: `pypi.yml`
   - Environment name: `pypi`
4. On GitHub: repo Settings > Environments > New environment `pypi`.
   Add yourself as a required reviewer, so every publish waits for your
   click; without it anyone with write access could publish.

Trusted publishing works for private repos too; PyPI only checks that the
upload comes from that workflow in that repo.

## Each release

1. Bump `version` in `analyzer/pyproject.toml` (PyPI never accepts the
   same version twice).
2. Commit and push.
3. GitHub > Actions > pypi > Run workflow. It builds the game, bundles it
   into the package, builds the wheel, checks the game is inside, and
   uploads.
4. Try it from anywhere: `uvx headcrawl@latest play pallets/flask`.

## Trying it locally first

```
bash scripts/bundle-game.sh
cd analyzer && uv build --out-dir ../work/wheel
cd /somewhere/else && uvx --from /path/to/work/wheel/headcrawl-*.whl headcrawl play pallets/flask
```
