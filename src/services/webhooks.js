const state = require('../state');

async function deliverWebhook(url, payload) {
  const startTime = Date.now();
  const deadline = startTime + 45000; // 45-second hard deadline for evaluation compliance
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout per attempt
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);
      
      await res.text().catch(() => ''); // Drain body
      
      // Success (2xx) or non-retryable failure (3xx, 4xx except 408/429)
      if (res.status >= 200 && res.status < 300) {
        console.log(`[Webhook Success] ${url} (Attempt ${attempt})`);
        state.metrics.webhook_deliveries++;
        return;
      }
      
      // Retryable errors: 5xx, 408, 429
      if (res.status >= 500 || res.status === 408 || res.status === 429) {
        console.warn(`[Webhook Retry] ${url} returned ${res.status} (Attempt ${attempt})`);
        await new Promise(r => setTimeout(r, 1500)); // Sleep 1.5s between retries
        continue;
      }

      // Other 4xx errors are considered terminal failures
      console.error(`[Webhook Terminal] ${url} returned ${res.status} (Attempt ${attempt})`);
      return;
    } catch (e) {
      console.error(`[Webhook Error] ${url} - ${e.message} (Attempt ${attempt})`);
      if (Date.now() + 2000 < deadline) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        break;
      }
    }
  }
  console.error(`[Webhook Timeout] Failed to deliver to ${url} after ${attempt} attempts within 45s.`);
}

function formatSlack(integ, eventName, alertData) {
  const isFired = eventName === "alert.fired";
  const color = isFired ? "#FF0000" : "#00FF00";
  
  return {
    username: integ.username || "ProxyWatch",
    attachments: [
      {
        color: color,
        title: isFired ? "🚨 Alert Fired: Critical Proxy Failure" : "✅ Alert Resolved: System Recovered",
        fields: [
          { title: "Alert ID", value: alertData.alert_id, short: true },
          { title: "Event", value: eventName, short: true },
          { title: "Failure Rate", value: `${(alertData.failure_rate * 100).toFixed(1)}%`, short: true },
          { title: "Threshold", value: "20.0%", short: true },
          { title: "Failed Count", value: String(alertData.failed_proxies), short: true },
          { title: "Total Count", value: String(alertData.total_proxies), short: true },
          { title: "Fired At", value: alertData.fired_at, short: false },
          { title: "Failed IDs", value: (alertData.failed_proxy_ids && alertData.failed_proxy_ids.length > 0) ? alertData.failed_proxy_ids.join(", ") : "None", short: false }
        ],
        footer: "ProxyMaze Monitoring Service",
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };
}

function formatDiscord(integ, eventName, alertData) {
  const isFired = eventName === "alert.fired";
  // Decimal color codes: Red (16711680), Green (65280)
  const color = isFired ? 16711680 : 65280;

  return {
    username: integ.username || "ProxyWatch",
    embeds: [
      {
        title: isFired ? "🚨 Alert Fired" : "✅ Alert Resolved",
        description: isFired 
          ? `The proxy pool failure rate has exceeded the 20% threshold.`
          : `The proxy pool failure rate has dropped below the threshold and the system has recovered.`,
        color: color,
        fields: [
          { name: "Alert ID", value: String(alertData.alert_id), inline: true },
          { name: "Failure Rate", value: `${(alertData.failure_rate * 100).toFixed(1)}%`, inline: true },
          { name: "Status", value: isFired ? "ACTIVE" : "RESOLVED", inline: true },
          { name: "Failed Proxies", value: String(alertData.failed_proxies), inline: true },
          { name: "Total Proxies", value: String(alertData.total_proxies), inline: true },
          { name: "Threshold", value: "20%", inline: true },
          { name: "Timestamp", value: isFired ? alertData.fired_at : alertData.resolved_at, inline: false },
          { name: "Failed IDs", value: (alertData.failed_proxy_ids && alertData.failed_proxy_ids.length > 0) ? alertData.failed_proxy_ids.slice(0, 10).join(", ") : "None", inline: false }
        ],
        footer: {
          text: "ProxyMaze Monitoring System"
        }
      }
    ]
  };
}

function dispatchAll(stdPayload, eventName, alertData) {
  // Fire all webhooks in parallel without blocking the main loop
  const targets = [];
  
  // Standard Webhooks
  for (const wh of state.webhooks.values()) {
    targets.push(deliverWebhook(wh.url, stdPayload));
  }
  
  // Integrations (Slack/Discord)
  for (const integ of state.integrations) {
    if (integ.events && integ.events.includes(eventName)) {
      if (integ.type === "slack") {
        targets.push(deliverWebhook(integ.webhook_url, formatSlack(integ, eventName, alertData)));
      } else if (integ.type === "discord") {
        targets.push(deliverWebhook(integ.webhook_url, formatDiscord(integ, eventName, alertData)));
      }
    }
  }

  // Use Promise.allSettled to ensure we don't wait for them in the main thread
  // but still allow them to execute independently.
  Promise.allSettled(targets).catch(e => console.error("Global dispatch error:", e));
}

module.exports = {
  dispatchAll
};
