const express = require('express');
const router = express.Router();
const state = require('../state');
const { evaluateAlerts } = require('../services/alerts');
const { triggerImmediateCheck } = require('../services/monitoring');

router.post('/', (req, res) => {
  const proxyUrls = req.body.proxies;
  const replace = req.body.replace;
  
  if (!proxyUrls || !Array.isArray(proxyUrls)) {
    return res.status(400).json({ error: "Missing or invalid proxies array" });
  }

  if (replace) {
    state.proxies.clear();
  }
  
  const acceptedProxies = [];
  
  for (const urlStr of proxyUrls) {
    let id;
    try {
      const u = new URL(urlStr);
      const parts = u.pathname.split('/').filter(p => p);
      id = parts[parts.length - 1];
    } catch (e) {
      const parts = urlStr.split('/').filter(p => p);
      id = parts[parts.length - 1];
    }
    
    const newProxy = {
      id,
      url: urlStr,
      status: "pending",
      last_checked_at: null,
      consecutive_failures: 0,
      total_checks: 0,
      successful_checks: 0,
      history: []
    };
    state.proxies.set(id, newProxy);
    
    acceptedProxies.push({ id: newProxy.id, url: newProxy.url, status: newProxy.status });
  }
  
  triggerImmediateCheck();

  res.status(201).json({
    accepted: proxyUrls.length,
    proxies: acceptedProxies
  });
});

router.get('/', (req, res) => {
  let up = 0, down = 0;
  const proxyList = [];
  
  for (const p of state.proxies.values()) {
    if (p.status === "up") up++;
    if (p.status === "down") down++;
    
    proxyList.push({
      id: p.id,
      url: p.url,
      status: p.status,
      last_checked_at: p.last_checked_at,
      consecutive_failures: p.consecutive_failures
    });
  }
  
  const total = state.proxies.size;
  const failure_rate = total === 0 ? 0 : (down / total);
  
  res.json({
    total,
    up,
    down,
    failure_rate,
    proxies: proxyList
  });
});

router.get('/:id', (req, res) => {
  const p = state.proxies.get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  
  const uptime_percentage = p.total_checks === 0 ? 0 : (p.successful_checks / p.total_checks * 100);
  
  res.json({
    id: p.id,
    url: p.url,
    status: p.status,
    last_checked_at: p.last_checked_at,
    consecutive_failures: p.consecutive_failures,
    total_checks: p.total_checks,
    uptime_percentage: parseFloat(uptime_percentage.toFixed(1)),
    history: p.history
  });
});

router.get('/:id/history', (req, res) => {
  const p = state.proxies.get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p.history);
});

router.delete('/', async (req, res) => {
  state.proxies.clear();
  await evaluateAlerts(); 
  res.status(204).send();
});

module.exports = router;
