const app = require('./src/app');
const { startMonitoring } = require('./src/services/monitoring');

const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`ProxyMaze listening on port ${port}`);
  startMonitoring();
});
