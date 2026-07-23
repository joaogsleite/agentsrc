import { FeedbackForm } from "./feedback-form"

const checkpoints = [
  { label: "Scope", value: "3 flows", detail: "Welcome, reporting, and mobile navigation" },
  { label: "Reviewers", value: "8 invited", detail: "Product, support, and two design partners" },
  { label: "Window", value: "48 hours", detail: "Closes Thursday at 16:00 UTC" },
]

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Release review / May</p>
        <h1>Make every review specific enough to ship.</h1>
        <p className="intro">A shared workspace for testing the new reporting flow before it reaches every account.</p>
        <div className="status"><span />Review window is open</div>
      </section>

      <section aria-label="Review checkpoints" className="checkpoints">
        {checkpoints.map((checkpoint) => (
          <article key={checkpoint.label}>
            <p>{checkpoint.label}</p>
            <strong>{checkpoint.value}</strong>
            <span>{checkpoint.detail}</span>
          </article>
        ))}
      </section>

      <section className="review-grid">
        <article className="brief">
          <p className="eyebrow">The brief</p>
          <h2>Find the signal before the weekly reporting deadline.</h2>
          <p>Review the time-to-insight from the dashboard landing page to an exported report. Note unclear wording, missing context, and anything that breaks on a narrow screen.</p>
          <ol>
            <li>Start with the reporting overview and choose a team.</li>
            <li>Compare this week against the prior period.</li>
            <li>Export the view and describe any friction below.</li>
          </ol>
        </article>
        <aside className="feedback-panel">
          <p className="eyebrow">Leave a note</p>
          <h2>One observation is more useful than a score.</h2>
          <FeedbackForm />
        </aside>
      </section>
    </main>
  )
}
