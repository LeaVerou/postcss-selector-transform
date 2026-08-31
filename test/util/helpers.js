import postcss from "postcss";
import parser from "postcss-selector-parser";
import styleAliases from "../../src/style-aliases.js";
import { LEGACY_PSEUDO_ELEMENTS } from "../../src/selectors.js";

/**
 * Run styleAliases over `css` and return the output.
 * Also asserts, for every case that goes through it, that the plugin is
 * idempotent: running it again on its own output must be a byte-identical no-op.
 */
export function applyAliases (css, aliases) {
	let out = postcss([styleAliases(aliases)]).process(css, { from: undefined }).css;
	let out2 = postcss([styleAliases(aliases)]).process(out, { from: undefined }).css;

	if (out2 !== out) {
		throw new Error(`Not idempotent.\nFirst pass:  ${out}\nSecond pass: ${out2}`);
	}

	return out;
}

const MAX_OF_ARGS = new Set([":is", ":not", ":has"]);

/**
 * Compute the specificity of a single complex selector as [id, class, type].
 * Handles :where() (zero) and :is()/:not()/:has() (max of arguments).
 */
export function specificity (selector) {
	let root = typeof selector === "string" ? parser().astSync(selector) : selector;
	return root.type === "selector" ? specificityOf(root) : specificityOf(root.first);
}

function specificityOf (selector) {
	let result = [0, 0, 0];

	for (let node of selector.nodes) {
		switch (node.type) {
			case "id":
				result[0]++;
				break;
			case "class":
			case "attribute":
				result[1]++;
				break;
			case "tag":
				result[2]++;
				break;
			case "pseudo": {
				let name = node.value.toLowerCase();

				if (name.startsWith("::") || LEGACY_PSEUDO_ELEMENTS.has(name)) {
					result[2]++;
				}
				else if (name === ":where") {
					// contributes nothing
				}
				else if (MAX_OF_ARGS.has(name)) {
					let max = [0, 0, 0];

					for (let inner of node.nodes) {
						let s = specificityOf(inner);

						if ((s[0] - max[0] || s[1] - max[1] || s[2] - max[2]) > 0) {
							max = s;
						}
					}

					result = result.map((v, i) => v + max[i]);
				}
				else {
					result[1]++;
				}

				break;
			}
		}
	}

	return result;
}
