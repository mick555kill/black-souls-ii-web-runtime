// RGSS keeps recently used artwork handy. Sprites and scripts may also hold a
// Bitmap independently of Cache. Keep that identity across cache evictions.
function boundBitmapCache(module, display) {
  if (typeof WeakRef !== 'function' || typeof FinalizationRegistry !== 'function') return;
  const cache = module.cache && module.cache !== Opal.nil ? module.cache : (module.cache = Opal.hash());
  const read = cache['$[]'].bind(cache), write = cache['$[]='].bind(cache);
  const remove = cache.$delete, clear = cache.$clear.bind(cache);
  const files = new Map(), recent = new Map();
  let bytes = 0;
  function forgetRecent(key) {
    bytes -= recent.get(key) || 0;
    recent.delete(key);
  }
  function retain(key, size) {
    forgetRecent(key);
    recent.set(key, size); bytes += size;
    while (bytes > 24 * 1024 * 1024 || recent.size > 96) {
      const oldest = recent.keys().next().value;
      forgetRecent(oldest); remove.call(cache,oldest);
    }
  }
  cache['$[]'] = function (key) {
    const ref = files.get(key);
    if (!ref) return read(key);
    const bitmap = ref.deref();
    if (!bitmap) { files.delete(key); return Opal.nil; }
    if (!recent.has(key)) write(key, bitmap);
    retain(key, bitmap.width * bitmap.height * 4);
    return bitmap;
  };
  cache['$[]='] = function (key, bitmap) {
    files.delete(key); forgetRecent(key);
    write(key, bitmap);
    const surface = display.bitmaps.get(bitmap?.id);
    if (typeof key !== 'string' || !surface?.fileBacked) return bitmap;
    const ref = new WeakRef(bitmap);
    files.set(key, ref);
    (surface.beforeEdit ||= []).push(() => {
      if (files.get(key) !== ref) return;
      // A script can edit even an evicted bitmap if it still holds the object.
      // Modified pixels become an ordinary strong RGSS cache entry until clear.
      const live = ref.deref();
      files.delete(key); forgetRecent(key);
      if (live) write(key, live);
    });
    retain(key, bitmap.width * bitmap.height * 4);
    return bitmap;
  };
  cache.$delete = function removeKey(key) {
    const block=removeKey.$$p;removeKey.$$p=null;
    const result = files.get(key)?.deref();
    files.delete(key); forgetRecent(key);
    if(result){remove.call(cache,key);return result;}
    return Opal.send(cache,remove,[key],block);
  };
  cache.$clear = function () {
    files.clear(); recent.clear(); bytes = 0; return clear();
  };
}
