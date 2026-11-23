import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gameName, gearLabel, named, nameOf, nameSays, showNames, words } from "../src/game/names";

describe("game names", () => {
  it("turn a verb and its object into who does it", () => {
    expect(gameName("load_payload")).toBe("Payload Loader");
    expect(gameName("coerce_str")).toBe("String Coercer");
    expect(gameName("make_signer")).toBe("Signer Maker");
    expect(gameName("iter_unsigners")).toBe("Unsigners Walker");
    expect(gameName("parseBody")).toBe("Body Parser");
  });

  it("read plural verbs and lone verbs as one doer", () => {
    expect(gameName("loads")).toBe("the Loader");
    expect(gameName("dumps")).toBe("the Dumper");
    expect(gameName("__init__")).toBe("the Starter");
  });

  it("drop test scaffolding and leading underscores", () => {
    expect(gameName("_loads_unsafe_impl")).toBe("Unsafe Loader");
    expect(gameName("test_loads_unsafe.unsign")).toBe("Unsafe Unsigner");
    expect(gameName("test_signer")).toBe("the Signer");
  });

  it("use the class when the method is only a verb", () => {
    expect(gameName("RouteCollector::__construct")).toBe("Route Collector Builder");
    expect(gameName("Router.new")).toBe("Router Maker");
  });

  it("name plain nouns and long names within the limit", () => {
    expect(gameName("BodyParsingMiddleware")).toBe("Body Parsing Middleware");
    expect(gameName("RequestExceptionProcessorBehavior::Handle")).toBe("Behavior Handler");
  });

  it("number a hydra's halves and call helpers helpers", () => {
    expect(gameName("load_payload'")).toBe("Payload Loader II");
    expect(gameName("load_payload''")).toBe("Payload Loader III");
    expect(gameName("_run_jq_tests_helper12")).toBe("Helper");
  });

  it("splits camel case, snake case and acronyms", () => {
    expect(words("HTTPServerError")).toEqual(["http", "server", "error"]);
    expect(words("__init__")).toEqual(["init"]);
  });

  it("always gives a short, non-empty name with no code punctuation", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const n = gameName(s);
        expect(n.length).toBeGreaterThan(0);
        expect(n.length).toBeLessThanOrEqual(40);
        expect(n).not.toMatch(/[_:.()/\\]/);
      }),
    );
  });
});

describe("names in log lines", () => {
  it("carry both names and show the one asked for", () => {
    const line = `You hit ${named("load_payload", "Payload Loader")} for 3.`;
    expect(showNames(line, false)).toBe("You hit Payload Loader for 3.");
    expect(showNames(line, true)).toBe("You hit load_payload for 3.");
  });

  it("call a boss by its title", () => {
    expect(showNames(nameOf({ name: "__init__", boss: { title: "the Secret Keeper" } }), false)).toBe("the Secret Keeper");
  });
});

describe("gear names", () => {
  it("make a weapon a thing you hold, shaped by how it fights", () => {
    expect(gearLabel({ slot: "weapon", name: "load_payload", trait: "pierce" })).toBe("Payload Loader's Spear");
    expect(gearLabel({ slot: "weapon", name: "loads", trait: "plain" })).toBe("the Loader's Sword");
    expect(gearLabel({ slot: "weapon", name: 'FIXME "this leaks"', trait: "unsafe" })).toBe("Patched Dagger");
  });

  it("make armor out of test suites and type packages", () => {
    expect(gearLabel({ slot: "armor", name: "test_signer.py suite", trait: "plain" })).toBe("Signer Mail");
    expect(gearLabel({ slot: "armor", name: "@types/express", trait: "plain" })).toBe("Express Plate");
    expect(gearLabel({ slot: "armor", name: "x", trait: "plain", label: "Loader's Shield" })).toBe("Loader's Shield");
  });
});

describe("what a name says", () => {
  it("reads a verb and its object as plain words", () => {
    expect(nameSays("load_payload")).toBe("it loads payload");
    expect(nameSays("iter_unsigners")).toBe("it goes through unsigners");
    expect(nameSays("find_app_by_string")).toBe("it finds app");
    expect(nameSays("Foo.match_path")).toBe("it matches path");
    expect(nameSays("value")).toBeNull();
  });
});
