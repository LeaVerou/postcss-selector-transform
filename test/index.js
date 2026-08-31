import selectorTransform from "./selector-transform.js";
import styleAliases from "./style-aliases.js";
import specificity from "./specificity.js";
import smoke from "./smoke.js";

export default {
	name: "All tests",
	tests: [selectorTransform, styleAliases, specificity, smoke],
};
