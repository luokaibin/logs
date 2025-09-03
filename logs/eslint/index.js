module.exports = {
  rules: {
    "prefer-log-over-console": require("./rules/prefer-log-over-console"),
    "no-logs-in-component-scope": require("./rules/no-logs-in-component-scope")
  },
  configs: {
    recommended: {
      plugins: ["logs-transform"],
      rules: {
        "logs-transform/prefer-log-over-console": "warn",
        "logs-transform/no-logs-in-component-scope": "warn"
      }
    }
  }
};