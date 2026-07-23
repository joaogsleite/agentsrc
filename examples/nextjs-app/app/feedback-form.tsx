"use client"

import { FormEvent, useState } from "react"

type SubmissionState = "idle" | "sending" | "sent" | "failed"

export function FeedbackForm() {
  const [state, setState] = useState<SubmissionState>("idle")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setState("sending")

    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewer: data.get("reviewer"),
        area: data.get("area"),
        feedback: data.get("feedback"),
      }),
    }).catch(() => null)

    if (!response?.ok) {
      setState("failed")
      return
    }

    form.reset()
    setState("sent")
  }

  return (
    <form className="feedback-form" onSubmit={submit}>
      <label>
        Your name
        <input name="reviewer" required maxLength={80} placeholder="Alex Morgan" />
      </label>
      <label>
        Review area
        <select name="area" defaultValue="">
          <option value="">Choose an area</option>
          <option>First-run experience</option>
          <option>Reporting</option>
          <option>Mobile behavior</option>
        </select>
      </label>
      <label>
        What would make this easier to use?
        <textarea name="feedback" required maxLength={2_000} rows={5} placeholder="Be specific about the moment that felt unclear." />
      </label>
      <div className="form-footer">
        <p aria-live="polite">
          {state === "sent" ? "Feedback received. Thank you." : null}
          {state === "failed" ? "We could not send that feedback. Please retry." : null}
        </p>
        <button disabled={state === "sending"} type="submit">
          {state === "sending" ? "Sending..." : "Send feedback"}
        </button>
      </div>
    </form>
  )
}
