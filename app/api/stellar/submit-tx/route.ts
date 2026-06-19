import { NextResponse } from "next/server"
import * as StellarSdk from "@stellar/stellar-sdk"

const HORIZON = "https://horizon-testnet.stellar.org"

export async function POST(req: Request) {
  try {
    const { signedXdr } = await req.json()
    if (!signedXdr) return NextResponse.json({ error: "Missing signedXdr" }, { status: 400 })

    const server = new StellarSdk.Horizon.Server(HORIZON)
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      StellarSdk.Networks.TESTNET
    )
    const result = await server.submitTransaction(transaction)
    const hash = (result as { hash?: string }).hash
    if (!hash) {
      return NextResponse.json({ error: "Transaction submitted but no hash returned" }, { status: 502 })
    }
    return NextResponse.json({ ok: true, hash })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
