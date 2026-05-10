const express = require('express');
const router = express.Router();
const state = require('../state');
const { startMonitoring } = require('../services/monitoring');

router.post('/', (req, res) => {
  if (req.body.check_interval_seconds !== undefined) state.config.check_interval_seconds = req.body.check_interval_seconds;
  if (req.body.request_timeout_ms !== undefined) state.config.request_timeout_ms = req.body.request_timeout_ms;
  startMonitoring();
  res.json(state.config);
});

router.get('/', (req, res) => res.json(state.config));

module.exports = router;
