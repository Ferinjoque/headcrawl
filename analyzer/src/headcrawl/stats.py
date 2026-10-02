"""Code numbers to game numbers.

Raw CCN goes from 1 to a few hundred, so most curves here are sub-linear and
clamped. Tuned by playing, not by theory.
"""

import math

from .metrics import FunctionMetric
from .models import Archetype, LootKind


def clamp(value: float, lo: int, hi: int) -> int:
    return int(max(lo, min(hi, round(value))))


def enemy_hp(f: FunctionMetric) -> int:
    return clamp(3 + 4 * f.ccn**0.6, 4, 80)


def enemy_damage(f: FunctionMetric) -> int:
    return clamp(1 + f.nesting + f.nloc / 60, 1, 12)


def enemy_speed(f: FunctionMetric) -> int:
    return clamp(80 + 10 * f.params, 60, 160)


def enemy_xp(f: FunctionMetric) -> int:
    return clamp(f.ccn + f.nesting + f.params, 1, 200)


def archetype(f: FunctionMetric) -> Archetype:
    if f.ccn >= 15:
        return Archetype.TANGLE
    if f.nesting >= 4:
        return Archetype.NEST
    if f.params >= 5:
        return Archetype.HYDRA
    if f.nloc >= 80:
        return Archetype.WALL
    if f.ccn <= 2 and f.nloc <= 6:
        return Archetype.IMP
    return Archetype.BUG


def threat(f: FunctionMetric) -> float:
    """Ordering key for which functions get to be enemies."""
    return f.ccn * 2 + f.nesting * 3 + f.params + f.nloc / 20


def room_size(loc: int) -> int:
    if loc <= 0:
        return 1
    return clamp(math.log2(loc) - 4, 1, 5)


LOOT_KIND = {
    "TODO": LootKind.POTION,
    "FIXME": LootKind.BLADE,
    "HACK": LootKind.SCROLL,
    "XXX": LootKind.CURSE,
}


def loot_power(tag: str, text: str) -> int:
    base = {"TODO": 4, "FIXME": 2, "HACK": 3, "XXX": 3}[tag]
    return clamp(base + len(text) / 30, 1, 20)


def boss_stats(f: FunctionMetric, churn: int, depth: int, final: bool) -> tuple[int, int, int, int]:
    """hp, damage, speed, xp. Deeper floors and hotter files hit harder."""
    scale = 1 + depth * 0.35 + (0.6 if final else 0)
    hp = clamp((30 + 6 * f.ccn**0.7 + 2 * math.sqrt(churn)) * scale, 20, 9999)
    dmg = clamp((2 + f.nesting + depth * 0.8) * (1.2 if final else 1), 2, 40)
    speed = clamp(90 + 6 * f.params, 70, 180)
    xp = clamp((f.ccn * 4 + churn) * scale, 10, 5000)
    return hp, dmg, speed, xp


_TITLES = [
    (40, "the Ever-Changing"),
    (20, "the Often Rewritten"),
    (10, "the Restless"),
    (4, "the Patched"),
    (0, "the Untouched"),
]


def boss_title(churn: int, final: bool) -> str:
    if final:
        return "Keeper of HEAD"
    for floor, title in _TITLES:
        if churn >= floor:
            return title
    return _TITLES[-1][1]
