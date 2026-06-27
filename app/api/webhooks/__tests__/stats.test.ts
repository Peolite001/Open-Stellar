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

describe("GET /api/webhooks/:id/stats", () => {
  it("returns 404 for unknown webhook", async () => {
    const res = await fetch("http://localhost:3000/api/webhooks/wh_unknown/stats")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("Webhook not found")
  })

  it("returns zeroed stats for webhook with no deliveries", async () => {
    const webhook = createWebhookRegistration({
      url: "https://example.com/hook",
      events: ["agent.status"],
    })

    const res = await fetch(`http://localhost:3000/api/webhooks/${webhook.id}/stats`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toEqual({
      webhookId: webhook.id,
      totalDeliveries: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      lastDeliveryAt: null,
      lastSuccessAt: null,
      avgLatencyMs: 0,
    })
  })

  it("returns computed stats for webhook with deliveries", async () => {
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

    const res = await fetch(`http://localhost:3000/api/webhooks/${webhook.id}/stats`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.totalDeliveries).toBe(2)
    expect(body.successCount).toBe(1)
    expect(body.failureCount).toBe(1)
    expect(body.successRate).toBe(0.5)
    expect(body.avgLatencyMs).toBe(2550)
  })
})