import { applyAliases, specificity } from "./util/helpers.js";

const ALIASES = {
	".callout-title": "h4",
	"#special .thing": "h4",
	".linkish": "a.button",
	".pressed": "button[aria-pressed]",
};

export default {
	name: "Wrapped rules keep the original selector's specificity",
	description:
		"Aliases live in :where(), so the wrapper's specificity must equal the wrapped original's",
	run (selector) {
		let out = applyAliases(`${selector} {}`, ALIASES);
		return specificity(out.slice(0, out.lastIndexOf(" {}")));
	},
	getExpect (selector) {
		return specificity(selector);
	},
	tests: [
		{ arg: "h4" },
		{ arg: "main h4 > code" },
		{ arg: "h4.tip:hover::before" },
		{ arg: "a.button.large" },
		{ arg: "#nav h4" },
		{ arg: ":not(h4)" },
		{ arg: "li:nth-child(2n) a.button" },
	],
};
