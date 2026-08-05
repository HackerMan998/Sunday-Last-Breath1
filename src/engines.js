/* =================================================================
   SUNDAY'S LAST BREATH -- STORY JAVASCRIPT
   Master engine file. Runs globally in the background.

   MODULE INDEX
   ----------------------------------------------------------------
   1. Game Configuration & Save System
   2. Audio Debug Monitor
   3. External Library Loading
   4. Sidebar Tab System & UI Animations
   5. Audio System (Howler.js)
   6. Traits & Player Stats
   7. Inventory Management
   8. Combat System
   9. Visual Effects & Lore
  10. Radar Chart Generator (SVG)
  11. Debug Panel Logic
  12. Retro Volume Controls
  13. Map Follow & Zoom Engine
================================================================= */

// -----------------------------------------------------------------
// 1. GAME CONFIGURATION & SAVE SYSTEM
// -----------------------------------------------------------------

// Disable auto line-breaks so all layout is controlled manually via HTML.
Config.passages.nobr = true;

// Keep only 2 undo steps in memory to prevent large save files from bloating storage.
Config.history.maxStates = 2;

// Save slot limits
Config.saves.maxSlotSaves = 8;

// Allow saving from every passage with no restrictions.
Config.saves.isAllowed = function () { 
    return true; 
};

// Auto-label every save using the current chapter variable.
Save.onSave.add(function (save, details) {
    var chapterLabel = State.variables.chapter 
        ? "Chapter " + State.variables.chapter 
        : "Save Game";

    if (details.type === 'autosave') {
        save.title = State.variables.chapter 
            ? "Chapter " + State.variables.chapter 
            : "Autosave";
    } else if (details.type === 'slot') {
        save.title = prompt("Name this save:", save.title);
    } else {
        save.title = chapterLabel;
    }
});


// -----------------------------------------------------------------
// 2. AUDIO DEBUG MONITOR
// -----------------------------------------------------------------
// Real-time logging of all active Howler instances.

window.AudioDebugger = (function () {
    var monitorInterval = null;
    var logBuffer = [];

    // Emoji prefixes for easy visual scanning
    var PREFIX = {
        info:    '🔵',
        success: '✅',
        warning: '⚠️',
        error:   '❌',
        play:    '▶️',
        stop:    '⏹️'
    };

    // Internal logger: stamps messages and stores them in the buffer.
    function log(message, type) {
        var icon = PREFIX[type] || '📌';
        var timestamp = new Date().toLocaleTimeString();
        var fullMessage = icon + ' [' + timestamp + '] ' + message;
        console.log(fullMessage);
        logBuffer.push(fullMessage);
        
        if (logBuffer.length > 50) {
            logBuffer.shift(); // Keep only the last 50 lines.
        }
    }

    // Prints a full audio status snapshot to the console every 2 seconds.
    function startMonitor() {
        if (monitorInterval) return; 
        log('Audio Monitor Started', 'success');

        monitorInterval = setInterval(function () {
            console.log('\n=======================================');
            console.log('🔊 AUDIO STATUS (Auto-refresh every 2s)');
            console.log('=======================================');

            // --- setup.sound tracks info ---
            if (typeof setup !== 'undefined' && setup.sound && setup.sound.tracks) {
                var ids = Object.keys(setup.sound.tracks);
                console.log('\n📦 setup.sound.tracks (' + ids.length + ' total):');

                if (ids.length === 0) {
                    console.log('   └- (none)');
                } else {
                    ids.forEach(function (id) {
                        var t = setup.sound.tracks[id];
                        if (t && typeof t.playing === 'function') {
                            console.log('   ├- ' + id + ':', {
                                playing: t.playing(),
                                volume:  Math.round(t.volume() * 100) + '%',
                                loop:    t.loop(),
                                src:     t._src ? t._src[0] : 'unknown'
                            });
                        } else {
                            console.log('   ├- ' + id + ': (invalid Howl instance)');
                        }
                    });
                }
            } else {
                console.log('\n📦 setup.sound.tracks: NOT AVAILABLE');
            }

            // --- Raw Howler instances info ---
            if (typeof Howler !== 'undefined' && Howler._howls) {
                console.log('\n🎵 Howler._howls (' + Howler._howls.length + ' total):');

                if (Howler._howls.length === 0) {
                    console.log('   └- (none)');
                } else {
                    Howler._howls.forEach(function (howl, i) {
                        var src = howl._src ? howl._src[0] : 'unknown';
                        var filename = src.split('/').pop();
                        console.log('   ├- Instance #' + i + ':', {
                            playing: howl.playing(),
                            volume:  Math.round(howl.volume() * 100) + '%',
                            loop:    howl.loop(),
                            state:   howl.state(),
                            file:    filename
                        });
                    });
                }
            } else {
                console.log('\n🎵 Howler._howls: NOT AVAILABLE');
            }

            console.log('\n🚪 HallwayAmbience:', typeof window.HallwayAmbience !== 'undefined' ? 'EXISTS' : 'NOT DEFINED');
            console.log('\n=======================================\n');
        }, 2000);
    }

    function stopMonitor() {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
            log('Audio Monitor Stopped', 'warning');
        }
    }

    // Wraps Howl.prototype.play and .stop to track audio event triggers.
    function hookHowler() {
        if (typeof Howl === 'undefined') {
            console.error('❌ Howl not loaded -- cannot hook events.');
            return;
        }

        var origPlay = Howl.prototype.play;
        var origStop = Howl.prototype.stop;

        Howl.prototype.play = function () {
            log('PLAY: ' + (this._src ? this._src[0].split('/').pop() : 'unknown'), 'play');
            return origPlay.apply(this, arguments);
        };

        Howl.prototype.stop = function () {
            log('STOP: ' + (this._src ? this._src[0].split('/').pop() : 'unknown'), 'stop');
            return origStop.apply(this, arguments);
        };

        log('Howler events hooked', 'success');
    }

    setTimeout(startMonitor, 1000);

    return {
        start:      startMonitor,
        stop:       stopMonitor,
        hookHowler: hookHowler,
        getLog:     function ()  { return logBuffer.join('\n'); },
        clearLog:   function ()  { logBuffer = []; console.clear(); log('Log cleared', 'info'); },
        log:        log
    };
})();

// Shortcut alias for console tools
window.debug = window.AudioDebugger;
console.log('🎧 Audio Debugger Loaded. Commands: debug.stop() | debug.start() | debug.clearLog() | debug.getLog()');

// F2 hotkey: saves current location and opens the debug panel
$(document).on('keydown', function (e) {
    if (e.key === 'F2') {
        State.variables.returnPassage = passage();
        Engine.play('Debug_Panel');
    }
});


// -----------------------------------------------------------------
// 3. EXTERNAL LIBRARY LOADING
// -----------------------------------------------------------------

function loadScript(url, callback) {
    var script = document.createElement('script');
    script.src = url;
    script.onload = callback || function () {};
    document.head.appendChild(script);
}

// === Load Howler.js ===
if (!window.Howl) {
    loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js",
        function () {
            window.AudioDebugger.hookHowler();
        }
    );
}

// === Load anime.js ===
if (!window.anime) {
    loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js",
        function () {
            window.animeReady = true;
        }
    );
} else {
    window.animeReady = true;
}


// -----------------------------------------------------------------
// 4. SIDEBAR TAB SYSTEM & UI ANIMATIONS
// -----------------------------------------------------------------

window.ANIM_DELAY = 50;

// === SIDEBAR TAB SWITCHER ===
window.switchSidebarTab = function (tabName) {
    var tabs = ['main', 'bag', 'map', 'skills', 'traits'];

    tabs.forEach(function (tab) {
        var el = document.getElementById('tab-' + tab);
        if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.sidebar-tab-btn').forEach(function (btn) {
        btn.classList.remove('active');
    });

    var selectedTab = document.getElementById('tab-' + tabName);
    if (selectedTab) {
        selectedTab.style.display = 'block';

        if (window.animeReady) {
            var targets = selectedTab.querySelectorAll('.inv-slot, .hobby-card, .skill-row, .bar-container');
            anime.remove(targets);

            var TAB_ORDER = ['main', 'bag', 'map', 'skills', 'traits'];
            var currentTab = State.variables.activeTab || tabName;
            var fromIdx = TAB_ORDER.indexOf(currentTab);
            var toIdx = TAB_ORDER.indexOf(tabName);

            var slideX = 0;
            var slideY = 40;

            if (fromIdx !== toIdx) {
                var dir = toIdx > fromIdx ? 1 : -1;
                slideX = 50 * dir; 
                slideY = 0;
            }

            anime({
                targets:    targets,
                translateX: [slideX, 0],
                translateY: [slideY, 0],
                opacity:    [0, 1],
                delay:      anime.stagger(30),
                easing:     'easeOutQuad',
                duration:   600
            });
        }
    }

    var activeBtn = document.getElementById('btn-' + tabName);
    if (activeBtn) activeBtn.classList.add('active');

    State.variables.activeTab = tabName;
};

// Keeps sidebar active tab layout fresh on passage updates
$(document).on(':passagerender', function () {
    if (!State.variables.activeTab) {
        State.variables.activeTab = 'main';
    }
    setTimeout(function () {
        requestAnimationFrame(function () {
            window.switchSidebarTab(State.variables.activeTab);
        });
    }, window.ANIM_DELAY);
});


// === STAT SNAPSHOT (Pre-update values for Ghost Bars) ===
$(document).on(':passageinit', function () {
    var sv = State.variables;
    window.prevStats = {
        hp:      sv.hp !== undefined ? sv.hp : 0,
        stamina: sv.stamina !== undefined ? sv.stamina : 0,
        hunger:  sv.hunger !== undefined ? sv.hunger : 0,
        thirst:  sv.thirst !== undefined ? sv.thirst : 0,
        hum:     sv.hum !== undefined ? sv.hum : 0,
        xp:      sv.xp !== undefined ? sv.xp : 0,
        trust:   sv.safehouseTrust !== undefined ? sv.safehouseTrust : 0
    };
});

// === PASSAGE TRANSITION ANIMATION ===
$(document).on(':passagestart', function () { 
    $('#story').scrollTop(0); 
});

$(document).on(':passageend', function () {
    if (!window.animeReady) return;
    setTimeout(function () {
        anime({
            targets:    '#passage',
            translateX: [-12, 0],
            opacity:    [0, 1],
            duration:   350,
            easing:     'easeOutExpo'
        });
    }, window.ANIM_DELAY);
});

// === DIALOG POP-IN ANIMATION ===
$(document).on(':dialogopened', function () {
    var el = document.querySelector('#ui-dialog-body');
    if (!el || !window.animeReady) return;

    anime.set(el, { scale: 0.75, opacity: 0, translateY: 20 });
    anime({
        targets:    el,
        scale:      [0.75, 1],
        opacity:    [0, 1],
        translateY: [20, 0],
        easing:     'easeOutElastic(1, .5)',
        duration:   520
    });
});

// === STAT BAR ANIMATION (Ghost Bar Effects) ===
window.animateStatBar = function (selector, newVal, maxVal) {
    if (!window.animeReady) return;

    setTimeout(function () {
        requestAnimationFrame(function () {
            var bar = document.querySelector(selector);
            if (!bar) return;

            var statKeyMap = {
                '.bar-fill.hp':       'hp',
                '.bar-fill.stamina':  'stamina',
                '.bar-fill.hunger':   'hunger',
                '.bar-fill.thirst':   'thirst',
                '.bar-fill.humanity': 'hum',
                '.bar-fill.xp':       'xp',
                '.bar-fill.trust':    'trust'
            };

            var statKey = statKeyMap[selector];
            var oldVal = (statKey && window.prevStats && window.prevStats[statKey] !== undefined)
                ? window.prevStats[statKey]
                : newVal;

            var oldPct = Math.max(0, Math.min(100, (oldVal / maxVal) * 100));
            var newPct = Math.max(0, Math.min(100, (newVal / maxVal) * 100));
            var isCrit = newVal < maxVal * 0.25;
            var isDamage = newPct < oldPct;

            var ghost = bar.parentElement.querySelector('.bar-ghost');
            if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'bar-ghost';
                ghost.style.cssText = [
                    'position:absolute', 'top:0', 'left:0', 'height:100%',
                    'width:0%', 'background:rgba(255,255,255,0.55)',
                    'pointer-events:none', 'z-index:1', 'opacity:1'
                ].join(';');
                bar.parentElement.style.position = 'relative';
                bar.style.position = 'relative';
                bar.style.zIndex = '2';
                bar.parentElement.appendChild(ghost);
            }

            anime.set(ghost, { opacity: 1 });

            if (isDamage) {
                anime.set(bar, { width: oldPct + '%', backgroundColor: isCrit ? '#8b0000' : null });
                anime.set(ghost, { width: oldPct + '%' });

                anime({ targets: bar, width: newPct + '%', duration: 600, easing: 'easeOutQuad' });
                anime({
                    targets:  ghost,
                    width:    newPct + '%',
                    duration: 700,
                    delay:    500,
                    easing:   'easeOutQuad',
                    complete: function () {
                        anime({ targets: ghost, opacity: 0, duration: 300 });
                    }
                });
            } else {
                anime.set(bar, { width: oldPct + '%' });
                anime({ targets: bar, width: newPct + '%', duration: 600, easing: 'easeOutElastic(1, .6)' });
            }
        });
    }, window.ANIM_DELAY);
};

// === FLOOR LOOT & COMBAT ANIMATIONS ===
window.animateFloorLoot = function () {
    if (!window.animeReady) return;
    var lootItems = document.querySelectorAll('.loot-item');
    var lootHeader = document.querySelector('.loot-header');
    if (!lootItems.length) return;

    anime({
        targets:    lootItems,
        translateX: [-30, 0],
        opacity:    [0, 1],
        delay:      anime.stagger(80),
        duration:   300,
        easing:     'easeOutQuad'
    });

    if (lootHeader) {
        anime({
            targets:   lootHeader, 
            color:     ['#ffff00', '#ff4400', '#ffff00'],
            duration:  1200, 
            loop:      true, 
            direction: 'alternate', 
            easing:    'easeInOutSine'
        });
    }
};

window.animateCombatLine = function (containerEl, text) {
    if (!containerEl || !window.animeReady) return;
    containerEl.innerHTML = text.split('').map(function (c) {
        return '<span style="opacity:0;display:inline-block">' + c + '</span>';
    }).join('');

    anime({
        targets:    containerEl.querySelectorAll('span'),
        opacity:    [0, 1],
        translateY: [5, 0],
        delay:      anime.stagger(30),
        easing:     'easeOutQuad',
        duration:   80
    });
};

window.playLevelUpAnimation = function () {
    if (!window.animeReady) return;
    var overlay = document.createElement('div');
    overlay.className = 'levelup-flash';
    document.body.appendChild(overlay);

    anime.timeline({ easing: 'easeOutQuad' })
        .add({
            targets:  overlay, 
            opacity:  [0, 0.6, 0], 
            duration: 600,
            complete: function () { 
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay); 
            }
        })
        .add({
            targets:  '.bar-container', 
            scaleX:   [1, 1.05, 1], 
            duration: 400,
            delay:    anime.stagger(50), 
            easing:   'easeInOutBack'
        }, '-=200'); 
};


// -----------------------------------------------------------------
// 5. AUDIO SYSTEM (HOWLER.JS)
// -----------------------------------------------------------------

setup.sound = {
    tracks: {}, 

    play: function (id, path, loop, vol) {
        loop = loop || false;
        vol = (vol !== undefined) ? vol : 0.5;

        var isBGM = path.includes('/bgm/');
        
        var bgmMult = (State.variables.volBGM !== undefined ? State.variables.volBGM : 100) / 100;
        var sfxMult = (State.variables.volSFX !== undefined ? State.variables.volSFX : 100) / 100;
        
        var finalVol = vol * (isBGM ? bgmMult : sfxMult);

        if (this.tracks[id] && this.tracks[id]._src === path) {
            if (!this.tracks[id].playing()) this.tracks[id].play();
            this.tracks[id].volume(finalVol);
            this.tracks[id].loop(loop);
            this.tracks[id]._baseVol = vol; 
            this.tracks[id]._isBGM = isBGM; 
            return;
        }

        if (this.tracks[id]) this.tracks[id].stop();

        this.tracks[id] = new Howl({
            src:         [path], 
            loop:        loop, 
            volume:      finalVol, 
            html5:       true,
            onloaderror: function (id, err) { console.error("Audio Load Error:", err); }
        });
        
        this.tracks[id]._baseVol = vol;
        this.tracks[id]._isBGM = isBGM;

        this.tracks[id].play();
    },

    crossfade: function (stopId, startId, path, duration, targetVol) {
        duration = duration || 2000;
        targetVol = targetVol || 0.5;

        this.fade(stopId, duration);           
        this.play(startId, path, true, 0);     

        if (this.tracks[startId]) {
            this.tracks[startId].fade(0, targetVol, duration); 
        }
    },

    stop: function (id) { 
        if (this.tracks[id]) this.tracks[id].stop(); 
    },
    
    stopAll: function () { 
        Howler.unload(); 
        this.tracks = {}; 
    },

    fade: function (id, duration) {
        if (this.tracks[id] && this.tracks[id].playing()) {
            var track = this.tracks[id];
            track.fade(track.volume(), 0, duration);
            track.once('fade', function () { 
                track.stop(); 
            });
        }
    },

    toggleMute: function () {
        var isMuted = !Howler._muted;
        Howler.mute(isMuted);
        return isMuted;
    },

    isMuted: function () { 
        return Howler._muted; 
    }
};

// === HALLWAY AMBIENCE ENGINE ===
window.HallwayAmbience = (function () {
    var baseDrone = null;
    var ambientPool = [];
    var scheduler = null;
    var isActive = false;

    function start(droneFile, ambientConfig, fadeIn) {
        if (isActive) return; 
        isActive = true;

        baseDrone = new Howl({ src: [droneFile], loop: true, volume: fadeIn ? 0 : 1.0, html5: true });
        baseDrone.play();
        
        if (fadeIn) {
            baseDrone.fade(0, 1.0, 2000);
        }

        ambientPool = ambientConfig.map(function (sound) {
            return new Howl({ src: [sound.file], volume: sound.volume, html5: true });
        });

        setTimeout(function () { 
            if (isActive) scheduleNext(); 
        }, 15000);
    }

    function scheduleNext() {
        if (!isActive) return;
        var delay = Math.random() * 17000 + 8000;

        scheduler = setTimeout(function () {
            if (!isActive || ambientPool.length === 0) return;
            var available = ambientPool.filter(function (s) { return !s.playing(); });
            if (available.length === 0) available = ambientPool;

            var pick = available[Math.floor(Math.random() * available.length)];
            pick.play();
            scheduleNext(); 
        }, delay);
    }

    function stop() {
        isActive = false;
        if (baseDrone) baseDrone.stop();
        if (scheduler) clearTimeout(scheduler);
        ambientPool.forEach(function (s) { s.stop(); });
    }

    return { 
        start:    start, 
        stop:     stop, 
        isActive: function () { return isActive; } 
    };
})();


// -----------------------------------------------------------------
// 6. TRAITS & PLAYER STATS
// -----------------------------------------------------------------

window.setPerk = function (name, icon, description) {
    var sv = State.variables;
    if (sv.acquiredTraits.includes(name)) {
        console.log("Trait already acquired: " + name);
        return false;
    }
    sv.traits.push({ name: name, icon: icon, desc: description });
    sv.acquiredTraits.push(name);
    return true;
};

window.hasTrait = function (traitName) {
    return State.variables.acquiredTraits.includes(traitName);
};

window.gainXP = function (amount) {
    var sv = State.variables;

    if (window.hasTrait("FAST LEARNER")) amount *= 2;
    if (!window.prevStats) window.prevStats = {};
    window.prevStats.xp = sv.xp;

    sv.xp += amount;
    var leveledUp = false;

    while (sv.xp >= sv.xp_req) {
        sv.xp -= sv.xp_req;
        sv.level += 1;
        sv.xp_req = Math.floor(sv.xp_req * 1.5); 
        
        sv.hp_max += 10;
        sv.hp = sv.hp_max;
        sv.stamina_max += 10;
        sv.stamina = sv.stamina_max;

        leveledUp = true;
    }

    if (leveledUp) {
        window.playLevelUpAnimation();
        alert("🎉 LEVEL UP! You are now Level " + sv.level + "!");
    }

    setTimeout(function() {
        if (typeof window.animateStatBar === 'function') {
            window.animateStatBar('.bar-fill.xp', sv.xp, sv.xp_req);
        }
    }, window.ANIM_DELAY || 50);
};


// -----------------------------------------------------------------
// 7. INVENTORY MANAGEMENT
// -----------------------------------------------------------------

// === INVENTORY CLICK MODAL ===
window.clickInv = function (index) {
    var inv = State.variables.inventory;
    if (!inv[index]) return;

    var item = inv[index];
    var data = setup.items[item.id];
    Dialog.setup(item.id);

    var iconHTML = data.icon || '<span style="font-size:3em;">❓</span>';
    var html =
        '<div class="dialog-item">' +
            '<div class="dialog-icon">' + iconHTML + '</div>' +
            '<div class="dialog-info">' +
                '<h3>' + item.id + '</h3>' +
                '<p>' + data.desc + '</p>' +
            '</div>' +
            '<div class="dialog-buttons">';

    if (data.type === "consumable") {
        html += '<button onclick="window.useItem(' + index + ')">USE</button>';
    } else if (["head", "body", "pants", "boots", "weapon"].includes(data.type)) {
        html += '<button onclick="window.equipItem(\'' + data.type + '\',' + index + ')">EQUIP</button>';
    } else if (item.id === "Old Map") {
        html = 
            '<div class="dialog-item" style="width: 100%; max-width: 600px;">' +
                '<h3>OLD MAP</h3>' +
                '<img src="image/utility/old_map.jpg" style="width:100%; border:2px solid #333; margin-bottom:15px;">' +
                '<p style="color:#aaa; font-style:italic;">A faded, vintage topographical map of the United States. It outlines major highways, elevations, and old county lines.</p>' +
                '<div class="dialog-buttons">';
    }

    html += '<button onclick="window.dropItem(' + index + ')">DROP</button>' +
            '</div></div>';

    Dialog.wiki(html);
    Dialog.open();
};

// === CONSUMABLE USAGE ===
window.useItem = function (index) {
    var item = State.variables.inventory[index];
    if (!item) return;

    var data = setup.items[item.id];
    var sv = State.variables;
    var used = false; 

    var healAmount = data.heal || 0;
    var staminaAmount = data.stamina || 0;
    var humAmount = data.hum || 0; 
    var hungerAmount = data.hunger || 0;
    var thirstAmount = data.thirst || 0;

    if (window.hasTrait("FIELD MEDIC") && healAmount > 0) healAmount *= 2;
    if (window.hasTrait("STERILE") && healAmount > 0) healAmount += 20;
    if (window.hasTrait("HERBALIST")) {
        var isNourishment = item.id === "Bottled Water" || item.id.includes("Food") || item.id.includes("Jerky");
        if (isNourishment) { 
            healAmount += 10; 
            staminaAmount += 10; 
        }
    }

    if (healAmount > 0) {
        if (sv.hp < sv.hp_max) { 
            sv.hp = Math.min(sv.hp_max, sv.hp + healAmount); 
            used = true; 
        } else if (hungerAmount === 0 && thirstAmount === 0) { 
            alert("Health is already full."); 
            return; 
        }
    }

    if (staminaAmount > 0) { 
        sv.stamina = Math.min(sv.stamina_max, sv.stamina + staminaAmount); 
        used = true; 
    }
    
    if (humAmount > 0) { 
        sv.hum = Math.min(100, sv.hum + humAmount); 
        used = true; 
    }

    if (hungerAmount > 0) {
        if (sv.hunger < 100) { 
            sv.hunger = Math.min(100, sv.hunger + hungerAmount); 
            used = true; 
        } else if (healAmount === 0 && thirstAmount === 0) { 
            alert("You're not hungry."); 
            return; 
        }
    }

    if (thirstAmount > 0) {
        if (sv.thirst < 100) { 
            sv.thirst = Math.min(100, sv.thirst + thirstAmount); 
            used = true; 
        } else if (healAmount === 0 && hungerAmount === 0) { 
            alert("You're not thirsty."); 
            return; 
        }
    }

    if (data.skill) {
        if (sv.skills[data.skill] < 5) {
            sv.skills[data.skill] += 1;
            alert("You studied " + item.id + ". Your " + data.skill + " skill increased!");
            used = true;
        } else {
            alert("You have already mastered this skill.");
            return;
        }
    }

if (data.xp) {
    alert("You gained " + data.xp + " XP!");
    window.gainXP(data.xp); // This triggers the level-up checks and updates the UI
    used = true;
}

    if (window.hasTrait("HUNGRY") && hungerAmount > 0 && item.qty > 1) {
        item.qty -= 1;
        alert("Your insatiable hunger demands more food!");
    }

    if (used) {
        item.qty--;
        if (item.qty <= 0) sv.inventory.splice(index, 1);
        Dialog.close();
        Engine.play(passage());
    }
};

// === WEARABLE / WEAPON EQUIPMENT HANDLING ===
window.equipItem = function (slot, index) {
    var item = State.variables.inventory[index];
    var current = State.variables.equip[slot];

    State.variables.inventory.splice(index, 1);         
    if (current !== "none") setup.addItem(current, 1);  

    State.variables.equip[slot] = item.id;
    Dialog.close();
    Engine.play(passage());
};

window.unequipItem = function (slot) {
    var current = State.variables.equip[slot];
    if (setup.addItem(current, 1)) {
        State.variables.equip[slot] = "none";
        Dialog.close();
        Engine.play(passage());
    } else {
        alert("Inventory Full!");
    }
};

window.clickEquip = function (slot) {
    var current = State.variables.equip[slot];
    if (current === "none") return;

    var data = setup.items[current];
    var iconHTML = data.icon || '<span style="font-size:3em;">❓</span>';

    Dialog.setup(current);
    var html =
        '<div class="dialog-item">' +
            '<div class="dialog-icon">' + iconHTML + '</div>' +
            '<div class="dialog-info">' +
                '<h3>' + current + '</h3>' +
                '<p>' + data.desc + '</p>' +
            '</div>' +
            '<div class="dialog-buttons">' +
                '<button onclick="window.unequipItem(\'' + slot + '\')">UNEQUIP</button>' +
                '<button onclick="window.dropEquipItem(\'' + slot + '\')">DROP</button>' +
            '</div>' +
        '</div>';

    Dialog.wiki(html);
    Dialog.open();
};

// === FLOOR DROP & LOOT ACTIONS ===
window.dropItem = function (index) {
    var inv = State.variables.inventory;
    if (!inv[index]) return;

    var itemRef = inv[index];
    var currentPassage = passage();
    var itemDb = setup.items[itemRef.id];

    if (!State.variables.floorItems) State.variables.floorItems = {};
    if (!State.variables.floorItems[currentPassage]) State.variables.floorItems[currentPassage] = [];

    var roomLoot = State.variables.floorItems[currentPassage];
    var floorStack = itemDb.stack ? roomLoot.find(function (i) { return i.id === itemRef.id; }) : null;

    if (floorStack) {
        floorStack.qty += 1;
    } else {
        roomLoot.push({ id: itemRef.id, qty: 1 });
    }

    itemRef.qty--;
    if (itemRef.qty <= 0) inv.splice(index, 1);

    Dialog.close();
    Engine.play(passage());
};

window.dropEquipItem = function (slot) {
    var itemID = State.variables.equip[slot];
    if (itemID === "none") return;

    var currentPassage = passage();
    var itemDb = setup.items[itemID];

    if (!State.variables.floorItems) State.variables.floorItems = {};
    if (!State.variables.floorItems[currentPassage]) State.variables.floorItems[currentPassage] = [];

    var roomLoot = State.variables.floorItems[currentPassage];
    var floorStack = itemDb.stack ? roomLoot.find(function (i) { return i.id === itemID; }) : null;

    if (floorStack) {
        floorStack.qty += 1;
    } else {
        roomLoot.push({ id: itemID, qty: 1 });
    }

    State.variables.equip[slot] = "none";
    Dialog.close();
    Engine.play(passage());
};

window.pickupItem = function (floorIndex) {
    var loc = passage();
    var floorList = State.variables.floorItems[loc];
    if (!floorList || !floorList[floorIndex]) return;

    var itemToGrab = floorList[floorIndex];
    var success = setup.addItem(itemToGrab.id, itemToGrab.qty, true);

    if (success) {
        floorList.splice(floorIndex, 1);
        Engine.play(passage());
    } else {
        Dialog.setup("INVENTORY FULL");
        Dialog.wiki("<center>You cannot carry any more items.<br>Drop something to make space.</center>");
        Dialog.open();
    }
};


// -----------------------------------------------------------------
// 8. COMBAT SYSTEM
// -----------------------------------------------------------------

window.calcHit = function (baseAccuracy, skillLevel, targetZombie) {
    var sv = State.variables;

    var agiBonus = (sv.agi || 0) * 5;
    var skillBonus = (skillLevel || 0) * 10;
    var evasion = (targetZombie && targetZombie.ev) ? targetZombie.ev : 0;

    var hitChance = baseAccuracy + skillBonus + agiBonus - evasion;

    if (window.hasTrait("STEADY HANDS")) hitChance += 15;

    if (window.hasTrait("FOUR EYES")) {
        var hasGlasses = sv.equip.head === "Glasses";
        var isRangedWpn = sv.equip.weapon !== "none" && !["melee", "unarmed"].includes(setup.items[sv.equip.weapon].type);
        if (!hasGlasses && isRangedWpn) hitChance -= 30;
    }

    var isNight = sv.gameDate.hour >= 18 || sv.gameDate.hour < 6;
    if (isNight && !window.hasTrait("NIGHT OWL")) hitChance -= 15;

    if (window.hasTrait("ADRENALINE") && sv.hp < sv.hp_max * 0.3) hitChance += 20;

    var isAlone = true; 
    if (window.hasTrait("SOLOIST") && isAlone) hitChance += 10;

    hitChance = Math.min(hitChance, 95);
    var roll = Math.floor(Math.random() * 100) + 1;

    if (window.hasTrait("HIGH ROLLER")) {
        if (roll <= 10) return { result: "CRIT", msg: "🎲 PURE LUCK! A wild shot connects!" };
        if (roll >  90) return { result: "MISS", msg: "🎲 BAD LUCK! You slipped!" };
    }

    var critThreshold = window.hasTrait("ANATOMIST") ? 20 : 5;

    if (roll <= critThreshold && roll <= hitChance) return { result: "CRIT", msg: "💀 CRITICAL HIT! Devastating strike!" };
    if (roll <= hitChance) return { result: "HIT",  msg: "Target eliminated." };
    return { result: "MISS", msg: "Shot missed!" };
};

window.combatTurn = function (targetIndex) {
    var sv = State.variables;
    var horde = sv.horde;
    var wpnName = sv.equip.weapon;
    var wpnData, skillLevel;

    // --- Weapon Check & Accuracy Scaling ---
    if (wpnName === "none" || !setup.items[wpnName]) {
        var baseAcc = window.hasTrait("KNOCKOUT") ? 60 : 40;
        var damageType = window.hasTrait("KNOCKOUT") ? "heavy" : "normal";
        wpnData = { name: "Fists", type: "weapon", acc: baseAcc, targets: 1, unarmedDamage: damageType };
        skillLevel = sv.skills.melee;
    } else {
        wpnData = setup.items[wpnName];
        skillLevel = sv.skills.melee; 
    }

    // --- Ammo Inventory Check ---
    var requiredAmmo = setup.ammoMap[wpnName];
    var inv = sv.inventory;

    if (requiredAmmo) {
        var ammoIndex = inv.findIndex(function (item) { return item.id === requiredAmmo; });

        if (ammoIndex === -1 || inv[ammoIndex].qty <= 0) {
            alert("CLICK! Out of " + requiredAmmo + "!");
            return;
        }

        inv[ammoIndex].qty--;
        if (inv[ammoIndex].qty <= 0) inv.splice(ammoIndex, 1);
        skillLevel = sv.skills.shooting; 

    } else if (wpnName !== "none") {
        skillLevel = sv.skills.melee;
    }

    // --- Turn Evaluation ---
    var report = [];
    var deadIndices = [];
    var primary = horde[targetIndex];

    if (primary) {
        var hit = window.calcHit(wpnData.acc, skillLevel, primary);

        if (hit.result === "HIT" || hit.result === "CRIT") {
            deadIndices.push(targetIndex);

            if (wpnName === "none") {
                report.push(wpnData.unarmedDamage === "heavy"
                    ? "👊 KNOCKOUT! You crushed " + primary.name + "'s skull!"
                    : "👊 You shoved/stomped " + primary.name + " to death!"
                );
            } else {
                report.push("✅ " + hit.msg);
            }

            if (hit.result === "CRIT" && window.hasTrait("HOME RUN")) {
                report.push("⚾ HOME RUN! Sent it flying!");
            }
        } else {
            report.push("❌ " + hit.msg);
            if (window.hasTrait("IRON GRIP") && wpnData.type === "weapon") {
                report.push("🏗️ Your weapon's weight creates knockback!");
            }
        }
    }

    // --- Cleave / Multi-target Damage Calculations ---
    var maxTargets = wpnData.targets || 1;
    if (maxTargets > 1 && horde.length > 1) {
        var targetsHit = 1; 

        for (var i = 0; i < horde.length; i++) {
            if (i === targetIndex || deadIndices.includes(i) || targetsHit >= maxTargets) continue;

            var spreadHit = window.calcHit(wpnData.acc - 15, skillLevel, horde[i]);

            if (spreadHit.result === "HIT" || spreadHit.result === "CRIT") {
                deadIndices.push(i);
                report.push("💥 Spread shot hit " + horde[i].name + "!");
            }
            targetsHit++;
        }
    }

    deadIndices.sort(function (a, b) { return b - a; });
    deadIndices.forEach(function (j) { horde.splice(j, 1); });

    // --- Silent Hunter Recovery Mechanic ---
    if (window.hasTrait("SILENT HUNTER") && wpnName === "Compound Bow" && deadIndices.length > 0) {
        var arrowsBack = Math.ceil(deadIndices.length * 0.5);
        if (arrowsBack > 0) {
            setup.addItem("Arrows", arrowsBack);
            report.push("🏹 Retrieved " + arrowsBack + " arrow(s).");
        }
    }

    var combatLog = document.getElementById('combat-log');
    if (combatLog) {
        window.animateCombatLine(combatLog, report.join(' | '));
        Engine.play(passage());
    } else {
        alert(report.join("\n"));
        Engine.play(passage());
    }
};


// -----------------------------------------------------------------
// 9. VISUAL EFFECTS & LORE
// -----------------------------------------------------------------

window.shakeScreen = function (intensity) {
    if (!window.animeReady) return;
    intensity = intensity || 10;
    anime({
        targets:   '#passages',
        translateX: [
            { value: -intensity,        duration: 60 },
            { value:  intensity,        duration: 60 },
            { value: -intensity * 0.6,  duration: 55 },
            { value:  intensity * 0.6,  duration: 55 },
            { value: -intensity * 0.25, duration: 45 },
            { value:  0,                duration: 45 }
        ],
        easing: 'easeInOutSine'
    });
};

window.typeTerminal = function (elementId, lines) {
    var element = document.getElementById(elementId);
    if (!element) return;

    var lineIndex = 0;
    var charIndex = 0;
    var cursor = null;
    var cursorAnim = null;

    if (window.animeReady) {
        cursor = document.createElement('span');
        cursor.id = 'terminal-cursor';
        cursor.textContent = '█';
        cursor.style.cssText = ['display:inline-block', 'color:inherit', 'margin-left:2px', 'opacity:1'].join(';');
        element.appendChild(cursor);

        cursorAnim = anime({
            targets:   cursor, 
            opacity:   [1, 0], 
            duration:  530, 
            loop:      true, 
            direction: 'alternate', 
            easing:    'steps(1)'
        });
    }

    function typeChar() {
        if (lineIndex >= lines.length) {
            if (cursor && cursorAnim) {
                cursorAnim.pause();
                setTimeout(function () {
                    if (window.animeReady) {
                        anime({
                            targets:  cursor, 
                            opacity:  0, 
                            duration: 400, 
                            easing:   'easeOutQuad',
                            complete: function () { 
                                if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor); 
                            }
                        });
                    } else if (cursor && cursor.parentNode) {
                        cursor.parentNode.removeChild(cursor);
                    }
                }, 2000); 
            }

            var btn = document.getElementById("terminal-finish");
            if (btn) btn.style.display = "block";
            return;
        }

        var currentLine = lines[lineIndex];

        if (charIndex === 0) {
            var lineDiv = document.createElement("div");
            lineDiv.className = "terminal-line";
            lineDiv.id = "line-" + lineIndex;
            if (cursor) {
                element.insertBefore(lineDiv, cursor);
            } else {
                element.appendChild(lineDiv);
            }
        }

        var currentDiv = document.getElementById("line-" + lineIndex);

        if (charIndex < currentLine.text.length) {
            currentDiv.innerHTML += currentLine.text.charAt(charIndex);
            charIndex++;
            setTimeout(typeChar, currentLine.speed || 30);
        } else {
            lineIndex++;
            charIndex = 0;
            setTimeout(typeChar, currentLine.pause || 500);
        }
    }
    typeChar(); 
};

window.openLore = function () {
    var sv = State.variables;
    Dialog.setup("LORE DATABASE");
    
    // Lore content container (Removed internal scrolling so the main window handles it)
    var html = '<div style="text-align:left; width: 100%;">';
    
    if (!sv.loreDatabase || sv.loreDatabase.length === 0) {
        html += '<p style="text-align:center; color:#666; margin-top:20px;">No data recovered.</p>';
    } else {
        sv.loreDatabase.forEach(function(entry) {
            html += '<div style="margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">';
            html += '<h3 style="color:var(--accent-gold); margin:0 0 5px 0; text-transform: uppercase;">' + entry.title + '</h3>';
            html += '<p style="color:#aaa; font-size:0.9em; margin:0; line-height:1.4;">' + entry.text + '</p>';
            html += '</div>';
        });
    }
    html += '</div>';

    // -----------------------------------------------------------------
    // THE SAFE BACK BUTTON (Sticky pinned to the bottom of the window)
    // -----------------------------------------------------------------
    html += '<div style="position: sticky; bottom: -20px; background-color: #0b0b0b; z-index: 1000; text-align:center; margin-top: 15px; margin-bottom: -20px; padding: 15px 0 20px 0; border-top:1px dashed #333;">';
    html += '<button onclick="SugarCube.Dialog.setup(\'SURVIVOR PDA\'); SugarCube.Dialog.wiki(SugarCube.Story.get(\'PDA_Overlay\').text); SugarCube.Dialog.open();" style="width: auto !important; padding: 10px 30px !important; margin: 0 auto !important; border-color: var(--accent-blue) !important; color: var(--accent-blue) !important;">◄ BACK TO PDA</button>';
    html += '</div>';
    
    Dialog.wiki(html);
    Dialog.open();
};

window.addLore = function(title, text) {
    var sv = State.variables;
    if (!sv.loreDatabase) sv.loreDatabase = [];
    if (!sv.loreDatabase.find(item => item.title === title)) {
        sv.loreDatabase.push({ title: title, text: text });
    }
};


// -----------------------------------------------------------------
// 10. RADAR CHART GENERATOR (SVG Native Representation)
// -----------------------------------------------------------------

window.renderRadar = function(type) {
    var sv = State.variables;
    var isAttr = (type === 'attribute');
    
    var labels = isAttr 
        ? ['STR', 'INT', 'AGI', 'CHA', 'PER'] 
        : ['SHOOTING', 'MELEE', 'STEALTH', 'TECH', 'MEDICINE', 'SCAVENGE'];
    
    var originalValues = isAttr 
        ? [sv.str || 1, sv.int || 1, sv.agi || 1, sv.cha || 1, sv.per || 1] 
        : [sv.skills.shooting || 0, sv.skills.melee || 0, sv.skills.stealth || 0, sv.skills.tech || 0, sv.skills.medicine || 0, sv.skills.scavenging || 0];
    
    var scaledValues = originalValues; 
    var maxVal = isAttr ? 10 : 5;
    
    var size = 250;
    var center = size / 2;
    var radius = 80; 
    var numPoints = labels.length;
    var angleStep = (Math.PI * 2) / numPoints;
    
    var fillColor = isAttr ? 'rgba(58, 95, 60, 0.4)' : 'rgba(211, 84, 0, 0.4)';
    var strokeColor = isAttr ? '#4caf50' : '#ff9800'; 
    var webColor = '#333';
    var labelColor = '#ccc';

    var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">';
    
    // 1. Structural Grid lines
    var rings = maxVal; 
    for (var r = 1; r <= rings; r++) {
        var ringRadius = radius * (r / rings);
        var ringPoints = "";
        for (var i = 0; i < numPoints; i++) {
            var angle = (i * angleStep) - (Math.PI / 2); 
            var x = center + ringRadius * Math.cos(angle);
            var y = center + ringRadius * Math.sin(angle);
            ringPoints += x + "," + y + " ";
        }
        svg += '<polygon points="' + ringPoints + '" fill="none" stroke="' + webColor + '" stroke-width="1" />';
    }

    // 2. Structural Axises, Labels, and Tactical Value Boxes
    for (var i = 0; i < numPoints; i++) {
        var angle = (i * angleStep) - (Math.PI / 2);
        var x = center + radius * Math.cos(angle);
        var y = center + radius * Math.sin(angle);
        svg += '<line x1="' + center + '" y1="' + center + '" x2="' + x + '" y2="' + y + '" stroke="' + webColor + '" stroke-width="1" />';
        
        // Pushed slightly further out (from 20 to 28) so the boxes don't touch the web
        var labelX = center + (radius + 28) * Math.cos(angle);
        var labelY = center + (radius + 28) * Math.sin(angle);
        
        // 2a. Draw the text label (e.g., "STR", "STEALTH")
        svg += '<text x="' + labelX + '" y="' + (labelY - 8) + '" fill="' + labelColor + '" font-family="Oswald, monospace" font-size="11px" font-weight="bold" text-anchor="middle" dominant-baseline="middle">' + labels[i] + '</text>';
        
        // 2b. Draw the Basara-style dark box underneath the text
        var boxW = 28;
        var boxH = 16;
        svg += '<rect x="' + (labelX - (boxW/2)) + '" y="' + labelY + '" width="' + boxW + '" height="' + boxH + '" fill="#0b0b0b" stroke="#333" stroke-width="1" rx="2" ry="2" />';
        
        // 2c. Draw the Number Value inside the box, colored to match the chart!
        svg += '<text x="' + labelX + '" y="' + (labelY + 9) + '" fill="' + strokeColor + '" font-family="Courier Prime, monospace" font-size="11px" font-weight="bold" text-anchor="middle" dominant-baseline="middle">' + originalValues[i] + '</text>';
    }

    // 3. Coordinate Scaling and Interactive Elements
    var statPoints = "";
    var dotPoints = "";
    for (var i = 0; i < numPoints; i++) {
        var angle = (i * angleStep) - (Math.PI / 2);
        var pct = Math.min(Math.max(scaledValues[i] / maxVal, 0), 1); 
        var x = center + (radius * pct) * Math.cos(angle);
        var y = center + (radius * pct) * Math.sin(angle);
        statPoints += x + "," + y + " ";
        
        dotPoints += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="' + strokeColor + '" stroke="#fff" stroke-width="1.5" style="cursor: pointer;">' +
                     '<title>' + labels[i] + ': ' + originalValues[i] + '</title>' +
                     '</circle>';
    }
    
    // 4. Transform Animation Wrapping
    svg += '<g class="radar-anim-' + type + '" style="transform-origin: ' + center + 'px ' + center + 'px; transform: scale(0); opacity: 0;">';
    svg += '<polygon points="' + statPoints + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2" style="pointer-events: none;" />';
    svg += dotPoints;
    svg += '</g>'; 

    svg += '</svg>';

    // 5. Initial Entrance Tween trigger
    setTimeout(function() {
        if (window.animeReady) {
            anime({
                targets: '.radar-anim-' + type,
                scale:   [0, 1],
                opacity: [0, 1],
                duration: 800,
                easing:  'easeOutElastic(1, .5)'
            });
        }
    }, window.ANIM_DELAY || 50);

    return svg;
};


// ─── GLOBAL VISITED OVERRIDE FOR CABIN SYSTEM ─────────────────────────
if (typeof window.originalVisited === 'undefined' && typeof window.visited === 'function') {
    window.originalVisited = window.visited;
    window.visited = function () {
        var passageName = arguments[0];
        if (passageName === "Act2_5_MarcusCabin" && typeof State !== 'undefined' && State.variables) {
            if (State.variables.debug_visited_cabin === true) {
                return 1;
            } else if (State.variables.debug_visited_cabin === false) {
                return 0;
            }
        }
        return window.originalVisited.apply(this, arguments);
    };
}

// -----------------------------------------------------------------
// 11. DEBUG PANEL LOGIC
// -----------------------------------------------------------------

window.initDebugPanel = function () {
    'use strict';

    var prevPassage = State.variables.returnPassage || 'Act3_SchoolGFloor';

    function getVar(key)        { return State.variables[key]; }
    function setVar(key, value) { State.variables[key] = value; }
    function byId(id)           { return document.getElementById(id); }
    function setText(id, text)  { var el = byId(id); if (el) el.textContent = text; }

    function on(id, eventName, handler) {
        var el = byId(id);
        if (el) el.addEventListener(eventName, handler);
        return el;
    }

    function ensureArrayVar(key) {
        var value = getVar(key);
        if (!Array.isArray(value)) { 
            value = []; 
            setVar(key, value); 
        }
        return value;
    }

    function ensureObjectVar(key) {
        var value = getVar(key);
        if (!value || typeof value !== 'object' || Array.isArray(value)) { 
            value = {}; 
            setVar(key, value); 
        }
        return value;
    }

    // ─── Bind Inputs ───
    function bindSlider(config) {
        var slider = byId(config.sliderId);
        var valueEl = byId(config.valueId);
        if (!slider || !valueEl) return;

        var current = getVar(config.varName);
        var startValue = (current != null) ? current : config.fallback;
        slider.value = startValue;
        valueEl.textContent = startValue;

        slider.addEventListener('input', function () {
            var next = parseInt(this.value, 10);
            setVar(config.varName, next);
            valueEl.textContent = this.value;
        });
    }

    // ─── Time Control Config ───
    function initTimeControl() {
        var hourInput = byId('time-hour');
        var minuteInput = byId('time-minute');
        var setBtn = byId('time-set');
        
        if (!hourInput || !minuteInput || !setBtn) return;
        
        var gameDate = getVar('gameDate');
        if (gameDate) {
            hourInput.value = gameDate.hour;
            minuteInput.value = gameDate.minute;
        }
        
        setBtn.addEventListener('click', function () {
            var hr = parseInt(hourInput.value, 10);
            var min = parseInt(minuteInput.value, 10);
            
            if (isNaN(hr) || hr < 0 || hr > 23) {
                alert("Please enter a valid hour (0-23).");
                return;
            }
            if (isNaN(min) || min < 0 || min > 59) {
                alert("Please enter a valid minute (0-59).");
                return;
            }
            
            var gDate = ensureObjectVar('gameDate');
            gDate.hour = hr;
            gDate.minute = min;
            setVar('gameDate', gDate);
            
            setBtn.classList.add('on');
            setTimeout(function () { 
                setBtn.classList.remove('on'); 
            }, 800);
        });
    }

    function bindSkill(config) {
        var valueEl = byId(config.valueId);
        var upBtn = byId(config.upId);
        var downBtn = byId(config.downId);
        if (!valueEl || !upBtn || !downBtn) return;

        function readSkill() { 
            return (getVar('skills') || {})[config.skillName] || 0; 
        }
        
        function writeSkill(val) {
            var skills = ensureObjectVar('skills');
            skills[config.skillName] = val;
            setVar('skills', skills);
            valueEl.textContent = val;
        }

        valueEl.textContent = readSkill();
        upBtn.addEventListener('click',   function () { writeSkill(Math.min(5, readSkill() + 1)); });
        downBtn.addEventListener('click', function () { writeSkill(Math.max(0, readSkill() - 1)); });
    }

    // ─── Toggle Flags Configurations ───
    var groups = {
        'marcus': [
            'room405_opened',
            'read_marcus_phone',
            'cleaned_remington',
            'looted_405_shotgun',
            'looted_405_knife',
            'looted_405_food',
            'looted_405_medkit',
            'looted_405_ammocrate',
            'read_405_journal'
        ],
        'room406': [
            'room406_opened',
            'studied_406_mechanics',
            'studied_406_anatomy',
            'read_406_journal',
            'looted_406',
            'looted_406_kitchen'
        ],
        'utility': [
            'utility_opened',
            'read_utility_log',
            'looted_utility_flashlight',
            'looted_utility_bleach',
            'looted_utility_gloves',
            'looted_utility_tape',
            'looted_utility_rope',
            'looted_utility_batteries'
        ]
    };

    var groupFailures = {
        'marcus':  ['room405_bruteforce_fail'],
        'room406': ['room406_bruteforce_fail', 'room406_locked_out'],
        'utility': ['utility_bruteforce_fail']
    };

    function initSelect(id, varName, subKey) {
        var select = byId(id);
        if (!select) return;

        var current = subKey ? (getVar(varName) || {})[subKey] : getVar(varName);
        if (current != null && current !== '') select.value = current;

        select.addEventListener('change', function () {
            if (subKey) {
                var obj = ensureObjectVar(varName);
                obj[subKey] = this.value;
                setVar(varName, obj);
            } else {
                setVar(varName, this.value);
            }
        });
    }

    // ─── UI Sync and Updaters ───
    function refreshStatUi() {
        var statKeys = ['str', 'agi', 'per', 'cha', 'int', 'hum', 'hp', 'stamina', 'hunger', 'thirst', 'trust'];
        for (var i = 0; i < statKeys.length; i++) {
            var key = statKeys[i];
            var slider = byId('sl-' + key);
            var valueEl = byId('vl-' + key);
            if (!slider || !valueEl) continue;
            var varLookupKey = (key === 'trust') ? 'safehouseTrust' : key;
            var fallback = (key === 'hp' || key === 'stamina' || key === 'hunger' || key === 'thirst') ? 100 : (key === 'hum' ? 50 : (key === 'trust' ? 0 : 5));
            var value = (getVar(varLookupKey) != null) ? getVar(varLookupKey) : fallback;
            slider.value = value;
            valueEl.textContent = value;
        }
    }

    function refreshFlagUi() {
        var flagButtons = document.querySelectorAll('[data-flag]');
        for (var i = 0; i < flagButtons.length; i++) {
            var btn = flagButtons[i];
            var flagName = btn.getAttribute('data-flag');
            
            var isActive = false;
            if (flagName === 'visit_marcus_cabin') {
                isActive = State.expired && State.expired.indexOf('Act2_5_MarcusCabin') > -1;
            } else {
                isActive = getVar(flagName) === true;
            }
            
            if (isActive) btn.classList.add('on');
            else btn.classList.remove('on');
        }
    }

    function initFlags() {
        var flagButtons = document.querySelectorAll('[data-flag]');
        for (var i = 0; i < flagButtons.length; i++) {
            (function (btn) {
                var flagName = btn.getAttribute('data-flag');
                
                var isActive = false;
                if (flagName === 'visit_marcus_cabin') {
                    isActive = State.expired && State.expired.indexOf('Act2_5_MarcusCabin') > -1;
                } else {
                    isActive = getVar(flagName) === true;
                }
                
                if (isActive) btn.classList.add('on');

                btn.addEventListener('click', function () {
                    if (flagName === 'visit_marcus_cabin') {
                        if (!Array.isArray(State.expired)) {
                            State.expired = [];
                        }
                        var idx = State.expired.indexOf('Act2_5_MarcusCabin');
                        var next;
                        if (idx > -1) {
                            State.expired = State.expired.filter(function(title) { return title !== 'Act2_5_MarcusCabin'; });
                            next = false;
                        } else {
                            State.expired.push('Act2_5_MarcusCabin');
                            next = true;
                        }
                        if (next) btn.classList.add('on');
                        else btn.classList.remove('on');
                    } else {
                        var next = !(getVar(flagName) === true);
                        setVar(flagName, next);
                        if (next) btn.classList.add('on');
                        else btn.classList.remove('on');
                    }
                    refreshGroupUi();
                });
            })(flagButtons[i]);
        }
    }

    function refreshGroupUi() {
        var groupButtons = document.querySelectorAll('[data-group]');
        for (var i = 0; i < groupButtons.length; i++) {
            var btn = groupButtons[i];
            var groupName = btn.getAttribute('data-group');
            var keys = groups[groupName];
            if (keys) {
                var allOn = keys.every(function(key) { return getVar(key) === true; });
                if (allOn) btn.classList.add('on');
                else btn.classList.remove('on');
            }
        }
    }

    function initGroups() {
        var groupButtons = document.querySelectorAll('[data-group]');
        for (var i = 0; i < groupButtons.length; i++) {
            (function (btn) {
                var groupName = btn.getAttribute('data-group');
                btn.addEventListener('click', function () {
                    var keys = groups[groupName];
                    if (!keys) return;

                    var anyOff = keys.some(function(key) { return getVar(key) !== true; });
                    keys.forEach(function (key) {
                        setVar(key, anyOff);
                    });

                    var fails = groupFailures[groupName];
                    if (fails) {
                        fails.forEach(function (failKey) {
                            setVar(failKey, false);
                        });
                    }

                    refreshFlagUi();
                    refreshGroupUi();
                });
            })(groupButtons[i]);
        }
    }

    function refreshSkillUi() {
        var shortToSkill = { sh: 'shooting', me: 'melee', md: 'medicine', st: 'stealth', sc: 'scavenging', tc: 'tech' };
        for (var key in shortToSkill) {
            if (!Object.prototype.hasOwnProperty.call(shortToSkill, key)) continue;
            var valueEl = byId('sk-' + key + '-v');
            if (valueEl) valueEl.textContent = (getVar('skills') || {})[shortToSkill[key]] || 0;
        }
    }

    function refreshCompanions() {
        var companions = getVar('companions');
        setText('c-list', (Array.isArray(companions) && companions.length) ? companions.join(', ') : '(none)');
    }

    function refreshBag() {
        var inventory = getVar('inventory');
        if (!Array.isArray(inventory) || !inventory.length) { 
            setText('bag-preview', '(empty)'); 
            return; 
        }
        setText('bag-preview', inventory.map(function (item) { return item.id + ' x' + item.qty; }).join(', '));
    }

    // ─── Debug Presets ───
    function applyPreset(preset) {
        var keys = Object.keys(preset);
        for (var i = 0; i < keys.length; i++) setVar(keys[i], preset[keys[i]]);
        refreshStatUi();
        refreshSkillUi();
        var jobSelect = byId('sel-job');
        if (jobSelect && getVar('job')) jobSelect.value = getVar('job');
    }

    function initPresets() {
        var presets = {
            'p-max':     { str: 10, agi: 10, per: 10, cha: 10, int: 10, hum: 100, hp: 100, stamina: 100, hunger: 100, thirst: 100, safehouseTrust: 100, skills: { shooting: 5, melee: 5, medicine: 5, stealth: 5, scavenging: 5, tech: 5 } },
            'p-combat':  { str: 8,  agi: 6,  per: 5,  cha: 3,  int: 4,  hum: 20,  hp: 100, stamina: 100, hunger: 80,  thirst: 80,  skills: { shooting: 2, melee: 3, medicine: 0, stealth: 1, scavenging: 2, tech: 1 } },
            'p-talker':  { str: 3,  agi: 4,  per: 6,  cha: 8,  int: 7,  hum: 60,  hp: 80,  stamina: 80,  hunger: 80,  thirst: 80,  skills: { shooting: 0, melee: 0, medicine: 1, stealth: 1, scavenging: 3, tech: 2 } },
            'p-agility': { str: 5,  agi: 9,  per: 7,  cha: 5,  int: 6,  hum: 30,  hp: 90,  stamina: 90,  hunger: 80,  thirst: 80,  skills: { shooting: 1, melee: 1, medicine: 0, stealth: 3, scavenging: 4, tech: 2 } },
            'p-cop':     { str: 7,  agi: 6,  per: 6,  cha: 6,  int: 5,  hum: 40,  hp: 100, stamina: 100, hunger: 100, thirst: 100, skills: { shooting: 2, melee: 1, medicine: 0, stealth: 0, scavenging: 1, tech: 1 }, job: 'Police Officer' },
            'p-doc':     { str: 4,  agi: 5,  per: 7,  cha: 7,  int: 9,  hum: 70,  hp: 90,  stamina: 90,  hunger: 100, thirst: 100, skills: { shooting: 0, melee: 0, medicine: 3, stealth: 1, scavenging: 1, tech: 2 }, job: 'Doctor' },
            'p-min':     { str: 1,  agi: 1,  per: 1,  cha: 1,  int: 1,  hum: 10,  hp: 20,  stamina: 20,  hunger: 20,  thirst: 20,  safehouseTrust: 0, skills: { shooting: 0, melee: 0, medicine: 0, stealth: 0, scavenging: 0, tech: 0 } }
        };
        var ids = Object.keys(presets);
        for (var i = 0; i < ids.length; i++) {
            (function (id) { 
                on(id, 'click', function () { applyPreset(presets[id]); }); 
            })(ids[i]);
        }
    }

    // ─── Debug Trait Setter ───
    var PERK_INFO = {
        "STEADY HANDS": { icon: "image/perks/steady_hands.png", desc: "+15 Accuracy bonus." },
        "AUTHORITY": { icon: "image/perks/authority.png", desc: "Command NPCs in crisis." },
        "BREACHER": { icon: "image/perks/breacher.png", desc: "Smash locked doors with force." },
        "IRON GRIP": { icon: "image/perks/iron_grip.png", desc: "Knockback enemies on miss." },
        "LOCKSMITH": { icon: "image/perks/locksmith.png", desc: "Open locks silently." },
        "GHOST": { icon: "image/perks/ghost.png", desc: "Harder for enemies to hit you." },
        "FIELD MEDIC": { icon: "image/perks/field_medic.png", desc: "Healing items restore 2x HP." },
        "ANATOMIST": { icon: "image/perks/anatomist.png", desc: "High critical hit chance." },
        "SILVER TONGUE": { icon: "image/perks/silver_tongue.png", desc: "Better trade prices with NPCs." },
        "INSPIRATION": { icon: "image/perks/inspiration.png", desc: "Companions gain +10 Accuracy." },
        "FAST LEARNER": { icon: "image/perks/fast_learner.png", desc: "Gain XP 2x faster." },
        "ADRENALINE": { icon: "image/perks/adrenaline.png", desc: "Stats boost when HP below 30%." },

        "RUNNER": { icon: "image/perks/sprinter.png", desc: "Can Flee twice." },
        "MECHANIC": { icon: "image/perks/hotwire.png", desc: "Start cars without keys." },
        "HUNTER": { icon: "image/perks/tracker.png", desc: "Spot ambushes early." },
        "BOXER": { icon: "image/perks/knockout.png", desc: "Unarmed attacks deal heavy damage." },
        "GAMER": { icon: "image/perks/strategist.png", desc: "See % Chance of success." },
        "HIKER": { icon: "image/perks/pack_mule.png", desc: "+2 Inventory Slots." },
        "ARCHER": { icon: "image/perks/silent_hunter.png", desc: "Retrieve arrows after kill." },
        "GARDENER": { icon: "image/perks/herbalist.png", desc: "Water/Food heal extra." },
        "BASEBALL": { icon: "image/perks/home_run.png", desc: "100% Knockdown on Crit." },
        "BOOKWORM": { icon: "image/perks/theory.png", desc: "Can attempt untrained Skill Checks." },
        "WATCHMAN": { icon: "image/perks/night_owl.png", desc: "No accuracy penalty at night." },
        "DEBATER": { icon: "image/perks/lie_detector.png", desc: "Detect deceit." },
        "CHEF": { icon: "image/perks/cook.png", desc: "Create meals from raw items." },
        "PARKOUR": { icon: "image/perks/climber.png", desc: "Access vertical paths." },
        "VOLUNTEER": { icon: "image/perks/compassion.png", desc: "Heal morale faster." },

        "SMOKER": { icon: "image/perks/addict.png", desc: "-20 Stamina. Needs Nicotine." },
        "ALCOHOLIC": { icon: "image/perks/liquid_courage.png", desc: "+20 HP. -1 Int. Reduced Pain." },
        "ASTHMATIC": { icon: "image/perks/wheezy.png", desc: "Cannot run without Inhaler." },
        "BLIND": { icon: "image/trait/trait_blind.png", desc: "Needs glasses to shoot." },
        "BAD KNEE": { icon: "image/perks/hobble.png", desc: "Cannot Flee." },
        "GLUTTON": { icon: "image/perks/hungry.png", desc: "Must eat 2x Food." },
        "FRAGILE": { icon: "image/perks/bleeder.png", desc: "Bleeding deals double damage." },
        "PARANOID": { icon: "image/perks/trust_no_one.png", desc: "Cannot sleep near NPCs." },
        "INSOMNIAC": { icon: "image/perks/nocturnal.png", desc: "-10 HP. Night Vision." },
        "CLEAN": { icon: "image/perks/sterile.png", desc: "Healing items give +20 HP." },
        "COWARD": { icon: "image/perks/flight.png", desc: "-Damage. High escape chance." },
        "PYRO": { icon: "image/perks/burn.png", desc: "Fire weapons deal +50% DMG." },
        "LONE WOLF": { icon: "image/perks/soloist.png", desc: "+10% Stats when alone." },
        "LUDDITE": { icon: "image/perks/analog.png", desc: "Cannot use electronics." },
        "PACIFIST": { icon: "image/perks/diplomat.png", desc: "Unique peaceful choices." },
        "CLUMSY": { icon: "image/perks/noisy.png", desc: "Start encounters at high alert." },
        "GAMBLER": { icon: "image/perks/high_roller.png", desc: "10% Auto-Hit or Auto-Miss." },
        "SHELTERED": { icon: "image/perks/optimist.png", desc: "Starts with +20 Humanity." },
        "SHOPPER": { icon: "image/perks/barterer.png", desc: "Sell luxury items for 200%." },
        "ARROGANT": { icon: "image/perks/know_it_all.png", desc: "Companions dislike you." }
    };

    function initTraits() {
        var buttons = document.querySelectorAll('[data-trait]');
        for (var i = 0; i < buttons.length; i++) {
            (function (button) {
                var traitName = button.getAttribute('data-trait');
                var acquired = getVar('acquiredTraits');
                if (Array.isArray(acquired) && acquired.indexOf(traitName) > -1) {
                    button.classList.add('on');
                }

                button.addEventListener('click', function () {
                    var acquiredTraits = ensureArrayVar('acquiredTraits');
                    var traits = ensureArrayVar('traits');
                    var idx = acquiredTraits.indexOf(traitName);

                    if (idx > -1) {
                        acquiredTraits.splice(idx, 1);
                        for (var j = traits.length - 1; j >= 0; j--) {
                            if (traits[j].name === traitName) traits.splice(j, 1);
                        }
                        button.classList.remove('on');
                    } else {
                        acquiredTraits.push(traitName);
                        var traitExists = false;
                        for (var k = 0; k < traits.length; k++) {
                            if (traits[k].name === traitName) { 
                                traitExists = true; 
                                break; 
                            }
                        }
                        if (!traitExists) {
                            var info = PERK_INFO[traitName] || { icon: '🔧', desc: '(debug)' };
                            traits.push({ name: traitName, icon: info.icon, desc: info.desc });
                        }
                        button.classList.add('on');
                    }
                    setVar('acquiredTraits', acquiredTraits);
                    setVar('traits', traits);
                });
            })(buttons[i]);
        }

        
        var jobBtns = document.querySelectorAll('.job-btn');
        for (var i = 0; i < jobBtns.length; i++) {
            (function (button) {
                var t1 = button.getAttribute('data-trait1');
                var t2 = button.getAttribute('data-trait2');
                var acquired = getVar('acquiredTraits') || [];
                
                if (acquired.indexOf(t1) > -1 && acquired.indexOf(t2) > -1) {
                    button.classList.add('on');
                }
                
                button.addEventListener('click', function () {
                    var acquiredTraits = ensureArrayVar('acquiredTraits');
                    var traits = ensureArrayVar('traits');
                    
                    function toggleTrait(traitName) {
                        var idx = acquiredTraits.indexOf(traitName);
                        if (idx > -1) {
                            acquiredTraits.splice(idx, 1);
                            for (var j = traits.length - 1; j >= 0; j--) {
                                if (traits[j].name === traitName) traits.splice(j, 1);
                            }
                            return false;
                        } else {
                            acquiredTraits.push(traitName);
                            var traitExists = false;
                            for (var k = 0; k < traits.length; k++) {
                                if (traits[k].name === traitName) { 
                                    traitExists = true; 
                                    break; 
                                }
                            }
                            if (!traitExists) {
                                var info = PERK_INFO[traitName] || { icon: '🔧', desc: '(debug)' };
                                traits.push({ name: traitName, icon: info.icon, desc: info.desc });
                            }
                            return true;
                        }
                    }
                    
                    var state1 = toggleTrait(t1);
                    var state2 = toggleTrait(t2);
                    
                    if (state1 || state2) {
                        button.classList.add('on');
                    } else {
                        button.classList.remove('on');
                    }
                    
                    setVar('acquiredTraits', acquiredTraits);
                    setVar('traits', traits);
                });
            })(jobBtns[i]);
        }

        on('trait-clear-all', 'click', function () {
            setVar('acquiredTraits', []);
            setVar('traits', []);
            var allButtons = document.querySelectorAll('[data-trait]');
            for (var i = 0; i < allButtons.length; i++) {
                allButtons[i].classList.remove('on');
            }
            var allJobBtns = document.querySelectorAll('.job-btn');
            for (var i = 0; i < allJobBtns.length; i++) {
                allJobBtns[i].classList.remove('on');
            }
        });
    }

    // ─── Add/Modify Items ───
    function initItems() {
        on('item-add', 'click', function () {
            var itemSelect = byId('item-select');
            var qtyInput = byId('item-qty');
            if (!itemSelect || !qtyInput) return;

            var itemId = itemSelect.value;
            var qty = parseInt(qtyInput.value, 10) || 1;
            qty = Math.max(1, Math.min(99, qty));

            var inventory = ensureArrayVar('inventory');
            var existing = null;
            for (var i = 0; i < inventory.length; i++) {
                if (inventory[i].id === itemId) { 
                    existing = inventory[i]; 
                    break; 
                }
            }

            if (existing) existing.qty += qty;
            else inventory.push({ id: itemId, qty: qty });

            setVar('inventory', inventory);
            refreshBag();
        });

        on('item-clear-bag', 'click', function () { 
            setVar('inventory', []); 
            refreshBag(); 
        });
    }

    // ─── Companion Flags Modifier ───
    function initCompanions() {
        // VANE
        on('c-add-vane', 'click', function () {
            var companions = ensureArrayVar('companions');
            if (companions.indexOf('Vane') === -1) companions.push('Vane');
            setVar('companions', companions);
            setVar('vane_status', 'joined');
            refreshCompanions();
        });
        on('c-rem-vane', 'click', function () {
            var companions = (getVar('companions') || []).filter(function (n) { return n !== 'Vane'; });
            setVar('companions', companions);
            setVar('vane_status', 'alive');
            refreshCompanions();
        });

        // MAYA + LILY
        on('c-add-maya', 'click', function () {
            var companions = ensureArrayVar('companions');
            if (companions.indexOf('Maya') === -1) companions.push('Maya');
            if (companions.indexOf('Lily') === -1) companions.push('Lily');
            setVar('companions', companions);
            setVar('maya_status', 'joined');
            refreshCompanions();
        });
        on('c-rem-maya', 'click', function () {
            var companions = (getVar('companions') || []).filter(function (n) { return n !== 'Maya' && n !== 'Lily'; });
            setVar('companions', companions);
            setVar('maya_status', 'alive');
            refreshCompanions();
        });

        // DIANE + BOYS
        on('c-add-diane', 'click', function () {
            var companions = ensureArrayVar('companions');
            if (companions.indexOf('Diane') === -1)    companions.push('Diane');
            if (companions.indexOf('The Boys') === -1) companions.push('The Boys');
            setVar('companions', companions);
            refreshCompanions();
        });
        on('c-rem-diane', 'click', function () {
            var companions = (getVar('companions') || []).filter(function (n) { return n !== 'Diane' && n !== 'The Boys'; });
            setVar('companions', companions);
            refreshCompanions();
        });

        // REYES
        on('c-add-reyes', 'click', function () {
            var companions = ensureArrayVar('companions');
            if (companions.indexOf('Reyes') === -1) companions.push('Reyes');
            setVar('companions', companions);
            setVar('companion_reyes', true);
            var btn = document.querySelector('[data-flag="companion_reyes"]');
            if (btn) btn.classList.add('on');
            refreshCompanions();
        });
        on('c-rem-reyes', 'click', function () {
            var companions = (getVar('companions') || []).filter(function (n) { return n !== 'Reyes'; });
            setVar('companions', companions);
            setVar('companion_reyes', false);
            var btn = document.querySelector('[data-flag="companion_reyes"]');
            if (btn) btn.classList.remove('on');
            refreshCompanions();
        });

        on('c-clear', 'click', function () {
            setVar('companions', []);
            setVar('vane_status', 'alive');
            setVar('maya_status', 'alive');
            setVar('companion_reyes', false);
            var btn = document.querySelector('[data-flag="companion_reyes"]');
            if (btn) btn.classList.remove('on');
            refreshCompanions();
        });
    }

    // ─── Passage Jumps ───
    function initNavigation() {
        on('nav-go', 'click', function () {
            var input = byId('nav-input');
            if (input && input.value.trim()) Engine.play(input.value.trim());
        });
        on('nav-input', 'keydown', function (e) {
            if (e.key === 'Enter' && this.value.trim()) Engine.play(this.value.trim());
        });

        // Act 2
        on('nav-act2-street',  'click', function () { Engine.play('Act2_TheStreet'); });
        on('nav-act2-road',    'click', function () { Engine.play('Act2_TheRoad'); });
        on('nav-act2-gas',     'click', function () { Engine.play('Act2_GasStation'); });
        on('nav-act2-highway', 'click', function () { Engine.play('Act2_Highway'); });
        on('nav-act2-cabin',   'click', function () { Engine.play('Act2_5_MarcusCabin'); });
        on('nav-act2-crash',   'click', function () { Engine.play('Act2_5_MayaCrash'); });

        // Act 3
        on('nav-act3-arrival', 'click', function () { Engine.play('Act3_Arrival'); });
        on('nav-act3-sheriff', 'click', function () { Engine.play('Act3_Sheriff'); });
        on('nav-act3-home',    'click', function () { Engine.play('Act3_Home');    });
        on('nav-act3-safe',    'click', function () { Engine.play('Act3_ArrivalSchool'); });
        on('nav-act3-hub',     'click', function () { Engine.play('Act3_SchoolGFloor'); });

        on('nav-lobby', 'click', function () {
            setVar('lobby_phase',     1);
            setVar('vane_status',     'alive');
            setVar('maya_status',     'alive');
            setVar('backpack_looted', false);
            Engine.play('Lobby_Entrance');
        });
        on('nav-return', 'click', function () { Engine.play(prevPassage); });
    }

    var sliderConfigs = [
        { sliderId: 'sl-str',     valueId: 'vl-str',     varName: 'str',            fallback: 5   },
        { sliderId: 'sl-agi',     valueId: 'vl-agi',     varName: 'agi',            fallback: 5   },
        { sliderId: 'sl-per',     valueId: 'vl-per',     varName: 'per',            fallback: 5   },
        { sliderId: 'sl-cha',     valueId: 'vl-cha',     varName: 'cha',            fallback: 5   },
        { sliderId: 'sl-int',     valueId: 'vl-int',     varName: 'int',            fallback: 5   },
        { sliderId: 'sl-hum',     valueId: 'vl-hum',     varName: 'hum',            fallback: 50  },
        { sliderId: 'sl-hp',      valueId: 'vl-hp',      varName: 'hp',             fallback: 100 },
        { sliderId: 'sl-stamina', valueId: 'vl-stamina', varName: 'stamina',        fallback: 100 },
        { sliderId: 'sl-hunger',  valueId: 'vl-hunger',  varName: 'hunger',         fallback: 100 },
        { sliderId: 'sl-thirst',  valueId: 'vl-thirst',  varName: 'thirst',         fallback: 100 },
        { sliderId: 'sl-trust',   valueId: 'vl-trust',   varName: 'safehouseTrust', fallback: 0   }
    ];

    var skillConfigs = [
        { upId: 'sk-sh-u', downId: 'sk-sh-d', valueId: 'sk-sh-v', skillName: 'shooting'   },
        { upId: 'sk-me-u', downId: 'sk-me-d', valueId: 'sk-me-v', skillName: 'melee'       },
        { upId: 'sk-md-u', downId: 'sk-md-d', valueId: 'sk-md-v', skillName: 'medicine'    },
        { upId: 'sk-st-u', downId: 'sk-st-d', valueId: 'sk-st-v', skillName: 'stealth'     },
        { upId: 'sk-sc-u', downId: 'sk-sc-d', valueId: 'sk-sc-v', skillName: 'scavenging'  },
        { upId: 'sk-tc-u', downId: 'sk-tc-d', valueId: 'sk-tc-v', skillName: 'tech'        }
    ];

    var selectConfigs = [
        { id: 'sel-job',    varName: 'job',   subKey: null     },
        { id: 'sel-weapon', varName: 'equip', subKey: 'weapon' },
        { id: 'sel-head',   varName: 'equip', subKey: 'head'   },
        { id: 'sel-body',   varName: 'equip', subKey: 'body'   },
        { id: 'sel-pants',  varName: 'equip', subKey: 'pants'  },
        { id: 'sel-boots',  varName: 'equip', subKey: 'boots'  }
    ];

    for (var i = 0; i < sliderConfigs.length; i++) bindSlider(sliderConfigs[i]);
    for (var j = 0; j < skillConfigs.length;  j++) bindSkill(skillConfigs[j]);
    for (var k = 0; k < selectConfigs.length; k++) initSelect(selectConfigs[k].id, selectConfigs[k].varName, selectConfigs[k].subKey);

    initTraits();
    initPresets();
    initItems();
    initCompanions();
    initFlags();
    initGroups();
    initNavigation();
    initTimeControl();

    function initSplitView() {
        var navItems = document.querySelectorAll('.dbg-nav-item');
        var sections = document.querySelectorAll('.dbg-section');
        
        for (var i = 0; i < navItems.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var targetId = btn.getAttribute('data-target');
                    if (!targetId) return;

                    for (var j = 0; j < navItems.length; j++) navItems[j].classList.remove('active');
                    for (var k = 0; k < sections.length; k++) sections[k].classList.remove('active');

                    btn.classList.add('active');

                    if (targetId === 'sec-all') {
                        for (var m = 0; m < sections.length; m++) {
                            sections[m].classList.add('active');
                        }
                    } else {
                        var targetSec = byId(targetId);
                        if (targetSec) targetSec.classList.add('active');
                    }

                    var contentPane = byId('dbg-content');
                    if (contentPane) contentPane.scrollTop = 0;
                });
            })(navItems[i]);
        }

        var toggleBtn = byId('dbg-toggle-sidebar');
        var sidebar = byId('dbg-sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', function () {
                sidebar.classList.toggle('collapsed');
            });
        }

        var divider = byId('dbg-divider');
        if (divider && sidebar) {
            var isDragging = false;
            var startX, startWidth;

            divider.addEventListener('mousedown', function (e) {
                isDragging = true;
                divider.classList.add('dragging');
                startX = e.clientX;
                startWidth = sidebar.offsetWidth;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging) return;
                var deltaX = e.clientX - startX;
                var newWidth = Math.max(130, Math.min(340, startWidth + deltaX));
                sidebar.style.width = newWidth + 'px';
            });

            document.addEventListener('mouseup', function () {
                if (isDragging) {
                    isDragging = false;
                    divider.classList.remove('dragging');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        }
    }

    initSplitView();

    refreshStatUi();
    refreshSkillUi();
    refreshCompanions();
    refreshBag();
    refreshFlagUi();
    refreshGroupUi();
};


// -----------------------------------------------------------------
// 12. RETRO AUDIO CONTROLS (Slim Horizontal Volume System)
// -----------------------------------------------------------------

$(document).on('input', '.volume-slider', function() {
    var val = $(this).val();
    State.variables.volMaster = parseInt(val, 10);
    Howler.volume(parseInt(val, 10) / 100);
});

$(document).on(':passagerender', function() {
    var val = State.variables.volMaster !== undefined ? State.variables.volMaster : 100;
    $('.volume-slider').val(val);
    Howler.volume(val / 100);
});

// -----------------------------------------------------------------
// 13. SVG MAP FOLLOW & ZOOM ENGINE
// -----------------------------------------------------------------

window.svgMapScale = 1.0;

// Zoom Controller
window.zoomSvgMap = function(amount) {
    window.svgMapScale += amount;
    // Restrict zoom limits between 0.5x and 2.5x
    window.svgMapScale = Math.max(0.5, Math.min(window.svgMapScale, 2.5));
    window.centerSvgMap();
};

// Automatic Map Follow & Centering Engine
window.centerSvgMap = function() {
    var container = document.getElementById('svg-map-container');
    var viewport = document.querySelector('.map-viewport') || document.querySelector('#pda-map-viewport');
    var playerLocation = State.variables.currentLocation;
    if (!container || !playerLocation) return;

    var cleanLoc = playerLocation.toString().trim();
    var activeRoom = document.getElementById(cleanLoc) || document.getElementById(cleanLoc.toLowerCase());

    if (container && activeRoom) {
        var roomCenterX = 0;
        var roomCenterY = 0;

        if (typeof activeRoom.getBBox === 'function') {
            try {
                var bbox = activeRoom.getBBox();
                var localX = bbox.x + (bbox.width / 2);
                var localY = bbox.y + (bbox.height / 2);

                // --- FIX: Account for SVG transform="matrix(...)" ---
                var ctm = activeRoom.getCTM();
                var svgEl = container.querySelector('svg');

                if (ctm && svgEl && typeof svgEl.createSVGPoint === 'function') {
                    var pt = svgEl.createSVGPoint();
                    pt.x = localX;
                    pt.y = localY;
                    var globalPt = pt.matrixTransform(ctm);
                    roomCenterX = globalPt.x;
                    roomCenterY = globalPt.y;
                } else if (ctm) {
                    roomCenterX = (localX * ctm.a) + (localY * ctm.c) + ctm.e;
                    roomCenterY = (localX * ctm.b) + (localY * ctm.d) + ctm.f;
                } else {
                    roomCenterX = localX;
                    roomCenterY = localY;
                }
            } catch (e) {
                var rx = parseFloat(activeRoom.getAttribute('x') || 0);
                var ry = parseFloat(activeRoom.getAttribute('y') || 0);
                var rw = parseFloat(activeRoom.getAttribute('width') || 50);
                var rh = parseFloat(activeRoom.getAttribute('height') || 50);
                roomCenterX = rx + (rw / 2);
                roomCenterY = ry + (rh / 2);
            }
        } else {
            var rx = parseFloat(activeRoom.getAttribute('x') || 0);
            var ry = parseFloat(activeRoom.getAttribute('y') || 0);
            var rw = parseFloat(activeRoom.getAttribute('width') || 50);
            var rh = parseFloat(activeRoom.getAttribute('height') || 50);
            roomCenterX = rx + (rw / 2);
            roomCenterY = ry + (rh / 2);
        }

        var viewWidth = (viewport && viewport.clientWidth) ? viewport.clientWidth : 280;
        var viewHeight = (viewport && viewport.clientHeight) ? viewport.clientHeight : 160;

        var viewCenterX = viewWidth / 2;
        var viewCenterY = viewHeight / 2;

        var translateX = viewCenterX - (roomCenterX * window.svgMapScale);
        var translateY = viewCenterY - (roomCenterY * window.svgMapScale);

        container.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + window.svgMapScale + ')';
    }
};

// Map Room Glow & State Updater
window.updateMapGlow = function(roomId) {
    setTimeout(function() {
        // 1. Remove old glowing indicators
        $('.current-location').removeClass('current-location');
        $('.current-room-glow').removeClass('current-room-glow');

        // 2. Identify active room
        var targetId = roomId || State.variables.currentLocation;
        if (targetId) {
            var exactId = targetId.toString().trim();
            var activeRoomEl = document.getElementById(exactId) || document.getElementById(exactId.toLowerCase());

            if (activeRoomEl) {
                // Apply visual glow and mark room as visited
                activeRoomEl.classList.add('current-location');
                activeRoomEl.classList.add('current-room-glow');
                activeRoomEl.classList.add('visited-room');
                
                // Center camera on the room
                window.centerSvgMap();
            } else {
                console.warn("PDA Map Engine: Could not find an SVG element with id='" + exactId + "'");
            }
        }
    }, 50);
};

// Listener: Runs every time a passage loads
$(document).on(':passagedisplay', function () {
    setTimeout(function() {
        
        // === ALERT ICON CLEANUP BUG FIX ===
        var sv = State.variables;
        if (sv.loot_done)   { $('#alert_loot').remove(); }
        if (sv.maya_done)   { $('#alert_maya').remove(); }
        if (sv.vane_done)   { $('#alert_vane').remove(); }
        if (sv.police_done) { $('#alert_police').remove(); }
        // ==================================

        var playerLocation = State.variables.currentLocation;
        if (playerLocation) {
            window.updateMapGlow(playerLocation);
        }
    }, 50);
});

// Listener: Auto-align camera when clicking the Map tab in PDA
$(document).on('click', '#btn-map, [data-tab="map"]', function() {
    setTimeout(function() {
        var playerLocation = State.variables.currentLocation;
        if (playerLocation) {
            window.updateMapGlow(playerLocation);
        } else {
            window.centerSvgMap();
        }
    }, 100);
});

/* =======================================================================
   MAIN MENU ANIME.JS ENTRANCE SEQUENCE
   ======================================================================= */
window.animateMainMenu = function() {
    // Waits 1.1s for the CRT TV boot-up animation to finish popping open
    setTimeout(function() {
        if (typeof anime === 'undefined') return;

        // 1. TITLE ANIMATION (Drops down smoothly from dark)
        anime({
            targets: '.main-title',
            opacity: [0, 1],
            translateY: [-30, 0],
            duration: 1000,
            easing: 'easeOutExpo'
        });

        // 2. SUBTITLE ANIMATION (Fades in softly)
        anime({
            targets: '.main-subtitle',
            opacity: [0, 1],
            duration: 800,
            delay: 350,
            easing: 'linear'
        });

        // 3. STAGGERED BUTTONS (Slide in one-by-one)
        anime({
            targets: '.main-menu-options button',
            opacity: [0, 1],
            translateX: [-50, 0],
            delay: anime.stagger(150, { start: 500 }),
            duration: 800,
            easing: 'easeOutCubic'
        });

    }, 1100);
};

/* =======================================================================
   MAIN MENU AUDIO CONTROLLER (Aggressive Autoplay Override)
   ======================================================================= */

window.playMenuMusic = function() {
    var musicPath = "audio/bgm/main_menu.mp3";
    
    // 1. Force the audio to play immediately
    setup.sound.play("menu_bgm", musicPath, true, 0.5);

    // 2. If the browser blocks it because no click happened yet, 
    // this listener waits in the background. The INSTANT the user clicks the mouse anywhere...
    $(document).off('click.bgmUnlock keydown.bgmUnlock').one('click.bgmUnlock keydown.bgmUnlock', function() {
        
        // ...It checks if the music is actually playing.
        var bgmTrack = setup.sound.tracks["menu_bgm"];
        if (bgmTrack && !bgmTrack.playing()) {
            
            // If it's NOT playing (because Chrome blocked it), it forces it to play now!
            bgmTrack.play();
            bgmTrack.fade(0, 0.5, 1500); // Quick fade in
        }
    });
};

window.stopMenuMusic = function() {
    // 3. Remove the click listener so it doesn't accidentally trigger later
    $(document).off('click.bgmUnlock keydown.bgmUnlock');
    
    // 4. Smoothly fade out and stop
    setup.sound.fade("menu_bgm", 1500);
    setTimeout(function() {
        setup.sound.stop("menu_bgm");
    }, 1500);
};







// ==========================================
// PDA CUSTOM TRAIT DISPLAY
// ==========================================
if (typeof Macro !== 'undefined') {
    function safeRegisterMacro(name, macroDef) {
        if (Macro.has(name)) {
            var existing = Macro.get(name);
            if (existing) {
                if (macroDef.handler) existing.handler = macroDef.handler;
                if (macroDef.tags !== undefined) existing.tags = macroDef.tags;
            }
        } else {
            Macro.add(name, macroDef);
        }
    }

    safeRegisterMacro('customTraitDisplay', {
        handler: function () {
            var traits = State.variables.traits || [];
            var html = '';
            
            if (traits.length === 0) {
                html += '<div style="text-align: center; color: #666; font-size: 0.8em; padding: 20px;">No traits acquired yet.</div>';
                $(this.output).append(html);
                return;
            }

            var TRAIT_CATEGORIES = {
                "STEADY HANDS": "COMBAT",
                "AUTHORITY": "SOCIAL",
                "BREACHER": "UTILITY",
                "IRON GRIP": "COMBAT",
                "LOCKSMITH": "UTILITY",
                "GHOST": "SURVIVABILITY",
                "FIELD MEDIC": "SURVIVABILITY",
                "ANATOMIST": "COMBAT",
                "SILVER TONGUE": "SOCIAL",
                "INSPIRATION": "SOCIAL",
                "FAST LEARNER": "SURVIVABILITY",
                "ADRENALINE": "SURVIVABILITY",
                "RUNNER": "SURVIVABILITY",
                "MECHANIC": "UTILITY",
                "HUNTER": "SURVIVABILITY",
                "BOXER": "COMBAT",
                "GAMER": "UTILITY",
                "HIKER": "UTILITY",
                "ARCHER": "COMBAT",
                "GARDENER": "UTILITY",
                "BASEBALL": "COMBAT",
                "BOOKWORM": "UTILITY",
                "WATCHMAN": "SURVIVABILITY",
                "DEBATER": "SOCIAL",
                "CHEF": "UTILITY",
                "PARKOUR": "SURVIVABILITY",
                "VOLUNTEER": "SOCIAL",
                "SMOKER": "NEGATIVE",
                "ALCOHOLIC": "NEGATIVE",
                "ASTHMATIC": "NEGATIVE",
                "BLIND": "NEGATIVE",
                "BAD KNEE": "NEGATIVE",
                "GLUTTON": "NEGATIVE",
                "FRAGILE": "NEGATIVE",
                "PARANOID": "NEGATIVE",
                "INSOMNIAC": "NEGATIVE",
                "CLEAN": "NEGATIVE",
                "COWARD": "NEGATIVE",
                "PYRO": "COMBAT",
                "LONE WOLF": "SURVIVABILITY",
                "LUDDITE": "NEGATIVE",
                "PACIFIST": "SOCIAL",
                "CLUMSY": "NEGATIVE",
                "GAMBLER": "UTILITY",
                "SHELTERED": "SURVIVABILITY",
                "SHOPPER": "SOCIAL",
                "ARROGANT": "NEGATIVE"
            };

            var categorizedTraits = {};
            traits.forEach(function(t) {
                var cat = TRAIT_CATEGORIES[t.name] || "GENERAL";
                if (!categorizedTraits[cat]) {
                    categorizedTraits[cat] = [];
                }
                categorizedTraits[cat].push(t);
            });

            var categoryOrder = ["SURVIVABILITY", "COMBAT", "UTILITY", "SOCIAL", "GENERAL", "NEGATIVE"];

                        categoryOrder.forEach(function(cat, catIdx) {
                var catTraits = categorizedTraits[cat];
                if (!catTraits || catTraits.length === 0) return;

                var isNegative = cat === "NEGATIVE";
                var themeColor = isNegative ? "#ff4d4d" : "#4CAF50";
                var borderAlpha2 = isNegative ? "rgba(255, 77, 77, 0.2)" : "rgba(76, 175, 80, 0.2)";
                var borderAlpha8 = isNegative ? "rgba(255, 77, 77, 0.8)" : "rgba(76, 175, 80, 0.8)";
                var bgAlpha1 = isNegative ? "rgba(255, 77, 77, 0.1)" : "rgba(76, 175, 80, 0.1)";

                var catUniqueId = 'trait-cat-' + catIdx;

                // Category Accordion
                html += '<div class="trait-category-accordion" style="margin-bottom: 10px; background: rgba(0,0,0,0.6); border: 1px solid ' + borderAlpha2 + '; border-radius: 2px;">';
                
                // Category Header
                html += '<div class="trait-category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; cursor: pointer; user-select: none; background: ' + bgAlpha1 + ';" onclick="$(\'#' + catUniqueId + '\').slideToggle(200);">';
                html += '<div style="color: ' + themeColor + '; font-weight: bold; font-size: 1em; letter-spacing: 1px;">' + cat + '</div>';
                html += '<div style="color: ' + borderAlpha8 + '; font-size: 0.9em;">▼</div>';
                html += '</div>';

                // Category Body (Contains the 2-column grid of trait accordions)
                html += '<div id="' + catUniqueId + '" class="trait-category-body" style="padding: 10px; display: block;">';
                
                // Simple 2-column grid
                html += '<div class="trait-display-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">';
                
                catTraits.forEach(function(t, idx) {
                    var uniqueId = 'trait-desc-' + catIdx + '-' + idx;
                    
                    html += '<div class="trait-accordion" style="background: rgba(0,0,0,0.4); border: 1px solid ' + borderAlpha2 + '; border-left: 3px solid ' + borderAlpha8 + '; border-radius: 2px;">';
                    
                    // Header (Collapsible)
                    html += '<div class="trait-accordion-header" style="display: flex; align-items: center; padding: 8px; cursor: pointer; user-select: none;" onclick="$(\'#' + uniqueId + '\').slideToggle(200);">';
                    
                    // Icon (Landscape)
                    var iconHtml = t.icon || '';
                    if (iconHtml.includes('/')) {
                        html += '<div class="trait-icon" style="flex-shrink: 0; width: 60px; height: 40px; margin-right: 12px; background-image: url(\'' + t.icon + '\'); background-size: cover; background-position: center; border-radius: 2px;"></div>';
                    } else {
                        html += '<div class="trait-icon" style="flex-shrink: 0; width: 60px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-right: 12px; background: rgba(255,255,255,0.05); border-radius: 2px;">' + iconHtml + '</div>';
                    }
                    
                    // Title
                    html += '<div class="trait-title" style="flex-grow: 1; color: ' + themeColor + '; font-weight: bold; font-size: 0.9em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + t.name + '</div>';
                    
                    // Dropdown arrow indicator
                    html += '<div class="trait-arrow" style="color: rgba(255,255,255,0.3); font-size: 0.8em; padding-left: 8px;">▼</div>';
                    
                    html += '</div>'; // End Header
                    
                    // Body (Description, initially hidden)
                    html += '<div id="' + uniqueId + '" class="trait-accordion-body" style="display: none; padding: 0 8px 10px 8px; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">';
                    html += '<div class="trait-desc" style="color: #aaa; font-size: 0.8em; line-height: 1.3; margin-top: 8px;">' + t.desc + '</div>';
                    html += '</div>'; // End Body
                    
                    html += '</div>'; // End Accordion Item
                });
                
                html += '</div>'; // End Grid
                html += '</div>'; // End Category Body
                html += '</div>'; // End Category Accordion
            });
            
            $(this.output).append(html);
        }
    });

    // ==========================================
    // OBJECTIVES SYSTEM HELPERS & MACROS
    // ==========================================
    window.hasObjective = function(id) {
        var objs = State.variables.objectives || [];
        return objs.some(function(o) { return o.id === id; });
    };

    window.isObjectiveCompleted = function(id) {
        var objs = State.variables.objectives || [];
        return objs.some(function(o) { return o.id === id && o.status === 'completed'; });
    };

    window.isObjectiveActive = function(id) {
        var objs = State.variables.objectives || [];
        return objs.some(function(o) { return o.id === id && o.status === 'active'; });
    };
}
