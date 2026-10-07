async function run() {
  const res = await fetch('http://localhost:3001/api/recommendations');
  const data = await res.json();
  console.log(`Found ${data.length} pending recommendations.`);
  if (data.length > 0) {
    const id = data[0].id;
    console.log(`Approving ${id}...`);
    const postRes = await fetch(`http://localhost:3001/api/recommendations/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' })
    });
    const postText = await postRes.text();
    console.log(`Response: ${postRes.status} ${postText}`);
  }
}
run();
