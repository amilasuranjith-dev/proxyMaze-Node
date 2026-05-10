module.exports = {
  config: {
    check_interval_seconds: 15,
    request_timeout_ms: 3000
  },
  proxies: new Map(),
  alerts: [],
  activeAlert: null,
  webhooks: new Map(),
  integrations: [],
  metrics: {
    total_checks: 0,
    webhook_deliveries: 0,
  },
  monitoring: {
    isMonitoring: false,
    checkTimeout: null,
    monitorVersion: 0
  }
};
