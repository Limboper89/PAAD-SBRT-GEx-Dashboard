// test_worker_payload.ts - Test Cloudflare Worker API Payload Keys

const endpoint = "https://paad-groq-proxy.kumarprincebt.workers.dev/api/chat";

async function testPayloads() {
  const testSys = "You are PDACopilot. Answer biological questions directly.";
  const testUser = "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?";

  const payloadOptions = [
    { name: "{ message, system_prompt }", body: { message: testUser, system_prompt: testSys } },
    { name: "{ user_message, system_prompt }", body: { user_message: testUser, system_prompt: testSys } },
    { name: "{ prompt, system_prompt }", body: { prompt: testUser, system_prompt: testSys } },
    { name: "{ question, system_prompt }", body: { question: testUser, system_prompt: testSys } },
    { name: "{ query, system_prompt }", body: { query: testUser, system_prompt: testSys } },
    {
      name: "{ messages: [system, user] }",
      body: {
        messages: [
          { role: "system", content: testSys },
          { role: "user", content: testUser }
        ]
      }
    },
    { name: "{ text }", body: { text: testUser } },
    { name: "{ input }", body: { input: testUser } }
  ];

  for (const opt of payloadOptions) {
    console.log(`\nTesting payload format: ${opt.name}`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opt.body)
      });
      const data: any = await res.json();
      console.log(`Status: ${res.status}`);
      console.log(`Reply: "${data.reply || JSON.stringify(data)}"`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
  }
}

testPayloads();
