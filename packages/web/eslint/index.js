module.exports = {
  rules: {
    "prefer-log-over-console": require("./rules/prefer-log-over-console")
  },
  configs: {
    recommended: {
      plugins: ["logs-transform"],
      rules: {
        "logs-transform/prefer-log-over-console": "warn"
      }
    }
  }
};