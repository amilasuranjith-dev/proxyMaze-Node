const state = require('../state');

async function deliverWebhook(url, payload) {
  let attempt = 0;
  while (attempt < 3) {
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
      
      await res.text().catch(() => ''); // Consume body to prevent Node socket hangup/leaks
      
      if (res.status >= 500 || res.status === 408 || res.status === 429) {
        if (attempt < 3) {
          const backoff = attempt === 1 ? 100 : (attempt === 2 ? 500 : 1000);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        } else {
          console.error(`Webhook delivery final failure (${res.status}): ${url}`);
        }
      } else {
        if (res.status >= 200 && res.status < 300) {
          console.log(`Webhook delivered successfully to ${url}`);
          state.metrics.webhook_deliveries++;
        } else {
          console.error(`Webhook non-retryable failure (${res.status}): ${url}`);
        }
        break;
      }
      break;
    } catch (e) {
      if (attempt < 3) {
        const backoff = attempt === 1 ? 100 : (attempt === 2 ? 500 : 1000);
        await new Promise(r => setTimeout(r, backoff));
      } else {
        console.error(`Webhook delivery final attempt failed:`, e.message);
      }
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

function dispatchAll(stdPayload, eventName, alertData) {
  for (const wh of state.webhooks.values()) {
    deliverWebhook(wh.url, stdPayload).catch(e => console.error(e));
  }
  for (const integ of state.integrations) {
    if (integ.events.includes(eventName)) {
      if (integ.type === "slack") {
        deliverWebhook(integ.webhook_url, formatSlack(integ, eventName, alertData)).catch(e => console.error(e));
      } else if (integ.type === "discord") {
        deliverWebhook(integ.webhook_url, formatDiscord(integ, eventName, alertData)).catch(e => console.error(e));
      }
    }
  }
}

module.exports = {
  dispatchAll
};
