export const Tile = {
  Rock: 0,
  Wall: 1,
  Floor: 2,
  Corridor: 3,
  Door: 4,
  StairsDown: 5,
  StairsUp: 6,
  Shrine: 7,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

/** Which kind of edge carved a corridor cell. Loop corridors also hold a trap. */
export const Way = { None: 0, Import: 1, Passage: 2, Loop: 3 } as const;
export type Way = (typeof Way)[keyof typeof Way];

export class Grid {
  readonly tiles: Uint8Array;
  /** Index into FloorMap.rooms for floor and wall cells, -1 elsewhere. */
  readonly room: Int16Array;
  readonly way: Uint8Array;

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
    this.room = new Int16Array(width * height).fill(-1);
    this.way = new Uint8Array(width * height);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): Tile {
    return this.inside(x, y) ? (this.tiles[this.idx(x, y)] as Tile) : Tile.Rock;
  }

  set(x: number, y: number, t: Tile): void {
    if (this.inside(x, y)) this.tiles[this.idx(x, y)] = t;
  }

  roomAt(x: number, y: number): number {
    return this.inside(x, y) ? this.room[this.idx(x, y)] : -1;
  }
}

export function walkable(t: Tile): boolean {
  return t !== Tile.Rock && t !== Tile.Wall;
}

export function seeThrough(t: Tile): boolean {
  return t !== Tile.Rock && t !== Tile.Wall;
}
