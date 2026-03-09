import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
    {
        ignores: [
            ".next/**",
            ".next-local/**",
            ".cache/**",
            "node_modules/**",
            ".venv/**",
            "backend_venv/**",
            "backend_venv_*/**",
            "**/__pycache__/**",
            "backend/**",
            "vercel-backend/**",
            "assets/**",
            "captures/**",
            "scenes/**",
            "uploads/**",
            "reconstruction_cache/**",
            "test-results/**",
            "contracts/**",
            "maps/**",
            "runbooks/**",
        ],
    },
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        files: ["src/app/mvp/**/*.{ts,tsx}", "src/components/Editor/**/*.{ts,tsx}", "src/lib/mvp-*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: ["tests/**/*.js"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
];
