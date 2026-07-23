# Security Policy

## Reporting a vulnerability

Report privately through GitHub. **Please do not open a public issue for a
security problem.**

1. Open the **[Security](../../security)** tab of this repository
2. Click **Report a vulnerability**

That creates a private advisory visible only to the maintainers. Private
vulnerability reporting is enabled on this repository.

If you cannot use GitHub, open a public issue saying only that you have a
security report and how to reach you — no details.

### What helps

- What an attacker can do, and what access they need in order to do it
- The file and line, or a URL and the steps to reproduce
- Whether you are reporting against the published site or a local checkout

### What to expect

- Acknowledgement within **5 working days**
- An assessment, and either a fix or an explicit decision not to fix, within **30 days**
- Credit in the advisory, if you want it

There is no bug bounty. The Ethical Tech CoLab is a small research group and
this is unfunded work; please be patient.

## Supported versions

There are no releases or version tags. Only the current state of the `main`
branch is supported, and fixes are not backported.

## What this repository is

A WarGames (1983)-inspired terminal thriller with a modern AI-agent framing, plus a Monte Carlo simulation harness and a development case study. Static, with an optional external model endpoint.

## Scope

**In scope**

- Anything that causes attacker-controlled input to execute in a visitor's
  browser — cross-site scripting, HTML injection into rendered output, unsafe
  URL schemes in generated links
- Anything that causes the published page to load or execute code from a source
  this repository did not intend — an unpinned or integrity-unverified
  third-party asset, a hijackable CDN path, dependency confusion
- Exposure of a credential or token in committed code or in built output

**Out of scope**

- Findings that require the attacker to already control the visitor's machine
  or browser
- Response headers that cannot be set on GitHub Pages
- Denial of service against GitHub's own infrastructure

## Not a security issue

Disagreement with the model, the numbers, the methodology, or the legal
analysis is **not** a security report — but we do want to hear it. Open a
normal issue. If a peer review is published in this repository
(`PEER-REVIEW.md`), read it first: the finding may already be recorded there.

These are research outputs and prototypes, published to show method and to be
argued with. They are not production systems and should not be used to make
real operational decisions.
