const headers = {
  authorization: `Bearer ${process.env.SUPABASE_TOKEN}`,
  apikey: "TOKEN",
  "content-type": "application/json",
};
const BASE_URL = "https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1";

async function test() {
  const res = await fetch(`${BASE_URL}/user_cards?select=user_id&limit=5000`, {
    headers,
  });
  const data = await res.json();
  const userIds = new Set(data.map((d) => d.user_id));
  console.log("Distinct user IDs in user_cards:", [...userIds]);

  // also get my id
  const resTags = await fetch(`${BASE_URL}/tags?select=user_id`, {headers});
  const dataTags = await resTags.json();
  const tagUserIds = new Set(dataTags.map((d) => d.user_id));
  console.log("Distinct user IDs in tags:", [...tagUserIds]);
}
test();
