# postcss-selector-transform

PostCSS plugin to facilitate selector-level transforms: just write the transform, don't worry about how to find all the selectors.

Built on top of it, **Style aliases** that lets you define selectors that should be styled like other selectors. E.g. "style `.callout-title` like `h4`".
Effectively, a build-time `@extend` that works, with no selector explosion, no specificity creep, and no cascade surprises.

See also [postcss-zero-specificity](https://github.com/leaverou/postcss-zero-specificity), a separate plugin built on this one that wraps every selector in `:where()`.

**Why?** PostCSS has visitors for rules and declarations, but no selector-level plugin surface: every selector-touching plugin re-parses `rule.selector` itself, and _N_ plugins mean _N_ parses per rule. This plugin parses each rule's selector **once** with [postcss-selector-parser](https://github.com/postcss/postcss-selector-parser), runs every registered transform over the shared AST, and stringifies **once** — no matter how many transforms are registered.

```sh
npm install postcss-selector-transform
```

## `selectorTransform`

```js
import postcss from "postcss";
import selectorTransform from "postcss-selector-transform";

postcss([
	selectorTransform({
		transforms: [
			(selectors, { rule }) => {
				// mutate the postcss-selector-parser AST in place
				selectors.walkClasses(node => (node.value = prefix + node.value));
			},
		],
	}),
]);
```

A single transform (or an array) can be passed directly: `selectorTransform(fn)`.

Each transform is called once per rule with the parsed selector AST and `{rule}` — the owning `Rule` (or `AtRule`, for `@scope` preludes). If any transform changed the AST, the selector is written back; otherwise the rule is untouched, byte for byte. Rules are visited in document order, parents before their nested children — transforms may rely on this (`styleAliases` does, for `&` expansion).

Selectors are transformed everywhere they appear:

- inside **all** at-rules — `@media`, `@supports`, `@layer`, `@container`, `@scope`, and any at-rule this plugin has never heard of;
- in the `@scope` **prelude** (`@scope (A) to (B)`), where the "params" are really selectors;
- **except** inside at-rules whose child "selectors" aren't selectors. That's a blacklist, not an allowlist (CSS grows at-rules too fast to enumerate the good ones), it matches vendor prefixes, and it's exported and extensible:

```js
import { IGNORED_ATRULES } from "postcss-selector-transform";
IGNORED_ATRULES.add("my-weird-atrule"); // initially just "keyframes"
```

## `styleAliases`

"Style B like A" — what `@extend` always wanted to be, at build time, with none of its failure modes:

```js
import postcss from "postcss";
import { styleAliases } from "postcss-selector-transform";

postcss([
	styleAliases({
		// alias: original — "style .callout-title like h4"
		".callout-title": "h4",
		".action": "button",
	}),
]);
```

Every occurrence of the original selector `A` is rewritten to `:is(A, :where(B1, B2, …))`:

```css
main h4 > code {}
/* becomes */
main :is(h4, :where(.callout-title)) > code {}
```

Why this beats classic `@extend`:

- **No selector explosion.** All aliases of one original share a single `:where()` wrapper; the rule count never grows.
- **Cascade position preserved.** Rules are rewritten in place, never duplicated or moved, so source order — and therefore the cascade — is untouched.
- **Specificity preserved.** `:where()` has zero specificity and `:is(A, :where(…))` has exactly A's, so the rewritten rule's specificity equals the original's. Aliased elements get the styles at alias-appropriate specificity too, since `:where()` is easy to override.

Matching is **structural**, never textual: `h4` matches `H4` but not `.h400` or `h40`; `[a=b]` matches `[a="b"]`; escaped identifiers match their unescaped forms. Originals are found in every position of complex selectors, in every rule of every (non-ignored) at-rule, in the `@scope` prelude, and inside every pseudo whose argument is a selector: `:is()`, `:where()`, `:not()`, `:has()`, the `of` clause of `:nth-child()` / `:nth-last-child()`, and `:host()`, `:host-context()`, `::slotted()`. The output is idempotent: running the plugin over its own output changes nothing.

The **original (A)** must be a simple or compound selector (`h4`, `a.button`) — an alias stands in for a single element's selector. The **alias (B)** may be any selector, combinators included (`.card > .title`).

Basic **nesting** is supported: an alias of `button[aria-pressed="true"]` matches

```css
button {
	&[aria-pressed="true"] {} /* becomes :is(&[aria-pressed="true"], :where(…)) {} */
}
```

### Limitations

- **Nesting is supported only in its simplest shape**: ancestor rules must be compounds or lists of compounds all the way up, and the nested selector must be a `&`-prefixed compound. Complex ancestors (`main button`), `&` mid-compound, multiple `&`, and non-`&` nested selectors are deliberately out of scope — those rules are simply left alone.
- **No transitive aliases.** Aliasing `.b` to `.a` and `.c` to `.b` does not style `.c` like `.a`. Register `.c` directly against `.a`.
- **Neither side can contain pseudo-elements** (`".x::before": "h4"` and `".x": "h4::before"` both throw), because pseudo-elements are invalid inside `:is()`/`:where()`. Alias the element itself instead — rules like `h4::before` are still rewritten through their `h4` part.
- **Shadow DOM boundaries apply as usual.** The rewrite is pure CSS; it can't make an alias match inside a shadow tree the original rule couldn't reach.
- If two originals overlap on the same compound (e.g. `h4.tip` and `h4` both registered, selector `h4.tip`), the more specific original wins for the shared parts; between equally specific overlapping originals, registration order decides.

### Composing with other transforms

`styleAliases(map)` is itself implemented as a selector transform, and that transform factory is exported too. To run it alongside your own transforms — or transforms from other packages, like [postcss-zero-specificity](https://github.com/leaverou/postcss-zero-specificity)'s `zeroTransform` — in a single parse:

```js
import selectorTransform, { aliasTransform } from "postcss-selector-transform";
import { zeroTransform } from "postcss-zero-specificity";

selectorTransform({
	transforms: [aliasTransform({ ".callout-title": "h4" }), zeroTransform, myOtherTransform],
});
```

## `postcss-selector-transform/selectors`

Generic helpers over postcss-selector-parser ASTs, for transform authors:

- `isPseudoElement(node)` — whether a node is a pseudo-element, including the legacy single-colon forms (`LEGACY_PSEUDO_ELEMENTS`).
- `wrap(wrapper, nodes, container)` — move consecutive `nodes` into `wrapper`'s first (empty) selector argument in place, inserting the wrapper where they were and keeping their surrounding whitespace outside — e.g. wrapping a compound in a parsed `:where()`.
- `partKey(node)` / `selectorKey(selector)` — canonical keys for structural (never textual) selector comparison: `H4` equals `h4`, `[a=b]` equals `[a="b"]`, escapes are normalized.
- `selectorStart(selector)` — index where actual selector content starts in a selector node, to skip the `An+B of` prefix the parser hands back as tags and combinators inside `:nth-child()` / `:nth-last-child()`. `0` for everything else; `selector.nodes.length` when there is no of-clause at all (`:nth-child(3)`).
- `SIMPLE`, `LIST_PSEUDOS`, `COMPOUND_PSEUDOS` (`:host()`, `:host-context()`, `::slotted()`), `NTH_PSEUDOS`, `SELECTOR_PSEUDOS` (the union of the latter three) — node-type/pseudo-class classification sets.
