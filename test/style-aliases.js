import styleAliases from "../src/style-aliases.js";
import { applyAliases } from "./util/helpers.js";

export default {
	name: "styleAliases()",
	// applyAliases also asserts idempotence for every case below:
	// re-running the plugin on its own output must be a byte-identical no-op
	run: applyAliases,
	tests: [
		{
			name: "Basics",
			tests: [
				{
					name: "type original",
					args: ["h4 {}", { ".callout-title": "h4" }],
					expect: ":is(h4, :where(.callout-title)) {}",
				},
				{
					name: "class original",
					args: [".action {}", { ".btn": ".action" }],
					expect: ":is(.action, :where(.btn)) {}",
				},
				{
					name: "compound original",
					args: ["a.button {}", { ".linkish": "a.button" }],
					expect: ":is(a.button, :where(.linkish)) {}",
				},
				{
					name: "compound original with parts in a different order",
					args: [".button.large.fancy {}", { ".big": ".large.button" }],
					expect: ":is(.button.large, :where(.big)).fancy {}",
				},
				{
					name: "alias with a compound",
					args: ["h4 {}", { "div.title": "h4" }],
					expect: ":is(h4, :where(div.title)) {}",
				},
				{
					name: "alias with a descendant combinator",
					args: ["h4 {}", { ".card > .title": "h4" }],
					expect: ":is(h4, :where(.card > .title)) {}",
				},
				{
					name: "multiple aliases of one original share a wrapper",
					args: ["h4 {}", { ".a": "h4", ".b": "h4" }],
					expect: ":is(h4, :where(.a, .b)) {}",
				},
				{
					name: "duplicate registrations collapse",
					args: ["h4 {}", { ".a": "h4", " .a": "H4" }],
					expect: ":is(h4, :where(.a)) {}",
				},
				{
					name: "multiple originals in one selector",
					args: ["main h4 code.action {}", { ".ct": "h4", ".act": ".action" }],
					expect: "main :is(h4, :where(.ct)) code:is(.action, :where(.act)) {}",
				},
				{
					name: "multiple originals in one compound",
					args: ["h4.tip {}", { ".a": "h4", ".b": ".tip" }],
					expect: ":is(h4, :where(.a)):is(.tip, :where(.b)) {}",
				},
				{
					name: "more specific original wins on the same compound",
					args: ["h4.tip {} h4 {}", { ".a": "h4", ".b": "h4.tip" }],
					expect: ":is(h4.tip, :where(.b)) {} :is(h4, :where(.a)) {}",
				},
				{
					name: "occurrence in every position",
					args: ["main h4 > code, h4 em, em h4 {}", { ".ct": "h4" }],
					expect: "main :is(h4, :where(.ct)) > code, :is(h4, :where(.ct)) em, em :is(h4, :where(.ct)) {}",
				},
				{
					name: "pseudo-elements on the occurrence stay outside the wrapper",
					args: ["h4.tip:hover::before {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)).tip:hover::before {}",
				},
				{
					name: "selector list",
					args: ["h4, .tip {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)), .tip {}",
				},
				{
					name: "declarations and formatting are untouched",
					args: ["h4 {\n\tcolor: red;\n}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)) {\n\tcolor: red;\n}",
				},
			],
		},
		{
			name: "Structural matching",
			tests: [
				{
					name: "no substring false positives",
					args: [".h400 {} h40 {} h4.h400 {}", { ".ct": "h4" }],
					expect: ".h400 {} h40 {} :is(h4, :where(.ct)).h400 {}",
				},
				{
					name: "attribute quoting is normalized",
					args: ['[a="b"] {} [a=b] {}', { ".q": "[a=b]" }],
					expect: ':is([a="b"], :where(.q)) {} :is([a=b], :where(.q)) {}',
				},
				{
					name: "type selector case is normalized",
					args: ["H4 {}", { ".ct": "h4" }],
					expect: ":is(H4, :where(.ct)) {}",
				},
				{
					name: "attribute flag case is normalized",
					args: ["[a=b I] {}", { ".q": '[a="b" i]' }],
					expect: ":is([a=b I], :where(.q)) {}",
				},
				{
					name: "attribute flags must match",
					args: ["[a=b i] {}", { ".q": "[a=b]" }],
					expect: "[a=b i] {}",
				},
				{
					name: "attribute operators must match",
					args: ["[a^=b] {}", { ".q": "[a=b]" }],
					expect: "[a^=b] {}",
				},
				{
					name: "escaped identifiers match their unescaped form",
					args: [".h\\e9 llo {}", { ".u": ".héllo" }],
					expect: ":is(.h\\e9 llo, :where(.u)) {}",
				},
				{
					name: "unicode identifiers",
					args: [".héllo {}", { ".u": ".héllo" }],
					expect: ":is(.héllo, :where(.u)) {}",
				},
				{
					name: "comments inside selectors are preserved",
					args: ["h4/* mid */.tip {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct))/* mid */.tip {}",
				},
				{
					name: "class does not match tag of the same name",
					args: [".h4 {}", { ".ct": "h4" }],
					expect: ".h4 {}",
				},
				{
					name: "namespaced type does not match un-namespaced original",
					args: ["svg|rect {} rect {}", { ".x": "rect" }],
					expect: "svg|rect {} :is(rect, :where(.x)) {}",
				},
				{
					name: "namespaced attribute does not match un-namespaced original",
					args: ["[xlink|href=a] {}", { ".q": "[href=a]" }],
					expect: "[xlink|href=a] {}",
				},
				{
					name: "attribute s flag must match too",
					args: ["[a=b s] {}", { ".q": "[a=b]" }],
					expect: "[a=b s] {}",
				},
				{
					name: "attribute s flag case is normalized",
					args: ["[a=b S] {}", { ".q": "[a=b s]" }],
					expect: ":is([a=b S], :where(.q)) {}",
				},
				{
					name: "attribute values cannot forge canonical-key separators",
					description: "The quoted value contains what another original's key looks like",
					args: ['[a="b c|d"] {} [a=b].d {}', { ".x": '[a="b c|d"]', ".y": "[a=b].d" }],
					expect: ':is([a="b c|d"], :where(.x)) {} :is([a=b].d, :where(.y)) {}',
				},
				{
					name: "comments adjacent to whitespace survive a rewrite",
					description:
						"PostCSS moves these into raws.selector; the raw must be transformed",
					args: ["h4, /*hey*/ .z {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)), /*hey*/ .z {}",
				},
				{
					name: "whitespace around a wrapped compound stays outside the wrapper",
					args: ["h4 , .x {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)) , .x {}",
				},
			],
		},
		{
			name: "Selector-list pseudos",
			tests: [
				{
					name: "recursion into :is()",
					args: [":is(h4, .x) {}", { ".ct": "h4" }],
					expect: ":is(:is(h4, :where(.ct)), .x) {}",
				},
				{
					name: "recursion into :where()",
					args: [":where(h4) {}", { ".ct": "h4" }],
					expect: ":where(:is(h4, :where(.ct))) {}",
				},
				{
					name: "recursion into :not()",
					args: [":not(h4) {}", { ".ct": "h4" }],
					expect: ":not(:is(h4, :where(.ct))) {}",
				},
				{
					name: "recursion into :has() with a relative selector",
					args: ["div:has(> h4) {}", { ".ct": "h4" }],
					expect: "div:has(> :is(h4, :where(.ct))) {}",
				},
				{
					name: "hand-authored wrapper identical to a generated one is left alone",
					args: [":is(h4, :where(.ct)) {}", { ".ct": "h4" }],
					expect: ":is(h4, :where(.ct)) {}",
				},
				{
					name: "other functional pseudos are not recursed into",
					args: [":nth-child(2n of h4) {}", { ".ct": "h4" }],
					expect: ":nth-child(2n of h4) {}",
				},
				{
					name: "generated-looking :is() with extra arguments is not mistaken for a wrapper",
					args: [":is(h4, .z, :where(.ct)) {}", { ".ct": "h4" }],
					expect: ":is(:is(h4, :where(.ct)), .z, :where(.ct)) {}",
				},
				{
					name: "generated-looking :is() whose first argument isn't the original",
					args: [":is(.unrelated, :where(.ct)) {}", { ".ct": "h4" }],
					expect: ":is(.unrelated, :where(.ct)) {}",
				},
			],
		},
		{
			name: "Nesting",
			tests: [
				{
					name: "expansion across a nested rule",
					args: [
						'button { &[aria-pressed="true"] { color: blue } }',
						{ ".pressed": 'button[aria-pressed="true"]' },
					],
					expect: 'button { :is(&[aria-pressed="true"], :where(.pressed)) { color: blue } }',
				},
				{
					name: "nested wrap preserves the author's part order",
					args: ["button { &[b][a] {} }", { ".p": "button[a][b]" }],
					expect: "button { :is(&[b][a], :where(.p)) {} }",
				},
				{
					name: "extra parts on the nested compound stay outside",
					args: [
						"button { &[aria-pressed].big {} }",
						{ ".pressed": "button[aria-pressed]" },
					],
					expect: "button { :is(&[aria-pressed], :where(.pressed)).big {} }",
				},
				{
					name: "multi-level chain",
					args: [
						"button { &:hover { &[aria-pressed] {} } }",
						{ ".p": "button[aria-pressed]" },
					],
					expect: "button { &:hover { :is(&[aria-pressed], :where(.p)) {} } }",
				},
				{
					name: "list of compounds as ancestor, common part matches",
					args: [".btn.a, .btn.b { &[aria-pressed] {} }", { ".p": ".btn[aria-pressed]" }],
					expect: ".btn.a, .btn.b { :is(&[aria-pressed], :where(.p)) {} }",
				},
				{
					name: "list of compounds as ancestor, no common part",
					args: [
						"button, input { &[aria-pressed] {} }",
						{ ".p": "button[aria-pressed]" },
					],
					expect: "button, input { &[aria-pressed] {} }",
				},
				{
					name: "nesting through conditional at-rules",
					args: [
						"button { @media print { &[aria-pressed] {} } }",
						{ ".p": "button[aria-pressed]" },
					],
					expect: "button { @media print { :is(&[aria-pressed], :where(.p)) {} } }",
				},
				{
					name: "exclusion: complex ancestor",
					args: ["main button { &[aria-pressed] {} }", { ".p": "button[aria-pressed]" }],
					expect: "main button { &[aria-pressed] {} }",
				},
				{
					name: "exclusion: non-& nested selector",
					args: ["button { [aria-pressed] {} }", { ".p": "button[aria-pressed]" }],
					expect: "button { [aria-pressed] {} }",
				},
				{
					name: "exclusion: & mid-compound",
					args: ["button { [aria-pressed]& {} }", { ".p": "button[aria-pressed]" }],
					expect: "button { [aria-pressed]& {} }",
				},
				{
					name: "exclusion: nested selector is complex",
					args: ["button { & [aria-pressed] {} }", { ".p": "button[aria-pressed]" }],
					expect: "button { & [aria-pressed] {} }",
				},
				{
					name: "ancestor-only match propagates through the ancestor's own wrap",
					args: ["button { &.x {} }", { ".b": "button" }],
					expect: ":is(button, :where(.b)) { &.x {} }",
				},
				{
					name: "own-only match goes through the normal path",
					args: ["div { &.tip {} }", { ".b": ".tip" }],
					expect: "div { &:is(.tip, :where(.b)) {} }",
				},
				{
					name: "unrelated ancestor",
					args: ["div { &[aria-pressed] {} }", { ".p": "button[aria-pressed]" }],
					expect: "div { &[aria-pressed] {} }",
				},
				{
					name: "unrelated nested rules untouched",
					args: ["button { &.other {} .child {} }", { ".p": "button[aria-pressed]" }],
					expect: "button { &.other {} .child {} }",
				},
				{
					name: "pristine ancestor parts: ancestor rewritten by its own alias first",
					description:
						"button is wrapped when visited; the nested match must use its pre-rewrite parts",
					args: [
						"button { &[aria-pressed] {} }",
						{ ".b": "button", ".p": "button[aria-pressed]" },
					],
					expect: ":is(button, :where(.b)) { :is(&[aria-pressed], :where(.p)) {} }",
				},
			],
		},
		{
			name: "At-rules",
			tests: [
				{
					name: "@media",
					args: ["@media print { h4 {} }", { ".ct": "h4" }],
					expect: "@media print { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "@supports",
					args: ["@supports (display: grid) { h4 {} }", { ".ct": "h4" }],
					expect: "@supports (display: grid) { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "@layer",
					args: ["@layer base { h4 {} }", { ".ct": "h4" }],
					expect: "@layer base { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "@container",
					args: ["@container (min-width: 100px) { h4 {} }", { ".ct": "h4" }],
					expect: "@container (min-width: 100px) { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "unknown at-rules are traversed",
					args: ["@future stuff { h4 {} }", { ".ct": "h4" }],
					expect: "@future stuff { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "@scope prelude and body",
					args: ["@scope (h4) to (.tip) { h4 {} }", { ".ct": "h4" }],
					expect: "@scope (:is(h4, :where(.ct))) to (.tip) { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "comments in the @scope prelude survive a rewrite",
					args: ["@scope (/* c */ h4) { h4 {} }", { ".ct": "h4" }],
					expect: "@scope (/* c */ :is(h4, :where(.ct))) { :is(h4, :where(.ct)) {} }",
				},
				{
					name: "@keyframes untouched",
					args: ["@keyframes h4 { from {} to {} }", { ".ct": "h4", ".f": "from" }],
					expect: "@keyframes h4 { from {} to {} }",
				},
				{
					name: "vendor-prefixed @keyframes untouched",
					args: ["@-webkit-keyframes spin { from {} }", { ".f": "from" }],
					expect: "@-webkit-keyframes spin { from {} }",
				},
				{
					name: "rules nested under @keyframes at any depth untouched",
					args: ["@keyframes spin { @media print { from {} } }", { ".f": "from" }],
					expect: "@keyframes spin { @media print { from {} } }",
				},
			],
		},
		{
			name: "Errors",
			run: styleAliases,
			tests: [
				{
					name: "complex original",
					arg: { ".x": "main h4" },
					throws: e =>
						e instanceof TypeError &&
						/combinator/.test(e.message) &&
						e.message.includes("main h4"),
				},
				{
					name: "selector list original",
					arg: { ".x": "h4, h5" },
					throws: e => e instanceof TypeError && /selector list/.test(e.message),
				},
				{
					name: "nesting selector original",
					arg: { ".x": "&.foo" },
					throws: TypeError,
				},
				{
					name: "pseudo-element alias",
					arg: { ".x::before": "h4" },
					throws: e =>
						e instanceof TypeError &&
						/pseudo-element/.test(e.message) &&
						e.message.includes("::before"),
				},
				{
					name: "legacy single-colon pseudo-element alias",
					arg: { ".x:after": "h4" },
					throws: e => e instanceof TypeError && /pseudo-element/.test(e.message),
				},
				{
					name: "pseudo-element original",
					arg: { ".x": "h4::before" },
					throws: e => e instanceof TypeError && /pseudo-element/.test(e.message),
				},
				{
					name: "empty original",
					arg: { ".x": "/* hi */" },
					throws: e => e instanceof TypeError && /empty/.test(e.message),
				},
				{
					name: "alias containing the nesting selector",
					arg: { "&.x": "h4" },
					throws: e => e instanceof TypeError && /nesting selector/.test(e.message),
				},
				{
					name: "unparsable original carries plugin context",
					arg: { ".x": "h4!" },
					throws: e =>
						e instanceof TypeError && /styleAliases: could not parse/.test(e.message),
				},
			],
		},
	],
};
