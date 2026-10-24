// analyzeFrame(image, rules) -> {violation, rule_id, description, confidence, bbox_hint}
import fs from "node:fs";
import { z } from "zod";
import { askJSON } from "./claude.js";

const Verdict = z.object({
  violation: z.boolean(),
  rule_id: z.string().nullable(), // null when no violation
  description: z.string(), // one line, what is (or isn't) happening
  confidence: z.number(), // 0..1
  bbox_hint: z.string().nullable(), // rough location, e.g. "center-right, person's left hand"
});

const SYSTEM = `You are a factory-floor CCTV safety monitor. You get one camera frame and a list of safety rules.
Decide whether the frame shows a violation of any rule. Only flag what is actually visible; do not guess about things out of frame.
If several rules are violated, report the most severe one.
Fields:
- violation: true only if a rule is clearly broken in this frame.
- rule_id: the id of the violated rule, or null.
- description: one short sentence describing what you see that matters for the rules.
- confidence: 0 to 1, how sure you are of the violation verdict.
- bbox_hint: where in the frame the violation is (e.g. "lower-left, worker's right hand"), or null.`;

const providers = {
  claude: async (jpeg, rules) =>
    askJSON({
      system: SYSTEM,
      schema: Verdict,
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        { type: "text", text: `Rules:\n${JSON.stringify(rules, null, 2)}` },
      ],
    }),
  // qwen: no QWEN/DASHSCOPE key in .env, so skipped. Add a function with the same (jpeg, rules) signature here.
};

export async function analyzeFrame(image, rules, provider = process.env.VISION_PROVIDER || "claude") {
  const jpeg = Buffer.isBuffer(image) ? image : fs.readFileSync(image);
  const v = await providers[provider](jpeg, rules);
  v.confidence = Math.max(0, Math.min(1, v.confidence));
  return v;
}

// CLI: node vision/analyze.js <image.jpg> [rules.json]
if (import.meta.filename === process.argv[1]) {
  const [img = "vision/out/frame_0.jpg", rulesPath = "vision/rules/phone.json"] = process.argv.slice(2);
  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  const t0 = Date.now();
  console.log(JSON.stringify(await analyzeFrame(img, rules), null, 2));
  console.log(`(${Date.now() - t0} ms)`);
}
