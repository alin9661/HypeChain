/**
 * Shared DSQL data-access facade.
 *
 * Binds the column-explicit query functions in `queries.js` to the module-level
 * pool, so routes/services call `db.fetchListingById(id)` instead of threading a
 * connection. One-shot queries run directly on the pool (`pool.query` works like
 * a client). The OCC-wrapped volume increment uses `withClient` so each retry
 * gets a fresh checkout.
 *
 * Services that need a test seam accept an injected `db` (default: this object)
 * and unit tests pass a fake implementing the same method names over in-memory
 * state — no live cluster required.
 */

import { query as poolQuery, withClient } from './pool.js';
import * as q from './queries.js';

// A `conn` for one-shot queries: the pool itself satisfies the {query} duck type.
const poolConn = { query: poolQuery };

export const db = {
  // listings
  insertListing: (listing) => q.insertListing(poolConn, listing),
  fetchListingById: (id) => q.fetchListingById(poolConn, id),
  updateListingStatus: (id, opts) => q.updateListingStatus(poolConn, id, opts),
  updateListingOnChainRefs: (id, refs) => q.updateListingOnChainRefs(poolConn, id, refs),
  markListingSoldIfActive: (id) => q.markListingSoldIfActive(poolConn, id),

  // users
  getUserIdByWallet: (wallet) => q.getUserIdByWallet(poolConn, wallet),
  incrementUserVolume: (userId, amount) =>
    q.incrementUserVolume(userId, amount, { withClientFn: withClient }),
  registerOrLoginUser: (input) => q.registerOrLoginUser(poolConn, input),
  getUserByWallet: (wallet) => q.getUserByWallet(poolConn, wallet),

  // transactions
  getTransactionIdBySignature: (sig) => q.getTransactionIdBySignature(poolConn, sig),
  getTransactionBySignature: (sig) => q.getTransactionBySignature(poolConn, sig),
  insertTransaction: (tx) => q.insertTransaction(poolConn, tx),
  getTransactionHistory: (wallet, opts) => q.getTransactionHistory(poolConn, wallet, opts),

  // activities (feed + provenance)
  insertActivity: (activity) => q.insertActivity(poolConn, activity),
  getActivitiesFeed: (opts) => q.getActivitiesFeed(poolConn, opts),
  getNftHistory: (mint, opts) => q.getNftHistory(poolConn, mint, opts),

  // waitlist (pre-production signup capture)
  insertWaitlistEntry: (entry) => q.insertWaitlistEntry(poolConn, entry),
  getWaitlistByEmail: (email) => q.getWaitlistByEmail(poolConn, email),
  listWaitlist: (opts) => q.listWaitlist(poolConn, opts),
  markWaitlistConfirmationSent: (id) => q.markWaitlistConfirmationSent(poolConn, id),
};
