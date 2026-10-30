/* Inno Setup RTP importer. No user-selected files leave the browser.
   Requires the separately built, Zlib-licensed innoextract WASM bundle. */
(function (root) {
  'use strict';
  const VX = root.VX = root.VX || {};
  let loading = null;
  let output = null;
  let report = () => {};
  const options = {
    enableDebug: false, excludeTemps: true, logsToFile: false,
    extractionLanguageFilterOptions: 'all', collisionResolutionOptions: 'overwrite'
  };

  function installHooks() {
    root.innoLog = message => {
      if (/extract|unpack|zipstream|warning/i.test(String(message))) report(String(message));
    };
    root.innoErr = message => { console.warn('[innoextract]', message); };
    root.createTree = () => {};
    root.showErrorModal = () => {};
    root.streamSaver = {
      createWriteStream(name) {
        let resolve, reject;
        const finished = new Promise((ok, fail) => { resolve = ok; reject = fail; });
        const open = (async () => {
          if (navigator.storage && navigator.storage.getDirectory) {
            try {
              const directory = await navigator.storage.getDirectory();
              const safeName = 'vxace-rtp-' + Date.now() + '.zip';
              const fileHandle = await directory.getFileHandle(safeName, {create: true});
              const stream = await fileHandle.createWritable();
              return {fileHandle, stream};
            } catch (error) {
              console.warn('OPFS unavailable, using in-memory output', error);
            }
          }
          return {chunks: []};
        })();
        const writer = {
          ready: open.then(() => {}),
          async write(bytes) {
            const destination = await open;
            // Emscripten's HEAP is reused: capture bytes before yielding.
            const copy = new Uint8Array(bytes);
            if (destination.stream) await destination.stream.write(copy);
            else destination.chunks.push(copy);
          },
          async close() {
            try {
              const destination = await open;
              if (destination.stream) {
                await destination.stream.close();
                resolve(await destination.fileHandle.getFile());
              } else {
                resolve(new File(destination.chunks, name, {type: 'application/zip'}));
              }
            } catch (error) { reject(error); }
          },
          async abort(error) {
            try {
              const destination = await open;
              await destination.stream?.abort(error);
            } finally { reject(error || Error('RTP extraction cancelled')); }
          }
        };
        output = {finished, writer};
        return {getWriter: () => writer};
      }
    };
  }

  async function ensureModule() {
    if (typeof root.Module?.load_exe === 'function') return root.Module;
    if (loading) return loading;
    installHooks();
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => reject(Error('innoextract WASM did not initialize in 90 seconds')), 90000);
      script.src = 'vendor/innoextract/innoextract.js';
      script.onerror = () => {
        clearTimeout(timeout);
        reject(Error('WebAssembly innoextract module not installed on this site yet'));
      };
      script.onload = () => {
        const started = Date.now();
        const poll = () => {
          if (typeof root.Module?.load_exe === 'function') {
            clearTimeout(timeout);
            resolve(root.Module);
          } else if (Date.now() - started > 88000) {
            clearTimeout(timeout);
            reject(Error('innoextract WASM bindings were not initialized'));
          } else setTimeout(poll, 150);
        };
        poll();
      };
      document.head.append(script);
    });
    try { return await loading; }
    catch (error) { loading = null; throw error; }
  }

  async function unpack(zip, onProgress = () => {}) {
    const inspect = VX.inspectRTP(zip);
    if (!inspect.installer) throw Error('Not a Windows Inno Setup RTP ZIP');
    report = onProgress;
    const setup = zip.entries.find(e => /(^|\\/)Setup\\.exe$/i.test(e.name));
    const data = zip.entries.find(e => /(^|\\/)Setup-1\\.bin$/i.test(e.name));
    if (!setup || !data) throw Error('RTP archive is missing Setup.exe or Setup-1.bin');
    onProgress('Reading RTP setup files locally; this may use hundreds of MiB of memory...');
    const [setupBlob, dataBlob] = await Promise.all([
      zip.openEntry(setup, onProgress), zip.openEntry(data, onProgress)
    ]);
    // The fork resolves multi-volume Inno slices by these exact filenames.
    root.global_file_list = [
      new File([setupBlob], 'Setup.exe'), new File([dataBlob], 'Setup-1.bin')
    ];
    try {
      onProgress('Starting innoextract WebAssembly...');
      const mod = await ensureModule();
      mod.set_options(JSON.stringify(options));
      const info = JSON.parse(await Promise.resolve(mod.load_exe('Setup.exe')));
      if (info.error) throw Error(info.error);
      const tree = JSON.parse(await Promise.resolve(mod.list_files()));
      const ids = [];
      const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (const item of node) walk(item); return; }
        if (Number.isInteger(node.fileId)) ids.push(node.fileId);
        for (const next of node.nodes || []) walk(next);
      };
      walk(tree);
      if (!ids.length) throw Error('No RTP files found in Inno Setup');
      onProgress('Unpacking ' + ids.length + ' RTP files to a local ZIP...');
      output = null;
      const result = JSON.parse(await Promise.resolve(mod.extract(JSON.stringify({
        files: ids, dirs: [], lang: ''
      }))));
      if (result.error) throw Error(result.error);
      if (!output) throw Error('innoextract produced no ZIP stream');
      const extracted = await output.finished;
      const extractedZip = await VX.ZipContainer.open(extracted);
      const after = VX.inspectRTP(extractedZip);
      if (!after.usable) throw Error('Unpacked RTP contains no Audio/ or Graphics/');
      onProgress('RTP ready: ' + after.graphics + ' graphics, ' + after.audio + ' audio files');
      return extractedZip;
    } finally {
      root.global_file_list = [];
      report = () => {};
    }
  }

  VX.RTPInnoImporter = {unpack};
})(typeof window !== 'undefined' ? window : globalThis);
