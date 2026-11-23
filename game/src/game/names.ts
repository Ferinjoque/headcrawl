// Game names for things that come from code. `load_payload` is the Payload
// Loader, `coerce_str` the String Coercer, `__init__` the Starter. The real
// identifier stays the thing's name; this is what a player reads on screen.
// Pure and deterministic, so the same function always gets the same name.

/** Verbs a function name often starts with, and who does that verb. */
const AGENTS: Record<string, string> = {
  accept: "Gatekeeper", add: "Adder", append: "Appender", bind: "Binder", cancel: "Canceller",
  clean: "Cleaner", consume: "Eater", conv: "Converter", detect: "Detector", escape: "Escaper",
  flush: "Flusher", insert: "Inserter", kill: "Killer", normalize: "Normalizer", publish: "Herald",
  throw: "Thrower", trim: "Trimmer", try: "Trier", unescape: "Unescaper", unwrap: "Unwrapper", apply: "Applier", assert: "Judge", build: "Builder",
  calc: "Counter", calculate: "Counter", call: "Caller", can: "Judge", check: "Checker",
  choose: "Picker", clear: "Sweeper", clone: "Copier", close: "Closer", coerce: "Coercer",
  compile: "Builder", compute: "Counter", connect: "Linker", construct: "Builder", convert: "Converter",
  copy: "Copier", count: "Counter", create: "Maker", decode: "Decoder", delete: "Remover",
  deserialize: "Unpacker", dispatch: "Dispatcher", dump: "Dumper", emit: "Herald", encode: "Encoder",
  ensure: "Warden", exec: "Runner", execute: "Runner", fetch: "Fetcher", filter: "Sifter",
  find: "Finder", format: "Formatter", gen: "Maker", generate: "Maker", get: "Getter",
  handle: "Handler", has: "Seeker", hide: "Hider", init: "Starter", initialize: "Starter",
  invoke: "Caller", is: "Judge", iter: "Walker", iterate: "Walker", join: "Joiner",
  listen: "Listener", load: "Loader", log: "Scribe", make: "Maker", map: "Mapper",
  match: "Matcher", merge: "Merger", new: "Maker", next: "Stepper", open: "Opener",
  parse: "Parser", peek: "Peeker", pick: "Picker", pop: "Popper", print: "Scribe",
  process: "Processor", push: "Pusher", read: "Reader", register: "Keeper", reject: "Rejecter",
  remove: "Remover", render: "Renderer", reset: "Resetter", resolve: "Resolver", retry: "Retrier",
  run: "Runner", save: "Keeper", select: "Picker", send: "Sender", serialize: "Packer",
  set: "Setter", should: "Judge", show: "Herald", sign: "Signer", sort: "Sorter",
  split: "Splitter", start: "Starter", stop: "Stopper", store: "Keeper", to: "Maker",
  unsign: "Unsigner", update: "Updater", validate: "Validator", verify: "Verifier", wait: "Waiter",
  walk: "Walker", watch: "Watcher", wrap: "Wrapper", write: "Writer",
};

/** Short forms programmers use, in words anyone reads. */
const WORDS: Record<string, string> = {
  fmt: "Format", tty: "Terminal", ws: "Socket", kv: "Store", http2: "Web", cli: "Console",
  args: "Arguments", arg: "Argument", attr: "Attribute", auth: "Login", buf: "Buffer",
  cfg: "Config", conf: "Config", ctx: "Context", cur: "Current", db: "Database",
  dict: "Table", dir: "Folder", dst: "Target", env: "Setting", err: "Error",
  fn: "Function", func: "Function", fs: "File", http: "Web", idx: "Index",
  int: "Number", kwargs: "Options", len: "Length", msg: "Message", num: "Number",
  obj: "Object", opts: "Options", prev: "Previous", req: "Request", res: "Response",
  resp: "Response", src: "Source", str: "String", tmp: "Temp", ts: "Time",
  uri: "Link", url: "Link", val: "Value", vars: "Values",
};

/** Words that say nothing to a player: test scaffolding and plumbing. */
const NOISE = new Set(["test", "tests", "impl", "internal", "private", "inner", "do", "self", "the", "a", "an", "fn"]);

/** Little words that end the useful part of a long name: find_app_by_string is about the app. */
const STOP = new Set([
  "by", "with", "for", "from", "in", "into", "of", "on", "or", "and", "that", "can", "be", "is", "are", "when",
  "if", "does", "doesnt", "not", "no", "should", "after", "before", "during", "without", "at", "as", "then", "it",
  "vs",
]);

const MAX = 24;

/** Two-letter words that are words, not letters. */
const SHORT_WORDS = new Set(["go", "up", "do", "me", "my", "we", "be", "so", "no", "by", "an", "as", "at", "if", "is", "it", "on", "or", "of", "to", "in", "us"]);

function title(word: string): string {
  const w = word.toLowerCase();
  if (WORDS[w]) return WORDS[w];
  // fmt, tty, io, v4: short or vowel-less, so most likely letters to say out loud.
  if ((w.length <= 2 && !SHORT_WORDS.has(w)) || !/[aeiouy]/.test(w)) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "parseBody" -> ["parse", "body"]; "RouteCollector" -> ["route", "collector"]. */
export function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w && !/^\d+$/.test(w) && !NOISE.has(w));
}

/** "Queue Received Queue" -> "Received Queue": a word said twice is said once, the last time. */
function once(parts: string[]): string[] {
  return parts.filter((w, i) => parts.indexOf(w, i + 1) === -1);
}

/** The verb at the front of a name, plural forms too ("loads" -> load). */
function verbOf(word: string | undefined): string | null {
  if (!word) return null;
  if (AGENTS[word]) return word;
  if (word.endsWith("s") && AGENTS[word.slice(0, -1)]) return word.slice(0, -1);
  return null;
}

function fit(parts: string[], tail: string): string {
  let list = [...parts];
  while (list.length && [...list, tail].join(" ").length > MAX) list = list.slice(1);
  return [...list, tail].join(" ").trim();
}

function roman(n: number): string {
  return ["", "I", "II", "III", "IV", "V", "VI"][n] ?? String(n);
}

/** The game name for a function, method, class or file stem. */
export function gameName(identifier: string): string {
  // Ruby and JS tests can be named with a sentence in quotes.
  let raw = identifier.trim().replace(/^(['"`])(.*)\1$/, "$2");
  // A hydra's halves carry primes: parse_args'' is the third of them.
  const primes = (raw.match(/'+$/) ?? [""])[0].length;
  raw = raw.replace(/'+$/, "");
  if (/(^|_)helper\d*$/.test(raw)) return "Helper";
  // Operators (==, ->, +) have no words to go on.
  if (!/[A-Za-z]/.test(raw)) return "the Operator";
  // Anonymous functions are named after their file and line (main@181).
  // They're the small unnamed things around a file: wisps.
  const anon = raw.match(/^(.*)@\d+$/);
  if (anon) {
    const place = words(anon[1]).map(title);
    return place.length ? `${fit(place.slice(-2), "Wisp")}` : "a Wisp";
  }
  // pkg.Class.method, Class::method, a/b: the last part names it, unless
  // that part is only a verb (Foo.__init__, Router::new): then Foo inits.
  const segments = raw.split(/::|[./\\#]/).filter(Boolean);
  let ws = words(segments.at(-1) ?? raw);
  if (segments.length > 1 && ws.length <= 1 && verbOf(ws[0])) ws = [...ws, ...words(segments.at(-2) ?? "").filter((w) => !verbOf(w))];
  if (!ws.length) ws = words(raw);
  // Nothing but scaffolding (a function called test): say it as it is.
  if (!ws.length) ws = raw.split(/[^A-Za-z]+/).filter(Boolean).map((w) => w.toLowerCase()).slice(-2);
  if (!ws.length) return "the Nameless";
  const name = nameFromWords(ws);
  return primes ? `${name} ${roman(primes + 1)}` : name;
}

/** Words up to the first little word, so the head of a long name survives. */
function head(ws: string[]): string[] {
  const cut = ws.findIndex((w) => STOP.has(w));
  return cut > 0 ? ws.slice(0, cut) : ws.filter((w) => !STOP.has(w));
}

function nameFromWords(all: string[]): string {
  // bytes_to_int turns bytes into something: a Bytes Converter.
  const to = all.indexOf("to");
  if (to > 0 && !verbOf(all[0])) {
    const from = head(all.slice(0, to)).map(title);
    return from.length ? fit(from.slice(-2), "Converter") : "the Converter";
  }
  // path_is_valid checks something about the path: a Path Judge.
  const judged = all.findIndex((w, i) => i > 0 && (w === "is" || w === "has"));
  if (judged > 0 && !verbOf(all[0])) return fit(once(head(all.slice(0, judged)).map(title)).slice(-2), "Judge");
  const ws = all[0] === "to" ? all : all.filter((w) => w !== "to");
  // A verb up front (load_payload), or at the end in C style (tsd_init).
  let verb = verbOf(ws[0]);
  let object = ws.slice(1);
  if (!verb && ws.length > 1 && verbOf(ws.at(-1))) {
    verb = verbOf(ws.at(-1));
    object = ws.slice(0, -1);
  }
  if (verb) {
    const agent = AGENTS[verb];
    const obj = once(head(object).map(title));
    if (!obj.length) return `the ${agent}`;
    // AccessDeniedExceptionHandler::Handle is already a handler.
    if (obj.at(-1) === agent) return obj.length === 1 ? `the ${agent}` : fit(obj.slice(0, -1).slice(-2), agent);
    return fit(obj.slice(-2), agent);
  }
  let nouns = once(head(ws).map(title));
  // Only little words (after, into_inner): keep them, they're all there is.
  if (!nouns.length) nouns = once(ws.map(title)).slice(-2);
  if (!nouns.length) return "the Nameless";
  return nouns.length === 1 ? `the ${nouns[0]}` : fit(nouns.slice(0, -1).slice(-2), nouns.at(-1)!);
}

// Names inside log lines carry both forms: the real identifier and its game
// name, between control characters nobody types. The screen picks one; the
// run log always keeps the real one.
const OPEN = "\u0001";
const MID = "\u001f";
const CLOSE = "\u0002";
const TAGGED = /\u0001([^\u001f\u0002]*)\u001f([^\u0002]*)\u0002/g;

export function named(real: string, label: string): string {
  return `${OPEN}${real}${MID}${label}${CLOSE}`;
}

/** A log line with every tagged name as its game name, or as the real one. */
export function showNames(text: string, real: boolean): string {
  return text.replace(TAGGED, (_m, raw: string, label: string) => (real ? raw : label));
}

interface Named {
  name: string;
  boss?: { title: string } | null;
}

/** What a player calls a monster: a boss by its title, the rest by gameName. */
export function monsterLabel(m: Named): string {
  return m.boss ? m.boss.title : gameName(m.name);
}

/** A boss's line, with its own raw name in it tagged so screens can show its title. */
export function bossLine(text: string, real: string, title: string): string {
  return real.length > 2 ? text.split(real).join(named(real, title)) : text;
}

/** A monster's name for a log line. */
export function nameOf(m: Named): string {
  return named(m.name, monsterLabel(m));
}

/** Weapons are things you hold; what kind follows how they fight. */
const WEAPON_NOUN: Record<string, string> = {
  pierce: "Spear", cleave: "Axe", async: "Twin Knives", steady: "Mace", unsafe: "Dagger",
  heavy: "Hammer", arc: "Sickle", loose: "Flail", plain: "Sword",
};

interface GearLike {
  slot: "weapon" | "armor";
  name: string;
  trait: string;
  label?: string;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** The game name for a piece of gear: the Payload Loader's Spear, Signer Mail. */
export function gearLabel(g: GearLike): string {
  if (g.label) return g.label;
  if (/^FIXME\b/.test(g.name)) return g.slot === "weapon" ? `Patched ${WEAPON_NOUN[g.trait] ?? "Sword"}` : "Patched Mail";
  if (g.slot === "armor") {
    const stem = g.name.replace(/\s+suite$/, "").replace(/\.[A-Za-z0-9]+$/, "").replace(/^@types\//, "");
    return `${gameName(stem).replace(/^the /, "")} ${/^@types\//.test(g.name) ? "Plate" : "Mail"}`;
  }
  return `${possessive(gameName(g.name))} ${WEAPON_NOUN[g.trait] ?? "Sword"}`;
}

/** A beaten boss's own weapon, named after its title. */
export function bossWeaponLabel(title: string, trait: string): string {
  return `${possessive(title)} ${WEAPON_NOUN[trait] ?? "Sword"}`;
}

/** Gear's name for a log line. */
export function gearName(g: GearLike): string {
  return named(g.name, gearLabel(g));
}

/** What a function's name says it does, for the learn line: "it loads a payload". */
export function nameSays(identifier: string): string | null {
  const segments = identifier.replace(/'+$/, "").split(/::|[./\#]/).filter(Boolean);
  const ws = words(segments.at(-1) ?? identifier);
  const verb = verbOf(ws[0]);
  if (!verb || ws.length < 2) return null;
  const object = head(ws.slice(1)).join(" ");
  return object ? `it ${says(verb)} ${object}` : null;
}

/** Plain present tense for the verbs a name starts with. */
const SAYS: Record<string, string> = {
  iter: "goes through", iterate: "goes through", walk: "goes through", init: "sets up", initialize: "sets up",
  gen: "makes", generate: "makes", new: "makes", make: "makes", create: "makes", calc: "works out",
  calculate: "works out", compute: "works out", conv: "converts", exec: "runs", is: "checks if it is",
  has: "checks if it has", can: "checks if it can", should: "checks it should", to: "turns into",
};

function says(verb: string): string {
  if (SAYS[verb]) return SAYS[verb];
  if (/(s|sh|ch|x|z)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}
