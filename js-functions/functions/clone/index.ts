// Copying a value. A library that does not want its caller's object to
// change under it calls `structuredClone`, and what makes that worth
// asking about is that it is not a spread and not a trip through JSON:
// a cycle survives, a `Map` stays a `Map`, and what cannot be copied is
// refused by a name the caller branches on.
//
// The answers here are shapes and sentences rather than assertions, so
// that the two servers can be compared line by line rather than at the
// first difference.
const say = (f: () => unknown): unknown => {
  try {
    return f();
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : `not an error: ${String(e)}`;
  }
};

const clone = structuredClone as unknown as (value: unknown, options?: unknown) => unknown;

Deno.serve(() => {
  const carried = say(() => {
    const value = {
      n: 1,
      s: "x",
      u: undefined,
      z: null,
      nested: { deep: [1, 2, { d: 3 }] },
      map: new Map<unknown, unknown>([["k", { in: 1 }], [2, "two"]]),
      set: new Set([1, "a"]),
      date: new Date(1700000000123),
      re: /ab+c/gi,
      buf: new Uint8Array([1, 2, 3]).buffer,
      u8: new Uint8Array([4, 5, 6]),
      dv: new DataView(new Uint8Array([9, 9]).buffer),
      big: 12345678901234567890n,
      nan: NaN,
      negzero: -0,
    };
    const c = structuredClone(value);
    return {
      same: c === value,
      nested: c.nested === value.nested,
      deep: c.nested.deep[2],
      undefined_kept: "u" in c,
      map: [c.map instanceof Map, c.map.get("k"), c.map.get(2), c.map.size],
      set: [c.set instanceof Set, c.set.size, c.set.has("a")],
      date: [c.date instanceof Date, c.date.getTime()],
      re: [c.re instanceof RegExp, c.re.source, c.re.flags],
      buf: [c.buf instanceof ArrayBuffer, c.buf.byteLength, new Uint8Array(c.buf)[0]],
      u8: [c.u8 instanceof Uint8Array, Array.from(c.u8).join(",")],
      dv: [c.dv instanceof DataView, c.dv.getUint8(0)],
      big: [typeof c.big, String(c.big)],
      odd: [Number.isNaN(c.nan), Object.is(c.negzero, -0)],
    };
  });

  // The three JSON cannot do at all, which is the reason the algorithm
  // exists rather than a nicety.
  const graph = say(() => {
    const shared = { s: 1 };
    const value: Record<string, unknown> = { one: shared, two: shared };
    value.self = value;
    const c = structuredClone(value) as Record<string, unknown>;
    return { cycle: c.self === c, twice: c.one === c.two, fresh: c.one !== shared };
  });

  const refused = {
    fn: say(() => clone(() => 1)),
    sym: say(() => clone(Symbol("s"))),
    weak: say(() => clone(new WeakMap())),
    inside: say(() => clone({ ok: 1, bad: () => 1 })),
    none: say(() => (structuredClone as unknown as () => unknown)()),
    dictionary: say(() => clone({ a: 1 }, 5)),
    sequence: say(() => clone({ a: 1 }, { transfer: 5 })),
    string_sequence: say(() => clone({ a: 1 }, { transfer: "ab" })),
    null_sequence: say(() => clone({ a: 1 }, { transfer: null })),
    not_object: say(() => clone({ a: 1 }, { transfer: [null] })),
    second: say(() => clone({ a: 1 }, { transfer: [new ArrayBuffer(2), 5] })),
    stream: say(() => clone({ a: 1 }, { transfer: [new ReadableStream()] })),
    view: say(() => clone({ a: 1 }, { transfer: [new Uint8Array(4)] })),
    getter: say(() => clone({ get g() { throw new RangeError("from the getter"); } })),
  };

  // What a copy loses. None of this is what the algorithm says, and all
  // of it is what both servers do, which is the only reason it is here
  // rather than in a list of bugs.
  const lost = say(() => {
    const blob = structuredClone(new Blob(["hello"], { type: "text/plain" })) as Blob;
    const headers = structuredClone(new Headers({ a: "b" }));
    const url = structuredClone(new URL("http://x/y"));
    const file = new File(["hi"], "a.txt", { type: "text/plain", lastModified: 1700000000000 });
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    const moved = structuredClone({ buf }, { transfer: [buf] });
    class Thing {
      constructor(public v: number) {}
      get twice() {
        return this.v * 2;
      }
    }
    const thing = structuredClone(new Thing(2)) as Record<string, unknown>;
    const plain = structuredClone({ get g() { return 7; } });
    const error = new TypeError("wrong");
    (error as unknown as Record<string, unknown>).extra = "kept?";
    const copied = structuredClone(error) as TypeError & { extra?: string };
    const sparse = [1, , 3] as unknown[];
    (sparse as unknown as Record<string, unknown>).extra = "yes";
    const holes = structuredClone(sparse) as unknown[];
    return {
      blob: [blob instanceof Blob, JSON.stringify(blob), typeof blob.size],
      headers: [headers instanceof Headers, Object.keys(headers).length],
      url: [url instanceof URL, Object.keys(url).length],
      file_own: [Object.keys(file).length, JSON.stringify(file)],
      transfer: [buf.byteLength, moved.buf.byteLength, new Uint8Array(moved.buf)[0]],
      thing: [thing instanceof Thing, thing.constructor?.name, thing.v, thing.twice],
      getter: [plain.g, typeof Object.getOwnPropertyDescriptor(plain, "g")?.get],
      error: [copied.name, copied.message, copied instanceof TypeError, copied.extra ?? null],
      sparse: [holes.length, 1 in holes, (holes as unknown as Record<string, unknown>).extra],
    };
  });

  return Response.json({
    typeof: typeof structuredClone,
    arity: [structuredClone.length, structuredClone.name],
    carried,
    graph,
    refused,
    lost,
  });
});
