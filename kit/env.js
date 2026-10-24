// CONTRACT: requireEnv("A", "B") returns {A, B} or throws a clear error naming missing / placeholder keys.
import "dotenv/config";

export const isPlaceholder = (v) => !v || v.includes("...") || v.includes("example.com") || v.startsWith("+1555") || /^1234567/.test(v);

export function requireEnv(...keys) {
  const bad = keys.filter((k) => isPlaceholder(process.env[k]));
  if (bad.length) throw new Error(`missing or placeholder in .env: ${bad.join(", ")}`);
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}

// For CLI blocks: print the error as one line and exit 1, no stack trace.
export async function cli(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}
