/**
 * Client-side guards for the custodial co-sign purchase flow (PR2).
 *
 * Testable without Privy/window: pure functions over the co-sign endpoint's
 * response. The wallet popup is the buyer's last line of defense, so before
 * handing the server-built transaction to it we assert (1) the price the UI
 * displayed equals what the chain will charge, and (2) the buyer — not the
 * server or anyone else — is the fee payer.
 */

import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';

/**
 * Throw if the SOL price shown to the user disagrees with the lamports the
 * on-chain listing will actually charge (returned by the co-sign endpoint,
 * read from the EvidenceListing PDA). Closes the "silent DB/chain price
 * disagreement" gap — the buyer never signs for an unexpected amount.
 */
export function assertPriceMatches(displayedSol: number, priceLamports: string): void {
  const displayedLamports = BigInt(Math.round(displayedSol * LAMPORTS_PER_SOL));
  const chainLamports = BigInt(priceLamports);
  if (displayedLamports !== chainLamports) {
    throw new Error(
      `Price mismatch: page shows ${displayedSol} SOL (${displayedLamports} lamports) ` +
        `but the on-chain listing charges ${chainLamports} lamports. Refusing to sign.`
    );
  }
}

/**
 * Deserialize the partially-signed transaction from the co-sign endpoint and
 * verify the buyer is the fee payer before passing it to the wallet.
 */
export function deserializeCosignedTx(base64: string, buyer: PublicKey): Transaction {
  const tx = Transaction.from(Buffer.from(base64, 'base64'));
  if (!tx.feePayer || !tx.feePayer.equals(buyer)) {
    throw new Error('Co-signed transaction fee payer is not the buyer. Refusing to sign.');
  }
  return tx;
}
