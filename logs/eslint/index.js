module.exports = {
  rules: {
    "no-logs-in-component-scope": require("./rules/no-logs-in-component-scope"),
    "prefer-log-over-console": require("./rules/prefer-log-over-console"),
    "require-log-message-prefix": require("./rules/require-log-message-prefix")
  },
  configs: {
    recommended: {
      plugins: ["logs-transform"],
      rules: {
        "logs-transform/no-logs-in-component-scope": "warn",
        "logs-transform/prefer-log-over-console": "warn",
        "logs-transform/require-log-message-prefix": "warn"
      }
    }
  }
};