const axios = require('axios');
async function run() {
  const r1 = await axios.get('http://localhost:3001/api/demand');
  const r2 = await axios.get('http://localhost:3001/api/stock');
  const r3 = await axios.get('http://localhost:3001/api/recommendations');
  const r4 = await axios.get('http://localhost:3001/api/kpi');
  const contextData = { demandRows: r1.data, stockRows: r2.data, recommendations: r3.data, metrics: r4.data };
  try {
     const res = await axios.post('http://localhost:3001/api/chat', { message: 'what is the weather in hosur', context: contextData });
     console.log('SUCCESS:', res.data);
  } catch(e) {
     console.error('ERROR:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}
run();
