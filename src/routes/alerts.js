const express = require('express');
const router = express.Router();
const state = require('../state');

router.get('/', (req, res) => {
  // Return exactly the state.alerts array without dynamic mutation
  // to ensure perfectly consistent ground truth with webhook payloads.
  res.json(state.alerts);
});

module.exports = router;
