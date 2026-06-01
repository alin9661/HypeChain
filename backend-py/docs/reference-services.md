# Reference: Service & data layer

The backend is organized as a service layer the HTTP routers call into. This page lists the
public surface of each module with its real signatures. (The routers themselves — wiring these
into `POST /api/create-listing` and `/api/payments/*` — arrive in PR5; see
[Reference: HTTP API](reference-http-api.md).)

All external clients (OpenRouter, Redis, Solana RPC, the DSQL pool) are lazy module-level
singletons reused across warm Lambda invocations. See
[Explanation: Architecture](explanation-architecture.md).

---

## Data layer — `app/db`

Connection management plus column-enumerated SQL against Aurora DSQL. Query functions take an
acquired `conn` (except `increment_user_volume`, which manages its own connection for retries).

### `app/db/pool.py`
```python
async def get_pool() -> asyncpg.Pool          # lazy module-level pool (size 2–5), statement_cache_size=0
def acquire() -> _PoolAcquire                 # async-context-manager: `async with acquire() as conn:`
async def close_pool() -> None                # dispose the pool (shutdown / tests)
```
The pool authenticates each new physical connection with a fresh DSQL IAM token (minted via
`boto3`), and sets `statement_cache_size=0` (required by DSQL). See
[How-to: Configure Aurora DSQL](howto-configure-dsql.md).

### `app/db/occ.py`
```python
async def retry_on_serialization_error(
    op: Callable[[], Awaitable[T]], *, max_attempts=5, base_delay_s=0.01,
) -> T
```
Retries `op` on DSQL optimistic-concurrency serialization failures (SQLSTATE `40001`) with
exponential backoff. Wraps writes that can race (the volume increment).

### `app/db/queries.py`
```python
async def insert_listing(conn, listing: dict) -> dict
async def get_user_id_by_wallet(conn, wallet_address: str) -> str | None
async def fetch_listing_by_id(conn, listing_id: str) -> dict | None
async def update_listing_status(conn, listing_id, *, status, sold_at=None,
        buyer_wallet=None, buyer_user_id=None, transaction_signature=None) -> dict | None
async def insert_transaction(conn, tx: dict) -> dict
async def increment_user_volume(user_id, amount, *, acquire=None) -> dict | None  # OCC-safe additive UPDATE
async def get_transaction_history(conn, wallet_address, *, type="all") -> list[dict]
```
`get_transaction_history` is a single `transactions JOIN listings` returning the nested shape
`{..., "listing": {"product_name", "image_url", "nft_mint_address"}}` (matches the prior
Supabase response). `type` ∈ `{"buyer", "seller", "all"}`. No query uses `SELECT *`.

---

## Solana / Metaplex — `app/services`

Standard (non-compressed) NFT minting and on-chain anchoring. RPC submission is isolated
behind a `SolanaRpc` wrapper so it is mockable; instruction building is pure.

### `app/services/solana.py`
```python
def get_rpc() -> SolanaRpc                     # warm singleton RPC client
def get_server_wallet() -> Keypair             # decoded HACKNYU_SERVER_WALLET_PRIVATE_KEY (cached)
def mint_nft(target_wallet: str, metadata_uri: str, name: str,
             use_compressed_nft: bool = False) -> str   # returns mint address; cNFT flag accepted+ignored
def list_item_on_marketplace(nft_mint: str, price_sol: float, seller: str) -> dict
def submit_verification(*, nft_mint, confidence_bps, model_name, liveness_passed) -> dict
def ensure_server_dossier() -> dict            # idempotent on-chain examiner dossier
def get_balance(address: str) -> float         # SOL balance
```
`mint_nft` decomposes the Metaplex `createNft` into 5 raw instructions
(create_account → init_mint → create_ATA → mint_to → `CreateMetadataAccountV3`).

### `app/services/metaplex.py`
```python
def build_create_metadata_v3_data(...) -> bytes          # pinned Borsh serialization of DataV2
def build_create_metadata_v3_ix(...) -> Instruction      # the Token Metadata instruction
def find_metadata_pda(mint: Pubkey) -> Pubkey
```
The Token Metadata program ID and Borsh field order are pinned constants, guarded by
`tests/test_metaplex_golden.py`. See [Explanation: Design decisions](explanation-design-decisions.md).

### `app/services/verification.py`
```python
def get_program_id() -> Pubkey
def find_dossier_pda(authority) -> Pubkey
def find_verification_pda(nft_mint) -> Pubkey
def find_listing_pda(nft_mint) -> Pubkey
def build_submit_verification_ix(*, examiner, nft_mint, dossier_authority,
        confidence_bps, model_name, liveness_passed) -> Instruction
def build_list_evidence_ix(*, seller, nft_mint, price_lamports) -> Instruction
def confidence_to_bps(value) -> int            # AI confidence → basis points
```

---

## AI / IPFS / cache — `app/services`, `app/config`

### `app/services/openrouter.py`
```python
async def verify_product(base64_image: str) -> dict
async def verify_product_with_model(base64_image, model_id=None) -> dict
async def generate_marketing_image(full_description: str) -> str          # → image URL
async def generate_marketing_image_with_model(full_description, model_id=None, max_retries=5) -> str
async def download_image_as_base64(image_url: str) -> str
```
`verify_product*` returns `{product_identification, liveness_check, full_description, _metadata}`.
Image generation retries with exponential backoff (the SDK's own retries are disabled so this
loop is the single source). NFT art is always generated with `openai/gpt-5-image-mini`. Results
are cached via `cache.py`. Raises `VerificationError` / `ImageGenError`.

### `app/services/ipfs.py`
```python
async def upload_image_to_ipfs(base64_image, client=None) -> dict
async def upload_metadata_to_ipfs(metadata: dict, client=None) -> dict
async def create_and_upload_nft_metadata(image_base64, name, description,
        attributes: list[dict]) -> dict          # → {"metadataUri", "imageUrl"}
```
Uploads to NFT.Storage over `httpx`. Raises `IPFSError`.

### `app/services/cache.py`
```python
async def get_cached_verification(image_data, model_id) -> dict | None
async def cache_verification(image_data, model_id, result, ttl=86400) -> bool
async def get_cached_image_url(prompt, model_id) -> str | None
async def cache_image_url(prompt, model_id, image_url, ttl=604800) -> bool
async def invalidate_verification(image_data, model_id) -> bool
```
Redis via `redis.asyncio`, content-hash keys. If Redis is disabled or unreachable, every
function degrades to a no-op (never raises) — see `HACKNYU_REDIS_ENABLED`.

### `app/config/ai_models.py`
```python
def get_vision_model(model_id) -> dict | None
def get_image_gen_model(model_id) -> dict | None
def get_default_vision_model() -> dict
def get_default_image_gen_model() -> dict
def is_valid_vision_model(model_id: str) -> bool
def is_valid_image_gen_model(model_id: str) -> bool
def get_all_vision_models() -> list[dict]
def get_all_image_gen_models() -> list[dict]
def estimate_verification_cost(model_id, estimated_tokens=2000) -> float
def estimate_image_gen_cost(model_id, image_count=1) -> float
```

---

## Utilities — `app/utils`

```python
# display_name.py
def product_display_name(verification_result: dict) -> str   # brand+model+colorway, fallback full_description[:50]

# solana_validation.py
def is_valid_solana_pubkey(value) -> bool
def validate_base64_image(base64_string) -> ImageValidation  # .valid / .error / .content_type
def base64_to_bytes(base64_string: str) -> bytes
```

## Related
- [Reference: HTTP API](reference-http-api.md)
- [Explanation: Architecture](explanation-architecture.md)
- [Reference: Configuration](reference-configuration.md)
