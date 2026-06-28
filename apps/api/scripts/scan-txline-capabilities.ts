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

  const count = Array.isArray(data) ? data.length : data ? 1 : 0;

  return {
    path,
    status: response.status,
    ok: response.ok,
    count,
    preview: text.slice(0, 600),
    data,
  };
}

function toEpochDay(timestampMs: number) {
  return Math.floor(timestampMs / 86400000);
}

function toHourOfDay(timestampMs: number) {
  return new Date(timestampMs).getUTCHours();
}

async function main() {
  console.log("Base URL:", config.txlineApiBaseUrl);
  console.log("API token loaded:", config.txlineApiKey.length > 20);

  const jwt = await getGuestJwt();
  console.log("Guest JWT loaded:", jwt.length > 20);
  console.log("");

  const fixturesResult = await txlineGet("/api/fixtures/snapshot", jwt);

  console.log("FIXTURES SNAPSHOT");
  console.log("Status:", fixturesResult.status);
  console.log("Count:", fixturesResult.count);
  console.log("");

  if (!Array.isArray(fixturesResult.data)) {
    console.log("Fixtures preview:");
    console.log(fixturesResult.preview);
    return;
  }

  const fixtures = fixturesResult.data as Fixture[];

  const candidates = fixtures.slice(0, 8);

  for (const fixture of candidates) {
    const label = `${fixture.Competition ?? "Unknown"} | ${fixture.Participant1 ?? "T1"} vs ${fixture.Participant2 ?? "T2"} | ${fixture.FixtureId}`;

    console.log("=================================================");
    console.log(label);

    const endpoints = [
      `/api/odds/snapshot/${fixture.FixtureId}`,
      `/api/odds/updates/${fixture.FixtureId}`,
      `/api/scores/snapshot/${fixture.FixtureId}`,
      `/api/scores/updates/${fixture.FixtureId}`,
      `/api/scores/historical/${fixture.FixtureId}`,
    ];

    for (const endpoint of endpoints) {
      const result = await txlineGet(endpoint, jwt);

      console.log(`${result.ok ? "OK" : "NO"} | ${result.status} | count=${result.count} | ${endpoint}`);

      if (result.ok && result.count > 0) {
        console.log("Preview:");
        console.log(result.preview);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (fixture.StartTime) {
      const epochDay = toEpochDay(fixture.StartTime);
      const hour = toHourOfDay(fixture.StartTime);
      const interval = 0;

      const historicalEndpoints = [
        `/api/odds/updates/${epochDay}/${hour}/${interval}`,
        `/api/scores/updates/${epochDay}/${hour}/${interval}`,
      ];

      for (const endpoint of historicalEndpoints) {
        const result = await txlineGet(endpoint, jwt);

        console.log(`${result.ok ? "OK" : "NO"} | ${result.status} | count=${result.count} | ${endpoint}`);

        if (result.ok && result.count > 0) {
          console.log("Preview:");
          console.log(result.preview);
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log("");
  }

  console.log("Capability scan done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
