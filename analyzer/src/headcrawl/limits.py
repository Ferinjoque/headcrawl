"""Caps that keep a dungeon playable and an analysis cheap."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Limits:
    max_floors: int = 8
    max_rooms_per_floor: int = 18
    max_enemies_per_room: int = 6
    max_loot_per_room: int = 4
    max_extra_edges_ratio: float = 0.5
    max_file_bytes: int = 512 * 1024
    max_line_length: int = 400
    max_files: int = 20_000
    max_clone_bytes: int = 400 * 1024 * 1024
    clone_timeout_s: int = 180
    clone_depth: int = 500
    churn_commits: int = 500


DEFAULT = Limits()
