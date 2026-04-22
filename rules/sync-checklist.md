# Code Change Sync Checklist

When modifying code, keep these files in sync. Check even if no change is needed.

| File | When to update |
|------|----------------|
| Dependency files | Adding/removing/updating packages |
| Dockerfile | System packages, build steps, ENV, ports |
| .dockerignore | New folders/files that shouldn't be in build context |
| docker-compose.yml | Ports, volumes, env vars, services |
| .env | New config values added to Settings |
| README.md | Endpoints, env vars, structure, setup instructions |
| Test scenario docs | Test cases added/removed, endpoint behavior changed |

**Sync order:** code → dependencies → Dockerfile → .dockerignore → docker-compose → .env → README → test docs
