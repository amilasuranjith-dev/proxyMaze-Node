const state = require('../state');

const transientErrors = [500, 502, 503, 504];

async function deliverWebhook(url, payload) {
  let attempt = 0;
  while (true) {
    attempt++;
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
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 30000)));
        continue;
      }
      
      state.metrics.webhook_deliveries++;
      break;
    } catch (e) {
      console.error(`Webhook delivery attempt ${attempt} failed:`, e.message);
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 30000)));
    }
  }
}

function formatSlack(integ, eventName, alertData) {
  const isFired = eventName === "alert.fired";
  return {
    username: integ.username || "ProxyWatch",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: isFired ? "Alert Fired: Proxy pool failure rate exceeded" : "Alert Resolved: Proxy pool recovered"
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Alert ID:*\n${alertData.alert_id}` },
          { type: "mrkdwn", text: `*Failure Rate:*\n${alertData.failure_rate}` },
          { type: "mrkdwn", text: `*Failed Proxies:*\n${alertData.failed_proxies}` },
          { type: "mrkdwn", text: `*Threshold:*\n0.20` },
          { type: "mrkdwn", text: `*Failed IDs:*\n${(alertData.failed_proxy_ids && alertData.failed_proxy_ids.length > 0) ? alertData.failed_proxy_ids.join(", ") : "None"}` },
          { type: "mrkdwn", text: `*Fired At:*\n${alertData.fired_at}` }
        ]
      }
    ]
  };
}

function formatDiscord(integ, eventName, alertData) {
  const isFired = eventName === "alert.fired";
  return {
    username: integ.username || "ProxyWatch",
    embeds: [
      {
        title: isFired ? "Alert Fired" : "Alert Resolved",
        description: isFired ? "Proxy pool failure rate exceeded" : "Proxy pool recovered",
        color: isFired ? 16711680 : 65280,
        fields: [
          { name: "Alert ID", value: String(alertData.alert_id), inline: true },
          { name: "Failure Rate", value: String(alertData.failure_rate), inline: true },
          { name: "Failed Proxies", value: String(alertData.failed_proxies), inline: true },
          { name: "Threshold", value: "0.20", inline: true },
          { name: "Failed IDs", value: (alertData.failed_proxy_ids && alertData.failed_proxy_ids.length > 0) ? alertData.failed_proxy_ids.join(", ") : "None", inline: false },
          { name: "Fired At", value: String(alertData.fired_at), inline: false }
        ],
        footer: {
          text: "ProxyMaze Monitoring"
        }
      }
    ]
  };
}

async function dispatchAll(stdPayload, eventName, alertData) {
  const promises = [];
  for (const wh of state.webhooks.values()) {
    promises.push(deliverWebhook(wh.url, stdPayload));
  }
  for (const integ of state.integrations) {
    if (integ.events.includes(eventName)) {
      if (integ.type === "slack") {
        promises.push(deliverWebhook(integ.webhook_url, formatSlack(integ, eventName, alertData)));
      } else if (integ.type === "discord") {
        promises.push(deliverWebhook(integ.webhook_url, formatDiscord(integ, eventName, alertData)));
      }
    }
  }
  await Promise.allSettled(promises);
}

module.exports = {
  dispatchAll
};
