import postcss from "postcss";
import selectorTransform, { IGNORED_ATRULES } from "../src/index.js";

function process (css, options) {
	return postcss([selectorTransform(options)]).process(css, { from: undefined }).css;
}

const upperTags = selectors => selectors.walkTags(tag => (tag.value = tag.value.toUpperCase()));

export default {
	name: "selectorTransform()",
	tests: [
		{
			name: "runs a transform over every rule",
			run: () => process("a {} @media print { b {} }", { transforms: [upperTags] }),
			expect: "A {} @media print { B {} }",
		},
		{
			name: "accepts a bare function or array instead of an options object",
			run: () => [process("a {}", upperTags), process("a {}", [upperTags])],
			expect: ["A {}", "A {}"],
		},
		{
			name: "all transforms share one AST per rule",
			run () {
				let seen = [];
				process("a {}", { transforms: [s => seen.push(s), s => seen.push(s)] });
				return seen[0] === seen[1];
			},
			expect: true,
		},
		{
			name: "transforms run in registration order on the shared AST",
			run: () =>
				process("a {}", {
					transforms: [
						upperTags,
						// sees the first transform's mutation, proving shared state
						selectors => selectors.walkTags(tag => (tag.value = `${tag.value}-SECOND`)),
					],
				}),
			expect: "A-SECOND {}",
		},
		{
			name: "transforms receive the owning rule",
			run () {
				let rules = [];
				process("a {} @scope (b) {}", {
					transforms: [(s, { rule }) => rules.push(rule.type)],
				});
				return rules;
			},
			expect: ["rule", "atrule"],
		},
		{
			name: "output is byte-identical when no transform changes anything",
			run: () => process("a  ,  b/*hey*/ {color:red}", { transforms: [() => {}] }),
			expect: "a  ,  b/*hey*/ {color:red}",
		},
		{
			name: "@scope prelude selectors are transformed",
			run: () => process("@scope (a.x) to (b) { c {} }", { transforms: [upperTags] }),
			expect: "@scope (A.x) to (B) { C {} }",
		},
		{
			name: "parens inside quoted attribute values don't confuse the @scope prelude",
			run: () => process('@scope ([href=\"(a)\"]) { b {} }', { transforms: [upperTags] }),
			expect: '@scope ([href=\"(a)\"]) { B {} }',
		},
		{
			name: "escaped parens in the @scope prelude don't confuse the scanner",
			run: () => process("@scope (.a\\)) { b {} }", { transforms: [upperTags] }),
			expect: "@scope (.a\\)) { B {} }",
		},
		{
			name: "@scope preludes under ignored at-rules are skipped",
			run: () => process("@keyframes k { @scope (a) { b {} } }", { transforms: [upperTags] }),
			expect: "@keyframes k { @scope (a) { b {} } }",
		},
		{
			name: "rules under @keyframes are skipped",
			run: () =>
				process("@keyframes spin { from {} } @-moz-keyframes x { to {} }", {
					transforms: [upperTags],
				}),
			expect: "@keyframes spin { from {} } @-moz-keyframes x { to {} }",
		},
		{
			name: "IGNORED_ATRULES is extensible",
			run () {
				IGNORED_ATRULES.add("future");

				try {
					return process("@future { a {} } b {}", { transforms: [upperTags] });
				}
				finally {
					IGNORED_ATRULES.delete("future");
				}
			},
			expect: "@future { a {} } B {}",
		},
		{
			name: "unparsable selectors produce a CSS syntax error with rule context",
			run: () => process("a! {}", { transforms: [upperTags] }),
			throws: e => e.name === "CssSyntaxError" && /Failed to parse selector/.test(e.message),
		},
	],
};
