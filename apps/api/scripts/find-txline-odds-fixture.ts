import { config } from "../src/config";

type Fixture = {
  FixtureId: number;
  Competition?: string;
  Participant1?: string;
  Participant2?: string;
  StartTime?: number;
};

async function getGuestJwt() {
  const response = await fetch(`${config.txlineApiBaseUrl}/auth/guest/start`, {
    method: "POST",
    headers: { Accept: "application/json" },
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

async function txlineGet(path: string, jwt: string) {
  const response = await fetch(`${config.txlineApiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": config.txlineApiKey,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  return {
    status: response.status,
    ok: response.ok,
    data,
    preview: text.slice(0, 1000),
  };
}

async function main() {
  console.log("Base URL:", config.txlineApiBaseUrl);
  console.log("API token loaded:", config.txlineApiKey.length > 20);

  const jwt = await getGuestJwt();

  console.log("Guest JWT loaded:", jwt.length > 20);
  console.log("");

  const fixturesResult = await txlineGet("/api/fixtures/snapshot", jwt);

  if (!fixturesResult.ok || !Array.isArray(fixturesResult.data)) {
    console.log("Fixtures failed:", fixturesResult.status);
    console.log(fixturesResult.preview);
    return;
  }

  const fixtures = fixturesResult.data as Fixture[];

  console.log("Fixtures found:", fixtures.length);
  console.log("Scanning first 60 fixtures for odds...");
  console.log("");

  for (const fixture of fixtures.slice(0, 60)) {
    const label = `${fixture.Competition ?? "Unknown"} | ${fixture.Participant1 ?? "T1"} vs ${fixture.Participant2 ?? "T2"} | FixtureId ${fixture.FixtureId}`;

    const oddsResult = await txlineGet(`/api/odds/snapshot/${fixture.FixtureId}`, jwt);

    const count = Array.isArray(oddsResult.data) ? oddsResult.data.length : 0;

    console.log(`${count > 0 ? "FOUND" : "empty"} | odds=${count} | ${label}`);

    if (count > 0) {
      console.log("");
      console.log("Selected fixture with odds:");
      console.log(label);
      console.log("");
      console.log("Odds preview:");
      console.log(JSON.stringify(oddsResult.data, null, 2).slice(0, 5000));
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log("");
  console.log("No odds found in first 60 fixtures.");
  console.log("Next step: we will test odds updates/stream endpoint.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
