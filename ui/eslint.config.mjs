import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
