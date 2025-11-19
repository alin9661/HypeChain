/**
 * Redis Caching Service
 * Provides caching for AI verification results and generated images
 */

import { createHash } from 'crypto';
import Redis from 'ioredis';

// Initialize Redis client
const REDIS_URL = process.env.HACKNYU_REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.HACKNYU_REDIS_ENABLED !== 'false';

let redisClient = null;
let isConnected = false;

if (REDIS_ENABLED) {
  try {
    redisClient = new Redis(REDIS_URL, {
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Retrying connection in ${delay}ms...`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
      isConnected = true;
    });

    redisClient.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
      isConnected = false;
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
      isConnected = false;
    });
  } catch (error) {
    console.error('[Redis] Initialization error:', error.message);
  }
} else {
  console.log('[Redis] Caching disabled');
}

/**
 * Generate a hash from data for use as cache key
 * @param {string|object} data - Data to hash
 * @returns {string} SHA-256 hash
 */
function generateHash(data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate cache key for verification results
 * @param {string} imageData - Base64 image data
 * @param {string} modelId - Model ID used for verification
 * @returns {string} Cache key
 */
function getVerificationCacheKey(imageData, modelId) {
  // Hash the image to create a unique key
  const imageHash = generateHash(imageData);
  return `verification:${modelId}:${imageHash}`;
}

/**
 * Generate cache key for generated images
 * @param {string} prompt - Image generation prompt
 * @param {string} modelId - Model ID used for generation
 * @returns {string} Cache key
 */
function getImageGenCacheKey(prompt, modelId) {
  const promptHash = generateHash(prompt);
  return `image_gen:${modelId}:${promptHash}`;
}

/**
 * Get verification result from cache
 * @param {string} imageData - Base64 image data
 * @param {string} modelId - Model ID
 * @returns {Promise<object|null>} Cached result or null
 */
export async function getCachedVerification(imageData, modelId) {
  if (!redisClient || !isConnected) {
    console.log('[Redis] Cache not available, skipping');
    return null;
  }

  try {
    const key = getVerificationCacheKey(imageData, modelId);
    const cached = await redisClient.get(key);

    if (cached) {
      console.log(`[Redis] Cache HIT for verification (model: ${modelId})`);
      const result = JSON.parse(cached);
      result._metadata = result._metadata || {};
      result._metadata.cacheHit = true;
      return result;
    }

    console.log(`[Redis] Cache MISS for verification (model: ${modelId})`);
    return null;
  } catch (error) {
    console.error('[Redis] Error getting cached verification:', error.message);
    return null;
  }
}

/**
 * Cache verification result
 * @param {string} imageData - Base64 image data
 * @param {string} modelId - Model ID
 * @param {object} result - Verification result to cache
 * @param {number} ttl - Time to live in seconds (default: 24 hours)
 * @returns {Promise<boolean>} Success status
 */
export async function cacheVerification(imageData, modelId, result, ttl = 86400) {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    const key = getVerificationCacheKey(imageData, modelId);
    await redisClient.setex(key, ttl, JSON.stringify(result));
    console.log(`[Redis] Cached verification result (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    console.error('[Redis] Error caching verification:', error.message);
    return false;
  }
}

/**
 * Get generated image URL from cache
 * @param {string} prompt - Image generation prompt
 * @param {string} modelId - Model ID
 * @returns {Promise<string|null>} Cached image URL or null
 */
export async function getCachedImageUrl(prompt, modelId) {
  if (!redisClient || !isConnected) {
    return null;
  }

  try {
    const key = getImageGenCacheKey(prompt, modelId);
    const cached = await redisClient.get(key);

    if (cached) {
      console.log(`[Redis] Cache HIT for image generation (model: ${modelId})`);
      return cached;
    }

    console.log(`[Redis] Cache MISS for image generation (model: ${modelId})`);
    return null;
  } catch (error) {
    console.error('[Redis] Error getting cached image:', error.message);
    return null;
  }
}

/**
 * Cache generated image URL
 * @param {string} prompt - Image generation prompt
 * @param {string} modelId - Model ID
 * @param {string} imageUrl - Generated image URL
 * @param {number} ttl - Time to live in seconds (default: 7 days)
 * @returns {Promise<boolean>} Success status
 */
export async function cacheImageUrl(prompt, modelId, imageUrl, ttl = 604800) {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    const key = getImageGenCacheKey(prompt, modelId);
    await redisClient.setex(key, ttl, imageUrl);
    console.log(`[Redis] Cached image URL (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    console.error('[Redis] Error caching image URL:', error.message);
    return false;
  }
}

/**
 * Invalidate cached verification result
 * @param {string} imageData - Base64 image data
 * @param {string} modelId - Model ID
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateVerification(imageData, modelId) {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    const key = getVerificationCacheKey(imageData, modelId);
    await redisClient.del(key);
    console.log('[Redis] Invalidated verification cache');
    return true;
  } catch (error) {
    console.error('[Redis] Error invalidating cache:', error.message);
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} Cache statistics
 */
export async function getCacheStats() {
  if (!redisClient || !isConnected) {
    return {
      enabled: false,
      connected: false,
    };
  }

  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbsize();

    // Parse info string
    const stats = {};
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });

    return {
      enabled: true,
      connected: isConnected,
      totalKeys: dbSize,
      keyspaceHits: parseInt(stats.keyspace_hits) || 0,
      keyspaceMisses: parseInt(stats.keyspace_misses) || 0,
      hitRate: stats.keyspace_hits && stats.keyspace_misses
        ? (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%'
        : 'N/A',
    };
  } catch (error) {
    console.error('[Redis] Error getting stats:', error.message);
    return {
      enabled: true,
      connected: isConnected,
      error: error.message,
    };
  }
}

/**
 * Clear all cache entries (use with caution!)
 * @param {string} pattern - Pattern to match keys (optional, default: all)
 * @returns {Promise<number>} Number of keys deleted
 */
export async function clearCache(pattern = '*') {
  if (!redisClient || !isConnected) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) {
      console.log('[Redis] No keys to delete');
      return 0;
    }

    const deleted = await redisClient.del(...keys);
    console.log(`[Redis] Deleted ${deleted} cache entries`);
    return deleted;
  } catch (error) {
    console.error('[Redis] Error clearing cache:', error.message);
    return 0;
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedisConnection() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error closing connection:', error.message);
    }
  }
}

export default {
  getCachedVerification,
  cacheVerification,
  getCachedImageUrl,
  cacheImageUrl,
  invalidateVerification,
  getCacheStats,
  clearCache,
  closeRedisConnection,
};
