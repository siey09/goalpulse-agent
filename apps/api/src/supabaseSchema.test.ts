import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("odds snapshot archive schema", () => {
  it("removes legacy default service-role privileges before granting least privilege", () => {
    const schema = readFileSync(resolve(process.cwd(), "supabase-schema.sql"), "utf8");

    expect(schema).toMatch(
      /revoke all on table odds_snapshot_archive from service_role;[\s\S]*grant select, insert on table odds_snapshot_archive to service_role;/i
    );
  });
});
