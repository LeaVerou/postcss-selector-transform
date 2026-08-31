import parser from "postcss-selector-parser";

/** @import { AtRule, Plugin, Rule } from "postcss" */
/** @import { Root } from "postcss-selector-parser" */

export { default as styleAliases, aliasTransform } from "./style-aliases.js";

/**
 * At-rules whose child "selectors" are not actual selectors (e.g. `@keyframes` step names).
 * Rules inside these (or their vendor-prefixed variants) are never transformed.
 * A blacklist rather than an allowlist, so unknown/future at-rules get transformed by default.
 * Extensible: `IGNORED_ATRULES.add("my-atrule")`.
 * @type {Set<string>}
 */
export const IGNORED_ATRULES = new Set(["keyframes"]);

/** Strip vendor prefix and lowercase, so `@-webkit-KeyFrames` matches "keyframes" */
function atruleName (atrule) {
	return atrule.name.toLowerCase().replace(/^-\w+-/, "");
}

function isIgnored (node) {
	for (let n = node.parent; n; n = n.parent) {
		if (n.type === "atrule" && IGNORED_ATRULES.has(atruleName(n))) {
			return true;
		}
	}

	return false;
}

/**
 * @typedef {(selectors: Root, context: {rule: Rule | AtRule}) => void} SelectorTransform
 * A function that mutates a parsed selector AST in place.
 * `context.rule` is the node the selector belongs to (an at-rule for `@scope` preludes).
 * Rules are visited in document order, parents before their nested children —
 * transforms may rely on this (styleAliases does, for `&` expansion).
 */

/**
 * Parse a selector once, run every transform over the shared AST, stringify once.
 * @param {string} selector
 * @param {SelectorTransform[]} transforms
 * @param {object} context - passed through to each transform; must include `rule`
 * @returns {string} the (possibly unchanged) selector
 */
function transformSelector (selector, transforms, context) {
	let ast;

	try {
		ast = parser().astSync(selector);
	}
	catch (e) {
		throw context.rule.error(`Failed to parse selector "${selector}": ${e.message}`);
	}

	for (let transform of transforms) {
		transform(ast, context);
	}

	return ast.toString();
}

/**
 * Replace the contents of each top-level `(…)` group in an at-rule prelude,
 * e.g. both selectors in `@scope (.card) to (.content)`.
 * Skips parens inside quoted strings (e.g. attribute values).
 */
function transformPrelude (params, replace) {
	let out = "";
	let depth = 0;
	let start = 0;
	let quote = null;

	for (let i = 0; i < params.length; i++) {
		let ch = params[i];

		if (ch === "\\") {
			i++;
		}
		else if (quote) {
			if (ch === quote) {
				quote = null;
			}
		}
		else if (ch === '"' || ch === "'") {
			quote = ch;
		}
		else if (ch === "(") {
			if (++depth === 1) {
				out += params.slice(start, i + 1);
				start = i + 1;
			}
		}
		else if (ch === ")") {
			if (--depth === 0) {
				out += replace(params.slice(start, i));
				start = i;
			}
		}
	}

	return out + params.slice(start);
}

/**
 * Generic selector-level plugin surface for PostCSS: parses each rule's selector
 * once, runs every registered transform over the shared AST, stringifies once.
 * @param {SelectorTransform | SelectorTransform[] | {transforms: SelectorTransform[]}} [options]
 * @returns {Plugin}
 */
export default function selectorTransform (options = {}) {
	if (typeof options === "function") {
		options = { transforms: [options] };
	}
	else if (Array.isArray(options)) {
		options = { transforms: options };
	}

	let { transforms = [] } = options;

	return {
		postcssPlugin: "postcss-selector-transform",

		// Once + walk (rather than a Rule visitor) so that mutated selectors are not
		// re-visited: transforms are not required to be idempotent within a pass,
		// and parents are guaranteed to be visited before their nested children.
		Once (root) {
			root.walk(node => {
				if (node.type === "rule") {
					if (isIgnored(node)) {
						return;
					}

					// The raw selector: PostCSS moves whitespace-adjacent comments into raws,
					// so transforming node.selector directly would silently drop them
					let selector = node.raws.selector?.raw ?? node.selector;
					let result = transformSelector(selector, transforms, { rule: node });

					if (result !== selector) {
						node.selector = result;
					}
				}
				else if (
					node.type === "atrule" &&
					atruleName(node) === "scope" &&
					!isIgnored(node)
				) {
					// @scope carries selectors in its prelude: `@scope (A) to (B)`.
					// NOTE: extend here if more at-rules with selector preludes appear.
					let params = node.raws.params?.raw ?? node.params;
					let result = transformPrelude(params, selector =>
						transformSelector(selector, transforms, { rule: node }));

					if (result !== params) {
						node.params = result;
					}
				}
			});
		},
	};
}

selectorTransform.postcss = true;
