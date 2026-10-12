# Implementation Plan: OAuth2 Authorization Code Flow with PKCE

Integrate secure user login supporting PKCE, token refresh rotation, and Redis session caching.

## Architecture & Sequence Flow

```mermaid
sequenceDiagram
    actor User as "User Browser"
    participant Auth as "Auth Service"
    participant Provider as "OAuth Identity Provider"
    participant DB as "Session Cache DB"

    User->>Auth: 1. Initiate Login (code_challenge)
    Auth->>Provider: 2. Redirect to Provider Login
    Provider-->>User: 3. Return Auth Code
    User->>Auth: 4. Exchange Code + code_verifier
    Auth->>DB: 5. Store Session & Refresh Token
    Auth-->>User: 6. Return Access Token & Cookie
```

## Tasks
- [ ] Implement code_verifier generation and SHA-256 challenge hash
- [ ] Add state parameter verification against CSRF attacks
- [ ] Implement refresh token rotation mechanism
- [ ] Add Redis TTL expiration on active session keys

## Proposed File Changes
#### [NEW] src/auth/pkce.ts
#### [NEW] src/auth/oauth-handler.ts
#### [MODIFY] src/middleware/session.ts
