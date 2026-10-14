# MuSecure

**Decentralized proof of authorship for music, on Monad.**
Register a track without revealing it, credit your co-authors by email, and license it with royalties split on-chain automatically.

- **Live demo:** https://mu-secure-core-functions-anhj.vercel.app
- **Pitch video:** https://youtube.com/shorts/Os3uir4gebA
- **Technical demo (3 min):** https://youtu.be/uC6c2HTO3xQ
- **Network:** Monad Testnet (chainId `10143`)

> ⚠️ Use a testnet wallet only. Everything here runs on Monad Testnet with test MON.

---

## The problem

Around 100,000 new tracks reach streaming platforms every day, almost none with verifiable proof of who wrote them. In the famous Los Kjarkas / Kaoma case, the Bolivian group won in court partly because their song was already registered abroad, in Europe. Proof of authorship has to exist **before** the dispute, and it shouldn't depend on which office you registered in, or on any intermediary.

## What MuSecure does

1. **Register** a work: the audio fingerprint is computed locally in the browser, and only a **hash of the fingerprint** goes on-chain. The audio itself can stay **encrypted** (stored on IPFS via Lighthouse), so you can secure a song without revealing it.
2. **Check originality:** the fingerprint is looked up against AcoustID / MusicBrainz to flag strong matches with known recordings before you register.
3. **Credit co-authors** with just an email and a percentage. Privy pre-generates an embedded wallet for each collaborator, so the on-chain credit points to a real wallet from day one.
4. **License:** the author sets a price; a buyer pays the exact price and gets one license per wallet. `MuSecureLicensing` splits the payment by the Credits shares and sends the remainder to the author.
5. **Verify and earn:** anyone can verify a registration; artists see their credits and earnings, and can withdraw any balance held by the contract.

## Architecture

```
Browser (React + Vite)
  ├─ Privy embedded wallets  → sign & send txs on Monad Testnet
  ├─ Local fingerprinting    → AcoustID / MusicBrainz lookup
  ├─ Lighthouse (IPFS)       → audio (optionally encrypted), artwork, metadata
  ├─ Envio HyperIndex        → GraphQL: catalog, credits, earnings history
  └─ Alchemy RPC             → reads/writes on Monad Testnet
Vercel serverless functions
  ├─ /api/resolve-collaborators → Privy: email → pre-generated embedded wallet
  ├─ /api/alchemy-webhook       → signed (HMAC) webhook receiver
  └─ /api/sign-music            → signs the originality-score attestation checked by the Registry
Smart contracts (Solidity / Foundry)
  Asset (ERC-721) · Registry · Credits · Licensing
```

## Smart contracts (Monad Testnet)

| Contract | Address |
|---|---|
| MuSecureAsset (ERC-721) | `0xB98f9ba09E4eAb9b6fc2d680d74Bd17414609603` |
| MuSecureRegistry | `0xA6d7331cB2438007cEFF711005d1E90ff01f53D4` |
| MuSecureCredits | `0xadE430FE5D6561180FF3bBDD82C93005D1b467E6` |
| MuSecureLicensing | `0x495e9fdeDe572ee6F5cAfBED5818a080d400Db58` (deployed at block 69374960) |

**Licensing details**
- Exact-price purchase, one license per wallet per work.
- Payment split by Credits basis points; the remainder goes to the author.
- Push payout with a 100k gas cap per recipient. If a push fails, the amount is stored in `claimable` and the recipient calls `withdraw()`.
- Events: `LicensePriceSet`, `LicensePurchased`, `RoyaltyPaid`, `RoyaltyClaimed`.

> Monad charges on the gas **limit**, so transactions use an `estimateGas × 1.5` pattern.

## Hackathon integrations

### Envio HyperIndex
Envio is the read layer of the app. It indexes the MuSecure contracts and powers the **Explorer** (public catalog), **Artist profiles / Dashboard**, **My Credits** and the **My Earnings** history. The UI degrades gracefully when the indexer is unavailable. Totals and history come from Envio; the withdrawable balance is always read on-chain (`claimable`), since that is what `withdraw()` delivers.
The indexer lives in [`indexer/`](./indexer).

### Privy
Privy is the identity and wallet layer. Artists sign in and get an embedded wallet with no extension or seed phrase; signing runs without extra prompts. `/api/resolve-collaborators` uses Privy to pre-generate embedded wallets for collaborators by email, so co-author shares can be paid on-chain even if they have never used crypto. A gas airdrop on testnet can be requested by new accounts when registering a song.

### Alchemy (Monad)
The frontend and server use an **Alchemy Monad Testnet RPC** (`eth_getBalance`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`). `/api/alchemy-webhook` is a webhook receiver that verifies Alchemy's `X-Alchemy-Signature` (HMAC-SHA256 over the raw body) and decodes MuSecure events with an ethers `Interface`.
The webhook is configured as an **Address Activity** webhook on `MuSecureLicensing`, and real events from Alchemy's servers are received and verified by the endpoint (visible in the Alchemy dashboard's webhook logs).

## Known limitations

- Testnet only. No audit.
- Collaborators' pre-generated Privy wallets **receive** funds on-chain, but signing from those wallets (e.g. withdrawing) is not working end to end yet.
- Selling **encrypted** works is not supported yet; encrypted audio is available at registration.
- The score signer (`api/sign-music`) signs the originality score it receives; the score is computed in the browser and is **not yet verified server-side**. A production version would recompute or verify the AcoustID result on the server and add authentication and rate limiting.
- Fingerprint matching depends on public catalogs (AcoustID / MusicBrainz); "no match" does not prove absence from other catalogs.
- Planned next: email notification on sales, collaborator wallet claim flow, mainnet.

## Run it locally

### Three ways to try it

1. **Live demo (easiest):** https://mu-secure-core-functions-anhj.vercel.app. Nothing to install. Use a Monad Testnet wallet; new Privy accounts can request a gas airdrop when they register a song.
2. **Run the frontend locally against our deployed contracts.** You can browse works, log in, view credits and earnings, and buy licenses. **Registering new works needs the score signer authorized in our Registry contract, which only we hold**, so for registration use option 1 or option 3.
3. **Full self-hosted stack:** deploy the contracts yourself with your own score signer (`musecure-contracts/`), set the new addresses in `.env`, run your own indexer (`indexer/`), and run the app. Everything below applies.

**Prerequisites:** Node.js 22+, [pnpm](https://pnpm.io/), [Vercel CLI](https://vercel.com/docs/cli) (to run the `api/` functions locally), [Foundry](https://book.getfoundry.sh/) (only for the contracts), Docker (only for the indexer), and free accounts for Privy, Lighthouse and AcoustID. Alchemy is optional (the public Monad RPC works too). In your Privy dashboard, add `http://localhost:3000` (or the port you use) as an allowed origin.

**Repository layout**

| Folder | What it is |
|---|---|
| `src/` | React + Vite frontend |
| `api/` | Vercel serverless functions: `sign-music` (signs the originality-score attestation checked by the Registry contract at registration), `resolve-collaborators`, `alchemy-webhook` |
| `backend/` | Standalone Express version of the score signer, for running locally without Vercel |
| `indexer/` | Envio HyperIndex project |
| `musecure-contracts/` | Solidity contracts + Foundry tests |
| `docs/` | Additional documentation |

```bash
git clone https://github.com/Fsk8/MuSecure-Core-Functions.git
cd MuSecure-Core-Functions
git checkout feature/envio-indexer      
pnpm install
cp .env.example .env                # fill in the values (table below)
pnpm dev                            # frontend only: http://localhost:5173
```

`pnpm dev` serves only the frontend. To also run the `api/` serverless functions (score signer, collaborator wallets), use `npx vercel dev` from the repo root, which serves both on one port.

Other scripts: `pnpm build` (typecheck + production build), `pnpm preview`, `pnpm typecheck`.

### Score signer

Registration needs a signature over the work's originality score. The signed message is `keccak256(fingerprintHash, score, ipfsCid, soulbound, msg.sender, chainId, registryAddress)`, and `MuSecureRegistry` verifies it on-chain. In production this is the Vercel function `api/sign-music`, which reads `SCORE_SIGNER_PRIVATE_KEY` from the server environment.

To run it locally without Vercel, use the standalone Express version and set `VITE_BACKEND_URL=http://localhost:3001`:

```bash
cd backend
npm install
cp .env.example .env     # SCORE_SIGNER_PRIVATE_KEY=0x... (testnet-only key), PORT=3001
node server.js
```

The frontend calls `${VITE_BACKEND_URL}/api/sign-music`, so leave `VITE_BACKEND_URL` empty to use the same-origin Vercel function (production, or `npx vercel dev`), or set it to `http://localhost:3001` to use the Express server.

### Environment variables

Only a few are strictly required to run the UI. The rest add features.

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `VITE_CHAIN` | frontend | yes | Target chain (Monad Testnet) |
| `VITE_RPC_URL` | frontend | yes | RPC URL. Public: `https://testnet-rpc.monad.xyz`; or Alchemy `https://monad-testnet.g.alchemy.com/v2/<KEY>` |
| `VITE_PRIVY_APP_ID` | frontend | yes | Privy app ID |
| `VITE_PRIVY_CLIENT_ID` | frontend | yes | Privy client ID |
| `VITE_REGISTRY_ADDRESS` | frontend | yes | Registry address (table above) |
| `VITE_CREDITS_ADDRESS` | frontend | yes | Credits address |
| `VITE_LICENSING_ADDRESS` | frontend | yes | Licensing address |
| `VITE_ENVIO_GRAPHQL_URL` | frontend | yes | Envio GraphQL endpoint |
| `VITE_LIGHTHOUSE_API_KEY` | frontend | yes | IPFS uploads |
| `VITE_ACOUSTID_CLIENT_KEY` | frontend | yes | Originality check |
| `VITE_BACKEND_URL` | frontend | yes | Base URL for `/api` functions |
| `VITE_DEPLOY_BLOCK` | frontend | no | First block to scan |
| `VITE_WALLETCONNECT_PROJECT_ID` | frontend | no | External wallets |
| `RPC_URL` | server | yes | RPC used by serverless functions |
| `LICENSING_ADDRESS` / `REGISTRY_ADDRESS` | server | yes | Contract addresses |
| `ALCHEMY_SIGNING_KEY` | server | webhook only | Webhook signing key |
| `DISCORD_WEBHOOK_URL` | server | no | Optional notifications |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | `api/` | yes | Privy credentials used by `resolve-collaborators` (server-side; never expose the secret in `VITE_*`) |
| `TREASURY_PRIVATE_KEY` | `api/` | yes (airdrop) | Testnet wallet that funds the gas airdrop for new accounts. Use a throwaway testnet key only |
| `SCORE_SIGNER_PRIVATE_KEY` | `api/` (and `backend/`) | yes | Score signer private key (testnet only). The matching address must be the signer authorized in the Registry |
| `CHAIN_ID` | `api/` | no | Defaults to `10143` (Monad Testnet) |
| `PORT` | `backend/` | local only | Express port (`3001`) |

> `VITE_*` variables are baked into the build. Never commit `.env`.

### Smart contracts

```bash
cd musecure-contracts
forge build
forge test
```

### Envio indexer

Requires Node.js 22+ and Docker (Envio runs its local stack in containers).

```bash
cd indexer
pnpm install
pnpm codegen
pnpm dev         # local indexer + GraphQL playground
pnpm start       # run against the configured network
pnpm test
```

Point `VITE_ENVIO_GRAPHQL_URL` to the GraphQL endpoint of your indexer (local or hosted).

## Tech stack

React · Vite · TypeScript · Privy · ethers · Solidity · Foundry · Envio HyperIndex · Alchemy · Lighthouse (IPFS) · AcoustID / MusicBrainz · Vercel · Monad Testnet.

## Team

- **Favio** 
- **Ingrid**
