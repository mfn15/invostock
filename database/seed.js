require('dotenv').config();
const db = require('./db');
const runSeed = require('./seed-runner');

runSeed(db)
  .then(msg => console.log(msg))
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => db.end());
