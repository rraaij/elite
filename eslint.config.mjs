import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Ignore generated and vendored paths so lint only checks authored TS files.
    ignores: ["**/dist/**", "**/node_modules/**", "sourcecode/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      // Enable type-aware linting across the workspace without listing every TSConfig.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Explicitly keep return types inferred for readability in app and package code.
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "no-console": "off",
    },
  },
);
