const state = require('../state');

const transientErrors = [408, 429, 500, 502, 503, 504];

async function deliverWebhook(url, payload) {
  while (true) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const responseBody = await res.text().catch(() => ''); // Consume body to prevent Node socket hangup/leaks
      
      if (transientErrors.includes(res.status)) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      state.metrics.webhook_deliveries++;
      break;
    } catch (e) {
      console.error("Webhook fetch error:", e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function formatSlack(integ, eventName, alertData) {
  const fields = [
    { title: "Alert ID", value: alertData.alert_id },
    { title: "Failure Rate", value: alertData.failure_rate.toString() },
    { title: "Failed Proxies", value: alertData.failed_proxies.toString() },
    { title: "Threshold", value: "0.20" },
    { title: "Failed IDs", value: alertData.failed_proxy_ids.join(", ") || "None" },
    { title: "Fired At", value: alertData.fired_at }
  ];
  return {
    username: integ.username || "ProxyWatch",
    text: eventName === "alert.fired" ? "Alert Fired: Proxy pool failure rate exceeded" : "Alert Resolved: Proxy pool recovered",
    attachments: [
      {
        color: eventName === "alert.fired" ? "#FF0000" : "#00FF00",
        fields: fields,
        footer: "ProxyMaze Monitoring",
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };
}

function formatDiscord(integ, eventName, alertData) {
  const fields = [
    { name: "Alert ID", value: alertData.alert_id },
    { name: "Failure Rate", value: alertData.failure_rate.toString() },
    { name: "Failed Proxies", value: alertData.failed_proxies.toString() },
    { name: "Threshold", value: "0.20" },
    { name: "Failed IDs", value: alertData.failed_proxy_ids.join(", ") || "None" },
    { name: "Fired At", value: alertData.fired_at }
  ];
  return {
    username: integ.username || "ProxyWatch",
    embeds: [
      {
        title: eventName === "alert.fired" ? "Alert Fired" : "Alert Resolved",
        description: eventName === "alert.fired" ? "Proxy pool failure rate exceeded" : "Proxy pool recovered",
        color: eventName === "alert.fired" ? 16711680 : 65280,
        fields: fields,
        footer: {
          text: "ProxyMaze Monitoring"
        }
      }
    ]
  };
}

function dispatchAll(stdPayload, eventName, alertData) {
  for (const wh of state.webhooks.values()) {
    deliverWebhook(wh.url, stdPayload);
  }
  for (const integ of state.integrations) {
    if (integ.events.includes(eventName)) {
      if (integ.type === "slack") {
        deliverWebhook(integ.webhook_url, formatSlack(integ, eventName, alertData));
      } else if (integ.type === "discord") {
        deliverWebhook(integ.webhook_url, formatDiscord(integ, eventName, alertData));
      }
    }
  }
}

module.exports = {
  dispatchAll
};
