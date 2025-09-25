// word-count-cache.js
class WordCountCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 30000; // 1초로 설정
    }

    getCacheKey(params = {}, useOneDayAgo = false) {
        return JSON.stringify({ ...params, useOneDayAgo, timestamp: Math.floor(Date.now() / this.cacheTimeout) });
    }

    get(key) {
        const cacheData = this.cache.get(key);
        if (!cacheData) return null;
        if (Date.now() - cacheData.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        return cacheData.count;
    }

    set(key, count) {
        this.cache.set(key, {
            count,
            timestamp: Date.now()
        });
    }

    invalidate() {
        this.cache.clear();
    }
}

// 전역 객체에 등록
window.WordCountCache = WordCountCache;