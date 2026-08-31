import fs from "node:fs";
import postcss from "postcss";
import parser from "postcss-selector-parser";
import { applyAliases } from "./util/helpers.js";

const daisyui = fs.readFileSync(new URL("./fixtures/daisyui.css", import.meta.url), "utf8");

export default {
	name: "Real-world stylesheet smoke test (daisyUI, i.e. Tailwind v4 compiler output)",
	description:
		"Modern CSS at scale — @layer, @property, :is/:where/:has, @scope — parses, transforms, re-parses cleanly, and stays idempotent",
	run () {
		// applyAliases throws if the output isn't idempotent
		let out = applyAliases(daisyui, { ".my-btn": ".btn", ".my-link": "a" });
		let root = postcss.parse(out);
		let rules = 0;

		root.walkRules(rule => {
			parser().astSync(rule.selector);
			rules++;
		});

		return {
			aliased: out.includes(":is(.btn, :where(.my-btn))"),
			reparsedRules: rules > 1000,
		};
	},
	expect: { aliased: true, reparsedRules: true },
};
