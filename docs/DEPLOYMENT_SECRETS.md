# Deployment and secret manager guidance

This document gives practical steps to configure secrets for production deployments and CI safely.

Recommended secrets to store in the platform secret manager
- OPENAI_API_KEY (used by LLM integrations)
- TELEGRAM_BOT_TOKEN (Telegram bot token)
- VECTOR_STORE_API_KEY (if using an external vector DB)

General steps (examples)

- Railway / Vercel / Render:
  1. In the project dashboard go to Settings / Environment variables.
  2. Add `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, etc.
  3. Do not store secrets in the repository. Use the `.env.example` as a template only.

- AWS (ECS / Lambda / EKS):
  1. Use AWS Secrets Manager or Parameter Store (with encryption).
  2. Grant only the runtime role the IAM policy to read the specific secrets.
  3. Inject the secrets into the container/task definition or use environment variables for Lambda.

- GitHub Actions / CI:
  1. Store secrets in the repository or organization Secrets (Settings → Secrets and variables → Actions).
  2. Reference them in workflows using `secrets.OPENAI_API_KEY` etc.
  3. Avoid echoing secrets, and redact outputs in workflow logs.

Least-privilege and rotation
- Rotate keys periodically and immediately after any suspected exposure.
- Create separate keys for different environments (prod/staging/dev) and revoke as needed.

Bot token permissions
- In BotFather (Telegram), restrict the token to minimum necessary permissions. Do not enable admin-level permissions unless required.

Verification checklist before going to production
- All production secrets configured in the platform secret manager.
- `.env` not present in the repo and CI runs gitleaks on push/PR.
- `IMAGE_RETENTION_HOURS` set to 0 in production to avoid keeping sensitive files longer than necessary.
