import parser from "postcss-selector-parser";
import selectorTransform from "./index.js";
import {
	SIMPLE,
	LIST_PSEUDOS,
	isPseudoElement,
	partKey,
	selectorKey,
	wrap as wrapNodes,
} from "./selectors.js";

/** @import { Plugin } from "postcss" */
/** @import { SelectorTransform } from "./index.js" */
/** Nearest ancestor rule, looking through conditional at-rules like `@media` */
function parentRule (rule) {
	for (let n = rule.parent; n; n = n.parent) {
		if (n.type === "rule") {
			return n;
		}

		if (n.type !== "atrule") {
			return null;
		}
	}

	return null;
}

/**
 * Validate and index the alias map.
 * Aliases of the same original (however written) collapse into one group;
 * duplicate registrations collapse entirely.
 * @param {Record<string, string>} aliases - `{alias: original}`
 * @returns {Map<string, object>} groups keyed by the original's canonical key
 */
function buildGroups (aliases) {
	let groups = new Map();

	let parse = (selector, role) => {
		try {
			return parser().astSync(selector);
		}
		catch (e) {
			throw new TypeError(
				`styleAliases: could not parse ${role} "${selector}": ${e.message}`,
			);
		}
	};

	for (let [alias, original] of Object.entries(aliases)) {
		let ast = parse(original, "original selector");
		let aliasAst = parse(alias, "alias");

		if (ast.nodes.length !== 1) {
			throw new TypeError(
				`styleAliases: original selector "${original}" is a selector list. ` +
					`Originals must be a single simple or compound selector (like "h4" or "a.button"); ` +
					`register each part of the list as a separate original.`,
			);
		}

		let parts = [];

		for (let node of ast.first.nodes) {
			if (node.type === "comment") {
				continue;
			}

			if (isPseudoElement(node)) {
				throw new TypeError(
					`styleAliases: original selector "${original}" contains a pseudo-element ` +
						`("${node.value}"), which is not valid inside the :is() the rewrite produces. ` +
						`Register the alias against the element part instead — its pseudo-element ` +
						`rules are rewritten through that part, so the alias's "${node.value}" ` +
						`gets them automatically.`,
				);
			}

			if (!SIMPLE.has(node.type)) {
				throw new TypeError(
					`styleAliases: original selector "${original}" contains ` +
						(node.type === "combinator"
							? `a combinator ("${node.toString().trim() || " "}")`
							: `"${node.toString().trim()}"`) +
						`. Originals must be a simple or compound selector (like "h4" or "a.button"), ` +
						`since an alias stands in for a single element's selector.`,
				);
			}

			parts.push(partKey(node));
		}

		if (parts.length === 0) {
			throw new TypeError(
				`styleAliases: original selector "${original}" is empty. ` +
					`Originals must be a simple or compound selector (like "h4" or "a.button").`,
			);
		}

		aliasAst.walk(node => {
			if (isPseudoElement(node)) {
				throw new TypeError(
					`styleAliases: alias "${alias}" contains a pseudo-element ("${node.value}"), ` +
						`which is not valid inside :is()/:where(). ` +
						`Alias the element itself instead — rules like "${original}${node.value}" ` +
						`are still rewritten through their "${original}" part.`,
				);
			}

			if (node.type === "nesting") {
				throw new TypeError(
					`styleAliases: alias "${alias}" contains the nesting selector "&", ` +
						`which would mean something different in every rule the alias is injected into. ` +
						`Spell out the ancestor part explicitly instead.`,
				);
			}
		});

		let key = [...parts].sort().join("\0");
		let group = groups.get(key);

		if (!group) {
			group = { parts, aliases: [], aliasKeys: new Set() };
			groups.set(key, group);
		}

		for (let sel of aliasAst.nodes) {
			let aliasKey = selectorKey(sel);

			if (!group.aliasKeys.has(aliasKey)) {
				group.aliasKeys.add(aliasKey);
				group.aliases.push(sel.toString().trim());
			}
		}
	}

	for (let group of groups.values()) {
		group.where = `:where(${group.aliases.join(", ")})`;
	}

	// Most specific originals first, so e.g. "h4.tip" wins over "h4" on the same compound
	return new Map([...groups].sort((a, b) => b[1].parts.length - a[1].parts.length));
}

/**
 * Create a selector transform that rewrites each occurrence of a registered original A
 * into `:is(A, :where(B1, B2, …))` — same specificity, aliases match too.
 * Compose it with other transforms via `selectorTransform({transforms: […]})`.
 * @param {Record<string, string>} aliases - `{alias: original}`
 * @returns {SelectorTransform}
 */
export function aliasTransform (aliases) {
	let groups = buildGroups(aliases);

	// Wrappers created during this pass — never candidates for matching or recursion
	let generated = new WeakSet();

	// Rule -> Set of compound parts it contributes to nested `&` selectors,
	// or null when the rule doesn't qualify as a nesting ancestor
	let contributed = new WeakMap();

	/**
	 * Recognize a wrapper this plugin generated (possibly in a previous run, so the
	 * WeakSet alone is not enough): an `:is()` whose last argument is `:where()` of
	 * exactly one group's alias list. Skipping these makes the transform idempotent.
	 */
	function isGenerated (node) {
		if (generated.has(node)) {
			return true;
		}

		if (
			node.type !== "pseudo" ||
			node.value.toLowerCase() !== ":is" ||
			node.nodes.length !== 2
		) {
			return false;
		}

		let last = node.nodes.at(-1).nodes.filter(n => n.type !== "comment");

		if (
			last.length !== 1 ||
			last[0].type !== "pseudo" ||
			last[0].value.toLowerCase() !== ":where"
		) {
			return false;
		}

		let keys = new Set(last[0].nodes.map(selectorKey));

		// The first argument must also look like a wrapped occurrence of that group:
		// all of A's parts, or `&` standing in for some of them (the nesting path)
		let arm = new Set(
			node.nodes[0].nodes
				.filter(n => SIMPLE.has(n.type) || n.type === "nesting")
				.map(partKey),
		);

		for (let group of groups.values()) {
			if (
				keys.size === group.aliasKeys.size &&
				[...keys].every(k => group.aliasKeys.has(k)) &&
				(arm.has("&") || group.parts.every(p => arm.has(p)))
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Record which compound parts `rule` contributes to `&` in its nested rules.
	 * Must run on the pristine selector, before any rewriting — parents are visited
	 * first and their occurrences would otherwise already be wrapped.
	 * Qualifying rules are compounds or lists of compounds all the way up
	 * (a list contributes only the parts common to all of its selectors);
	 * nested qualifying rules must be `&`-prefixed compounds. Anything fancier
	 * disqualifies the rule as an ancestor (records null).
	 */
	function recordContributed (rule, selectors) {
		let parent = parentRule(rule);
		let parentParts = parent ? contributed.get(parent) : null;
		let common = null;

		for (let sel of selectors.nodes) {
			let parts = [];
			let hasNesting = false;

			for (let node of sel.nodes) {
				if (node.type === "comment") {
					continue;
				}

				if (node.type === "nesting") {
					hasNesting = true;
					continue;
				}

				if (!SIMPLE.has(node.type)) {
					contributed.set(rule, null);
					return;
				}

				parts.push(partKey(node));
			}

			if (parent ? !hasNesting || !parentParts : hasNesting) {
				contributed.set(rule, null);
				return;
			}

			common = common ? new Set(parts.filter(p => common.has(p))) : new Set(parts);
		}

		if (common && parentParts) {
			common = common.union(parentParts);
		}

		contributed.set(rule, common);
	}

	/**
	 * Wrap `matched` (nodes of one compound, in document order) into
	 * `:is(<matched>, :where(aliases))`, in place, preserving the original text.
	 */
	function wrap (group, matched, container) {
		let wrapper = parser().astSync(`:is(, ${group.where})`).first.first;
		generated.add(wrapNodes(wrapper, matched, container));
		return wrapper;
	}

	/**
	 * Match one group against one compound and wrap its occurrence, if any.
	 * Only A's own parts get wrapped; unrelated parts of the compound
	 * (including pseudo-elements) stay outside the wrapper.
	 */
	function wrapInCompound (group, compound, container, rule) {
		let candidates = compound.filter(n => SIMPLE.has(n.type) && !isGenerated(n));
		let nesting = compound.find(n => n.type === "nesting");
		let matched = [];
		let missing = [];

		for (let part of group.parts) {
			let node = candidates.find(n => !matched.includes(n) && partKey(n) === part);

			if (node) {
				matched.push(node);
			}
			else {
				missing.push(part);
			}
		}

		if (missing.length === 0 && matched.length > 0) {
			// Normal path: the compound contains all of A on its own
			wrap(
				group,
				matched.sort((a, b) => compound.indexOf(a) - compound.indexOf(b)),
				container,
			);
			return;
		}

		// Nesting expansion: `&` may stand in for A parts contributed by ancestor rules.
		// Deliberate scope limits — the nested selector must be a `&`-prefixed compound,
		// ancestors must qualify (see recordContributed), and the nested rule must
		// contribute at least one of A's parts itself (ancestor-only occurrences
		// propagate through the ancestor's own wrap; see README "Limitations").
		if (
			matched.length > 0 &&
			nesting &&
			compound.filter(n => n.type !== "comment")[0] === nesting &&
			container.nodes.every(n => n.type !== "combinator") &&
			rule?.type === "rule"
		) {
			let parent = parentRule(rule);
			let ancestorParts = parent ? contributed.get(parent) : null;

			if (ancestorParts && missing.every(part => ancestorParts.has(part))) {
				// `&` carries the ancestor half of A, so it goes inside the wrapper.
				// The rewritten selector still contains `&`, so it gets no implicit
				// descendant prefix and the aliases need no scoping: they stand for all of A.
				wrap(
					group,
					[nesting, ...matched].sort((a, b) => compound.indexOf(a) - compound.indexOf(b)),
					container,
				);
			}
		}
	}

	/** Process one selector: recurse into selector-list pseudos, then wrap occurrences */
	function processSelector (selector, rule) {
		for (let node of selector.nodes) {
			if (
				node.type === "pseudo" &&
				LIST_PSEUDOS.has(node.value.toLowerCase()) &&
				!isGenerated(node)
			) {
				for (let inner of node.nodes) {
					processSelector(inner, rule);
				}
			}
		}

		for (let group of groups.values()) {
			// Recompute compounds per group: earlier wraps have restructured the nodes
			let compound = [];

			for (let node of [...selector.nodes, null]) {
				if (node && node.type !== "combinator") {
					compound.push(node);
				}
				else {
					if (compound.length > 0) {
						wrapInCompound(group, compound, selector, rule);
					}

					compound = [];
				}
			}
		}
	}

	return (selectors, { rule }) => {
		if (rule.type === "rule") {
			recordContributed(rule, selectors);
		}

		for (let selector of selectors.nodes) {
			processSelector(selector, rule);
		}
	};
}

/**
 * Standalone "style B like A" plugin: `styleAliases({".callout-title": "h4"})`
 * rewrites every occurrence of `h4` into `:is(h4, :where(.callout-title))`.
 * Implemented as a selector transform over `selectorTransform`; to combine with
 * other transforms in a single parse, use `aliasTransform` directly.
 * @param {Record<string, string>} aliases - `{alias: original}`
 * @returns {Plugin}
 */
export default function styleAliases (aliases = {}) {
	let plugin = selectorTransform(aliasTransform(aliases));
	plugin.postcssPlugin = "postcss-selector-transform/style-aliases";
	return plugin;
}

styleAliases.postcss = true;
