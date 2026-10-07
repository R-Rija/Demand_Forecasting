const axios = require('axios');
axios.post('http://localhost:3001/api/chat', { message: 'what is the weather in hosur', context: {} }).then(r => console.log(r.data)).catch(e => console.error(e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message));
