/**
 * Generic helpers over postcss-selector-parser ASTs:
 * node classification, in-place wrapping, and canonical keys for structural
 * (never textual) comparison. Public as "postcss-selector-transform/selectors"
 * for transform authors (postcss-zero-specificity uses it).
 */

/** @import { Container, Node, Pseudo, Selector } from "postcss-selector-parser" */

/** Simple selector node types that can be part of a compound */
export const SIMPLE = new Set(["tag", "class", "id", "attribute", "pseudo", "universal"]);

/** Functional pseudo-classes whose arguments are a selector list */
export const LIST_PSEUDOS = new Set([":is", ":where", ":not", ":has"]);

/** Pseudo-elements that are valid with a single colon for legacy reasons */
export const LEGACY_PSEUDO_ELEMENTS = new Set([
	":before",
	":after",
	":first-line",
	":first-letter",
]);

/** @param {Node} node */
export function isPseudoElement (node) {
	return (
		node.type === "pseudo" &&
		(node.value.startsWith("::") || LEGACY_PSEUDO_ELEMENTS.has(node.value.toLowerCase()))
	);
}

/**
 * Move `nodes` (consecutive nodes of one selector, in document order) into
 * `wrapper`'s first (empty) selector argument, in place, inserting the wrapper
 * where they were. The nodes' surrounding whitespace stays outside the wrapper.
 * @param {Pseudo} wrapper - e.g. a parsed `:where()`
 * @param {Node[]} nodes
 * @param {Container} container - the nodes' parent
 * @returns {Pseudo} the wrapper
 */
export function wrap (wrapper, nodes, container) {
	let first = nodes[0];
	let last = nodes.at(-1);

	wrapper.spaces.before = first.spaces.before;
	wrapper.spaces.after = last.spaces.after;
	first.spaces.before = "";
	last.spaces.after = "";
	container.insertBefore(first, wrapper);

	for (let node of nodes) {
		node.remove();
		wrapper.nodes[0].append(node);
	}

	return wrapper;
}

/** Namespace prefix for tag/universal/attribute keys (`true` means the empty namespace) */
function nsKey (node) {
	return node.namespace == null || node.namespace === false ? "" : `${node.namespace}|`;
}

/**
 * Canonical key for one simple selector, so structurally equal selectors compare equal:
 * type-selector case, attribute quoting and flag case, and identifier escapes are
 * normalized. Keys are only ever joined with control characters (which cannot appear
 * unescaped in selectors), so user content can't forge a separator.
 * @param {Node} node
 * @returns {string}
 */
export function partKey (node) {
	switch (node.type) {
		case "tag":
			return "t|" + nsKey(node) + node.value.toLowerCase();
		case "universal":
			return nsKey(node) + "*";
		case "class":
			return "c|" + node.value;
		case "id":
			return "#|" + node.value;
		case "nesting":
			return "&";
		case "attribute": {
			// node.value is already unquoted; the s flag only exists in raws
			let value = node.value === undefined ? "" : `${node.operator}${node.value}`;
			let flag = node.raws?.insensitiveFlag?.toLowerCase() ?? (node.insensitive ? "i" : "");
			return `a|${nsKey(node)}${node.attribute}${value}\u0002${flag}`;
		}
		case "pseudo": {
			let args = node.nodes?.length ? `(${node.nodes.map(selectorKey).join("\u0001")})` : "";
			return `p|${node.value.toLowerCase()}${args}`;
		}
		default:
			return node.toString().trim();
	}
}

/**
 * Canonical key for a full (possibly complex) selector
 * @param {Selector} selector
 * @returns {string}
 */
export function selectorKey (selector) {
	return selector.nodes
		.filter(n => n.type !== "comment")
		.map(n => (n.type === "combinator" ? `[${n.value.trim() || " "}]` : partKey(n)))
		.join("\0");
}
