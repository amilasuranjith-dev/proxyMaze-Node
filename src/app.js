const express = require('express');
const app = express();

app.use(express.json());

app.use('/health', require('./routes/health'));
app.use('/config', require('./routes/config'));
app.use('/proxies', require('./routes/proxies'));
app.use('/alerts', require('./routes/alerts'));
app.use('/webhooks', require('./routes/webhooks'));
app.use('/integrations', require('./routes/integrations'));
app.use('/metrics', require('./routes/metrics'));

module.exports = app;
