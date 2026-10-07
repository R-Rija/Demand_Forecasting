const axios = require('axios');
axios.get('http://localhost:3001/api/demand').then(r1 => {
  axios.get('http://localhost:3001/api/stock').then(r2 => {
    axios.get('http://localhost:3001/api/recommendations').then(r3 => {
      axios.get('http://localhost:3001/api/kpi').then(r4 => {
         const contextData = { demandRows: r1.data, stockRows: r2.data, recommendations: r3.data, metrics: r4.data };
         const payload = JSON.stringify({ message: 'what is the weather in hosur', context: contextData });
         console.log('Payload size bytes:', Buffer.byteLength(payload));
      });
    });
  });
});
