window.preloadAssets = function(assetList) {
    assetList.forEach(function(url) {
        if (url.endsWith('.gif') || url.endsWith('.png') || url.endsWith('.jpg')) {
            var img = new Image();
            img.src = url;
        } else if (url.endsWith('.mp3') || url.endsWith('.ogg')) {
            // Howler prefetch
            if (typeof Howl !== 'undefined') {
                new Howl({ src: [url], preload: true });
            }
        }
    });
};