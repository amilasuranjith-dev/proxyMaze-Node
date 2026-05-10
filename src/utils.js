function getIsoDate() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { getIsoDate };
