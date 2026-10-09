const fetch = require("node-fetch");

const headers = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN}`,
  apikey: "INSERT_TOKEN",
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function run() {
  const res = await fetch(`${BASE_URL}/cards?limit=1`, {headers});
  const data = await res.json();
  console.log(data);
}
run();
