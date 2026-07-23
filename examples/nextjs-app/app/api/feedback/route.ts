import { NextResponse } from "next/server"

type Feedback = {
  area: string
  feedback: string
  reviewer: string
}

function isFeedback(value: unknown): value is Feedback {
  if (!value || typeof value !== "object") return false
  const feedback = value as Record<string, unknown>
  return typeof feedback.reviewer === "string" && feedback.reviewer.length > 0 && feedback.reviewer.length <= 80
    && typeof feedback.area === "string" && feedback.area.length <= 120
    && typeof feedback.feedback === "string" && feedback.feedback.length > 0 && feedback.feedback.length <= 2_000
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!isFeedback(body)) return NextResponse.json({ error: "Invalid feedback payload." }, { status: 400 })

  // Replace this boundary with the application's authenticated persistence layer.
  console.info("Feedback received", { area: body.area, reviewer: body.reviewer })
  return NextResponse.json({ received: true }, { status: 201 })
}
