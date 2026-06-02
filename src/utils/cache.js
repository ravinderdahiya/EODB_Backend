import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || null;
let redisClient = null;
const localCache = new Map();

const connectRedis = async () => {
  if (!REDIS_URL || redisClient) return;
  try {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis error:", err.message));
    await redisClient.connect();
  } catch (err) {
    console.error("Failed to connect Redis client:", err.message);
    redisClient = null;
  }
};

export const getCache = async (key) => {
  if (REDIS_URL) {
    await connectRedis();
    if (!redisClient) return null;
    try {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Cache get error:", err.message);
      return null;
    }
  }

  // local fallback
  const entry = localCache.get(key);
  if (!entry) return null;
  if (entry.expiry && Date.now() > entry.expiry) {
    localCache.delete(key);
    return null;
  }
  return entry.value;
};

export const setCache = async (key, value, ttlSeconds = 300) => {
  if (REDIS_URL) {
    await connectRedis();
    if (!redisClient) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } else {
        await redisClient.set(key, JSON.stringify(value));
      }
    } catch (err) {
      console.error("Cache set error:", err.message);
    }
    return;
  }

  const expiry = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  localCache.set(key, { value, expiry });
};

export const delCache = async (key) => {
  if (REDIS_URL) {
    await connectRedis();
    if (!redisClient) return;
    try {
      await redisClient.del(key);
    } catch (err) {
      console.error("Cache del error:", err.message);
    }
    return;
  }

  localCache.delete(key);
};

export const incrCache = async (key) => {
  if (REDIS_URL) {
    await connectRedis();
    if (!redisClient) return null;
    try {
      return await redisClient.incr(key);
    } catch (err) {
      console.error("Cache incr error:", err.message);
      return null;
    }
  }

  const entry = localCache.get(key) || { value: 0 };
  entry.value = Number(entry.value || 0) + 1;
  localCache.set(key, { value: entry.value, expiry: null });
  return entry.value;
};

export default {
  getCache,
  setCache,
  delCache,
  incrCache,
};
