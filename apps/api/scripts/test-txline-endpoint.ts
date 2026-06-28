import { config } from "../src/config";

async function getGuestJwt() {
  const response = await fetch(`${config.txlineApiBaseUrl}/auth/guest/start`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Guest auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("Guest auth did not return token.");
  }

  return data.token;
}

async function testEndpoint(path: string, jwt: string) {
  const url = `${config.txlineApiBaseUrl}${path}`;

  console.log("");
  console.log("Testing:", url);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": config.txlineApiKey,
      Accept: "application/json",
    },
  });

  console.log("Status:", response.status, response.statusText);

  const text = await response.text();
  console.log("Body preview:");
  console.log(text.slice(0, 3000));
}

async function main() {
  console.log("Base URL:", config.txlineApiBaseUrl);
  console.log("API token loaded:", config.txlineApiKey.length > 20);

  const jwt = await getGuestJwt();

  console.log("Guest JWT loaded:", jwt.length > 20);

  await testEndpoint("/api/fixtures/snapshot", jwt);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
