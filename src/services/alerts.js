const state = require('../state');
const { v4: uuidv4 } = require('uuid');
const { getIsoDate } = require('../utils');
const { dispatchAll } = require('./webhooks');

async function fireAlert(failureRate, total, downCount, failedIds) {
  const alertId = `alert-${uuidv4()}`;
  const now = getIsoDate();
  
  const newAlert = {
    alert_id: alertId,
    status: "active",
    failure_rate: failureRate,
    total_proxies: total,
    failed_proxies: downCount,
    failed_proxy_ids: failedIds,
    threshold: 0.20,
    fired_at: now,
    resolved_at: null,
    message: "Proxy pool failure rate exceeded threshold"
  };
  
  state.activeAlert = newAlert;
  state.alerts.push(state.activeAlert);

  const stdPayload = {
    event: "alert.fired",
    alert_id: alertId,
    fired_at: now,
    failure_rate: failureRate,
    total_proxies: total,
    failed_proxies: downCount,
    failed_proxy_ids: failedIds,
    threshold: 0.20,
    message: state.activeAlert.message
  };

  dispatchAll(stdPayload, "alert.fired", state.activeAlert);
}

async function resolveAlert() {
  const now = getIsoDate();
  state.activeAlert.status = "resolved";
  state.activeAlert.resolved_at = now;
  const resolvedId = state.activeAlert.alert_id;
  const stdPayload = {
    event: "alert.resolved",
    alert_id: resolvedId,
    resolved_at: now
  };
  
  const snapshot = { ...state.activeAlert };
  state.activeAlert = null;
  
  dispatchAll(stdPayload, "alert.resolved", snapshot);
}

async function evaluateAlerts() {
  const total = state.proxies.size;
  if (total === 0) {
    if (state.activeAlert) await resolveAlert();
    return;
  }

  let downCount = 0;
  let failedIds = [];
  for (const proxy of state.proxies.values()) {
    if (proxy.status === "down") {
      downCount++;
      failedIds.push(proxy.id);
    }
  }

  const failureRate = downCount / total;

  if (failureRate >= 0.20) {
    if (!state.activeAlert) {
      await fireAlert(failureRate, total, downCount, failedIds);
    } else {
      state.activeAlert.failure_rate = failureRate;
      state.activeAlert.total_proxies = total;
      state.activeAlert.failed_proxies = downCount;
      state.activeAlert.failed_proxy_ids = failedIds;
      state.activeAlert.updated_at = getIsoDate();
    }
  } else {
    if (state.activeAlert) {
      await resolveAlert();
    }
  }
}

module.exports = {
  evaluateAlerts,
  fireAlert,
  resolveAlert
};
