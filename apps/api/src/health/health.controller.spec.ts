import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns a stable health payload for uptime checks", () => {
    const controller = new HealthController();

    expect(controller.health()).toEqual({
      ok: true,
      service: "zentory-api"
    });
  });
});
