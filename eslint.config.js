// eslint.config.js
export default [
  {
    languageOptions: {
      globals: {
        game: "readonly",
        ui: "readonly",
        canvas: "readonly",
        Hooks: "readonly",
        CONFIG: "readonly",
        foundry: "readonly",
        CONST: "readonly"
      }
    }
  }
];