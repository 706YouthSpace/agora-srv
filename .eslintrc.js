module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
        '@typescript-eslint',
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    rules: {
        "no-undef": "warn",
        "semi": "off",
        "semi-style": ["error", "last"],
        "no-useless-catch": "off",
        "prefer-rest-params": "warn",
        "no-useless-escape": "warn",
        "no-prototype-builtins": "off",
        "no-extra-boolean-cast": "off",
        "@typescript-eslint/no-unused-vars": ["error", {
            "ignoreRestSiblings": true,
            "caughtErrorsIgnorePattern": "^_",
            "argsIgnorePattern": "^_"
        }],
        "@typescript-eslint/semi": ["error", "always"],
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off"
    },
    "env": {
        "browser": true,
        "node": true
    },
    "overrides": [
        {
            "files": ["*.ts"],
            "rules": {
                "no-undef": "off"
            }
        }
    ]
};
