# Product Brief

Review Loop gives product teams a short, structured window to evaluate an in-progress release. The current sample focuses on the reporting flow and intentionally keeps feedback storage out of the repository.

## Users and outcome

- Product owners invite internal teammates and design partners to a focused review.
- Reviewers need a concise brief, a clear review window, and a low-friction way to report a concrete observation.
- Product owners use the feedback to decide whether the release is ready to ship.

## Boundaries

- `POST /api/feedback` validates the request shape but does not persist feedback. A real deployment must add authentication, rate limiting, and a durable storage integration.
- This project is a local preview workflow, not a production deployment template.
- Remote reviewers may access the app only through a temporary tunnel explicitly requested by the user.
