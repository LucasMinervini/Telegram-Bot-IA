# Secret handling and protection

This file summarizes recommended practices for storing and protecting secrets for this project.

Key points
- Never commit `.env` files or secrets to source control. Use platform-managed environment variables for production (Railway, Vercel, AWS, etc.).
- Rotate keys frequently and remove old/unused tokens.
- Use the GitHub secret-scanning workflow present at `.github/workflows/secret-scan.yml` to detect accidental leaks on push/PR.

Local development
- Keep a local `.env` only for development. It must not be committed. The repository already adds `.env` to `.gitignore`.
- Use `.env.example` as a template and populate secrets locally.

Production / Deployment
- Configure `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN` and other secrets in your deployment platform's secret manager, not in files.
- Ensure the bot token uses least-privilege: only enable permissions required to receive messages and send files.

Security recommendations implemented in repo
- `.gitignore` ignores `.env` and common artifacts to avoid accidental commits.
- `/.github/workflows/secret-scan.yml` runs gitleaks on pushes and PRs.
- `.env.example` now documents `IMAGE_RETENTION_HOURS=0` to encourage ephemeral storage.

Next steps (suggested)
- Add pre-commit hooks for local secret scanning (e.g. detect-secrets or gitleaks).
- Configure CI to fail PRs if gitleaks finds secrets and to notify repository admins.
- Store all production secrets in the platform's secret manager and enable secret scanning alerts in the repository settings (GitHub Advanced Security or equivalent).
