const state = require('../state');
const { getIsoDate } = require('../utils');
const { evaluateAlerts } = require('./alerts');

async function performChecks() {
  if (state.proxies.size === 0) return;

  const currentProxies = Array.from(state.proxies.values());
  const checkPromises = currentProxies.map(async (proxy) => {
    const checkTime = getIsoDate();
    let isUp = false;
    let statusCode = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), state.config.request_timeout_ms);
      
      const response = await fetch(proxy.url, { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      statusCode = response.status;
      if (response.status >= 200 && response.status < 300) {
        isUp = true;
      } else {
        isUp = false;
      }
    } catch (err) {
      isUp = false;
    }

    const newStatus = isUp ? "up" : "down";
    proxy.status = newStatus;
    proxy.last_checked_at = checkTime;
    proxy.total_checks++;
    if (isUp) {
       proxy.successful_checks++;
       proxy.consecutive_failures = 0;
    } else {
       proxy.consecutive_failures++;
    }
    proxy.history.push({ checked_at: checkTime, status: newStatus });
    state.metrics.total_checks++;
  });

  await Promise.allSettled(checkPromises);
  evaluateAlerts();
}

async function monitoringLoop(version) {
  if (version !== state.monitoring.monitorVersion) return;
  
  if (state.monitoring.isMonitoring) {
      state.monitoring.checkTimeout = setTimeout(() => monitoringLoop(version), 1000);
      return;
  }
  
  state.monitoring.isMonitoring = true;
  await performChecks();
  state.monitoring.isMonitoring = false;
  
  if (version === state.monitoring.monitorVersion) {
    state.monitoring.checkTimeout = setTimeout(() => monitoringLoop(version), state.config.check_interval_seconds * 1000);
  }
}

function startMonitoring() {
  state.monitoring.monitorVersion++;
  if (state.monitoring.checkTimeout) clearTimeout(state.monitoring.checkTimeout);
  state.monitoring.checkTimeout = setTimeout(() => monitoringLoop(state.monitoring.monitorVersion), state.config.check_interval_seconds * 1000);
}

function triggerImmediateCheck() {
  state.monitoring.monitorVersion++;
  if (state.monitoring.checkTimeout) clearTimeout(state.monitoring.checkTimeout);
  setTimeout(() => monitoringLoop(state.monitoring.monitorVersion), 0);
}

module.exports = {
  startMonitoring,
  triggerImmediateCheck,
  performChecks
};
