const express = require('express');
const router = express.Router();
const state = require('../state');
const { v4: uuidv4 } = require('uuid');

router.post('/', (req, res) => {
  const whId = `wh-${uuidv4()}`;
  state.webhooks.set(whId, { url: req.body.url });
  res.status(201).json({
    webhook_id: whId,
    url: req.body.url
  });
});

module.exports = router;
