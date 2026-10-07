const axios = require('axios');
async function run() {
  const r1 = await axios.get('http://localhost:3001/api/demand');
  const r2 = await axios.get('http://localhost:3001/api/stock');
  const r3 = await axios.get('http://localhost:3001/api/recommendations');
  const r4 = await axios.get('http://localhost:3001/api/kpi');
  console.log('Demand:', r1.data.slice(0,2));
  console.log('Stock:', r2.data.slice(0,2));
  console.log('KPI:', r4.data);
}
run();
