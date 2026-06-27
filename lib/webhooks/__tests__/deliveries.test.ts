import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  appendWebhookDeliveryAttempt,
  resetWebhookDeliveryLogForTests,
  setWebhookDeliveryLogPathForTests,
  resetWebhookDeliveryLogPathForTests,
} from "@/lib/webhooks/delivery-log"
import {
  createWebhookRegistration,
  resetWebhookStoreForTests,
  setWebhookStorePathForTests,
  resetWebhookStorePathForTests,
} from "@/lib/webhooks/store"

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "webhook-api-test-"))
  setWebhookDeliveryLogPathForTests(join(testDir, "delivery-log.jsonl"))
  setWebhookStorePathForTests(join(testDir, "webhooks.json"))
})

afterEach(() => {
  resetWebhookDeliveryLogForTests()
  resetWebhookDeliveryLogPathForTests()
  resetWebhookStoreForTests()
  resetWebhookStorePathForTests()
  rmSync(testDir, { recursive: true, force: true })
})

describe("GET /api/webhooks/:id/deliveries", () => {
  it("returns 404 for unknown webhook", async () => {
    const res = await fetch("http://localhost:3000/api/webhooks/wh_unknown/deliveries")
    expect(res.status).toBe(404)
  })

  it("returns empty deliveries for webhook with no attempts", async () => {
    const webhook = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    const res = await fetch(`http://localhost:3000/api/webhooks/${webhook.id}/deliveries`)
    const body = await res.json()
    expect(body.deliveries).toEqual([])
  })

  it("filters by status=failure", async () => {
    const webhook = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    appendWebhookDeliveryAttempt({
      webhookId: webhook.id,
      event: "agent.status",
      deliveredAt: "2024-01-15T10:00:00.000Z",
      durationMs: 100,
      responseStatus: 200,
      ok: true,
      retried: false,
      attempt: 1,
      status: "success",
    })

    appendWebhookDeliveryAttempt({
      webhookId: webhook.id,
      event: "agent.status",
      deliveredAt: "2024-01-15T10:05:00.000Z",
      durationMs: 5000,
      responseStatus: null,
      ok: false,
      retried: false,
      attempt: 1,
      status: "failed",
    })

    const res = await fetch(
      `http://localhost:3000/api/webhooks/${webhook.id}/deliveries?status=failure`
    )
    const body = await res.json()

    expect(body.deliveries).toHaveLength(1)
    expect(body.deliveries[0].status).toBe("failure")
  })

  it("respects limit parameter", async () => {
    const webhook = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    for (let i = 0; i < 30; i++) {
      appendWebhookDeliveryAttempt({
        webhookId: webhook.id,
        event: "agent.status",
        deliveredAt: new Date(2024, 0, 15, 10, i).toISOString(),
        durationMs: 100,
        responseStatus: 200,
        ok: true,
        retried: false,
        attempt: 1,
        status: "success",
      })
    }

    const res = await fetch(
      `http://localhost:3000/api/webhooks/${webhook.id}/deliveries?limit=5`
    )
    const body = await res.json()

    expect(body.deliveries).toHaveLength(5)
  })
})