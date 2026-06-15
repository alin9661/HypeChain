/**
 * Activity feed + provenance endpoints (ported from FastAPI).
 *
 *   GET /api/activities?type=&cursor=&limit=   global, keyset-paginated feed
 *   GET /api/nft/:mint/history                  full chain of custody for one NFT
 *
 * The feed surfaces HypeChain's differentiator: a verified physical item AND its
 * full on-chain ownership chain. An empty result is a normal 200
 * (`activities: []`) so the frontend renders an honest "no activity yet" state
 * rather than seeded data.
 */

import express from 'express';

import * as activityService from '../services/activity.js';

const router = express.Router();

router.get('/activities', async (req, res) => {
  const { type, cursor } = req.query;

  if (type != null && !activityService.VALID_EVENT_TYPES.has(type)) {
    return res.status(400).json({
      success: false,
      error: `invalid type '${type}' — expected one of ${[...activityService.VALID_EVENT_TYPES].sort().join(', ')}`,
    });
  }

  const limit = req.query.limit != null ? Number(req.query.limit) : activityService.DEFAULT_FEED_LIMIT;
  if (req.query.limit != null && (!Number.isFinite(limit) || limit < 1)) {
    return res.status(400).json({ success: false, error: 'limit must be a positive integer' });
  }

  try {
    const { rows, nextCursor } = await activityService.feed({
      eventType: type ?? null,
      cursor: cursor ?? null,
      limit,
    });
    return res.json({
      activities: rows.map(activityService.toActivityItem),
      nextCursor,
      hasMore: nextCursor != null,
    });
  } catch (err) {
    if (err.message === 'malformed cursor') {
      // A client paging error, not a server fault.
      return res.status(400).json({ success: false, error: 'malformed cursor' });
    }
    console.error('[activities] feed error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load activity feed' });
  }
});

router.get('/nft/:mint/history', async (req, res) => {
  const { mint } = req.params;
  try {
    const rows = await activityService.history(mint);
    return res.json({
      nftMintAddress: mint,
      activities: rows.map(activityService.toActivityItem),
    });
  } catch (err) {
    console.error('[activities] nft-history error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load NFT history' });
  }
});

export default router;
