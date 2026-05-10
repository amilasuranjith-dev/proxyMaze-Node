const express = require('express');
const router = express.Router();
const state = require('../state');

router.post('/', (req, res) => {
  const { type, webhook_url, username, events } = req.body;
  const validEvents = events || ["alert.fired", "alert.resolved"];
  state.integrations.push({ type, webhook_url, username, events: validEvents });
  if (type === "slack" || type === "discord") {
    res.status(201).json({ type, webhook_url, username, events: validEvents });
  } else {
    res.status(400).json({ error: "Invalid integration type" });
  }
});

module.exports = router;
