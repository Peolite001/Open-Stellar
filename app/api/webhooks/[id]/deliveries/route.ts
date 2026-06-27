import { NextResponse } from "next/server"
import { listWebhookDeliveries } from "@/lib/webhooks/delivery-log"
import { registerWebhookDeliveryListener } from "@/lib/webhooks/delivery"
import { getWebhookById } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

registerWebhookDeliveryListener()

type RouteContext = {
  params: Promise<{ id: string }>
}

function parseLimit(req: Request): number {
  const limit = new URL(req.url).searchParams.get("limit")
  if (!limit) return 20

  const parsed = Number.parseInt(limit, 10)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(Math.max(parsed, 1), 100)
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  const webhookId = decodeURIComponent(id)

  const webhook = getWebhookById(webhookId)
  if (!webhook) {
    return NextResponse.json(
      { ok: false, error: "Webhook not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get("status")

  const status =
    statusParam === "success" || statusParam === "failure"
      ? statusParam
      : undefined

  const limit = parseLimit(req)

  return NextResponse.json(
    { deliveries: listWebhookDeliveries(webhookId, { status, limit }) },
    { headers: { "Cache-Control": "no-store" } },
  )
}