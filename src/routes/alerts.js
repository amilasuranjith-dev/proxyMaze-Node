const express = require('express');
const router = express.Router();
const state = require('../state');

router.get('/', (req, res) => {
  if (state.activeAlert) {
     let downCount = 0;
     let failedIds = [];
     for (const p of state.proxies.values()) {
       if (p.status === "down") {
         downCount++;
         failedIds.push(p.id);
       }
     }
     const total = state.proxies.size;
     state.activeAlert.total_proxies = total;
     state.activeAlert.failed_proxies = downCount;
     state.activeAlert.failed_proxy_ids = failedIds;
     state.activeAlert.failure_rate = total === 0 ? 0 : downCount / total;
  }
  res.json(state.alerts);
});

module.exports = router;
