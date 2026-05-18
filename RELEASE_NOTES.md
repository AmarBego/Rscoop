### Release Notes 1.8.2

Execra got a big upgrade. It's the Rust job runtime behind every install, update, cleanup, and scan, and rScoop now reads what Scoop is doing far more faithfully. You get clearer messages, real reasons when something fails, smoother progress, and notifications that match.

#### Messages that say what's actually happening
- Scoop's output now runs through a real interpreter. Phases, progress, warnings, errors, success lines, and post-install notes are each recognized for what they are instead of guessed from line coloring.
- When something fails, it tells you why. You get "hash mismatch", "no manifest for X", "admin rights required", or "download failed"  without having to open the raw output modal.
- Partial-success cases are surfaced as warnings you can act on. That covers "already installed", "held to a fixed version", cache ignored, and missing hashes, none of which are treated as a clean success or a hard failure anymore.
- Post-install notes from packages are captured and shown, so setup steps don't slip past you.

#### Progress that actually moves
- Long opaque steps show steady motion instead of a frozen bar. Verifying a multi-GB download, extracting a big archive, and Scoop's own self-update all qualify.
- The bar fills continuously across the pipeline rather than snapping back at each step. The moment a real signal is available, it takes over.

#### Consistent status and notifications
- Every operation ends as success, warning, or error. That state is now the same in the operation bar, the modal, completed history, and the Windows toast.
- Operation-state handling was consolidated internally. A class of stale-UI and double-update glitches around chained and background work is gone.

#### Under the hood
- The interpreter, the progress filler, and the error fallback now live in Execra as reusable, unit-tested components. That removed roughly 780 lines of bespoke plumbing from rScoop.
- None of Scoop's behavior changed. Only the machinery around it got better.
