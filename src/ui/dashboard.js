/**
 * dashboard.js
 * Renders the main game dashboard in a parchment-document style.
 * All DOM manipulation is centralised here to keep the engine logic clean.
 */

var Dashboard = (function () {
    'use strict';

    // --- Helpers ---

    function $(id) { return document.getElementById(id); }

    function createEl(tag, attrs, text) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === null || v === undefined) { return; }
                el.setAttribute(k, v);
            });
        }
        if (text !== undefined) { el.textContent = text; }
        return el;
    }

    /**
     * Render a stat bar with label and numeric value.
     * @param {string} label
     * @param {number} value  0-100
     * @param {string} cssClass
     * @returns {HTMLElement}
     */
    function renderStatBar(label, value, cssClass) {
        var wrapper = createEl('div', { class: 'stat-bar-wrapper' });
        var labelEl = createEl('span', { class: 'stat-label' }, label);
        var barOuter = createEl('div', { class: 'stat-bar-outer' });
        var barInner = createEl('div', { class: 'stat-bar-inner ' + (cssClass || '') });
        var valueEl = createEl('span', { class: 'stat-value' }, value);

        barInner.style.width = Math.max(0, Math.min(100, value)) + '%';
        barOuter.appendChild(barInner);
        wrapper.appendChild(labelEl);
        wrapper.appendChild(barOuter);
        wrapper.appendChild(valueEl);
        return wrapper;
    }

    /**
     * Render the top header with title and year/season.
     */
    function renderHeader(playerState) {
        var header = $('dashboard-header');
        if (!header) { return; }

        var year = TurnManager.getCurrentYear(playerState);
        var season = TurnManager.getCurrentSeason(playerState);
        var rankLabel = playerState.rankLabel || playerState.rank || 'Unknown Rank';

        header.innerHTML = '';

        var title = createEl('div', { class: 'header-title' });
        title.innerHTML = '<span class="game-title">Greasy Pole</span><span class="game-subtitle"> — UK Edition</span>';

        var meta = createEl('div', { class: 'header-meta' });
        meta.innerHTML =
            '<span class="header-name">' + escapeHtml(playerState.playerName || 'Unnamed') + '</span>' +
            '<span class="header-sep"> &bull; </span>' +
            '<span class="header-rank">' + escapeHtml(rankLabel) + '</span>' +
            '<span class="header-sep"> &bull; </span>' +
            '<span class="header-date">' + season + ', ' + year + '</span>';

        header.appendChild(title);
        header.appendChild(meta);
    }

    /**
     * Render the four primary stat bars.
     */
    function renderStats(playerState) {
        var container = $('stats-panel');
        if (!container) { return; }

        container.innerHTML = '';
        var stats = playerState.stats;

        var statDefs = [
            { key: 'performance', label: 'Performance', css: 'bar-performance' },
            { key: 'relations',   label: 'Relations',   css: 'bar-relations'   },
            { key: 'record',      label: 'Record',      css: 'bar-record'      },
            { key: 'reputation',  label: 'Reputation',  css: 'bar-reputation'  }
        ];

        statDefs.forEach(function (def) {
            var bar = renderStatBar(def.label, stats[def.key], def.css);
            container.appendChild(bar);
        });

        // Scandal warning
        if (stats.record < ScrutinyLogic.RECORD_SCANDAL_THRESHOLD) {
            var warning = createEl('div', { class: 'scandal-warning' },
                '⚠ Record is dangerously low. Scandal is imminent.');
            container.appendChild(warning);
        }
    }

    /**
     * Render the energy and secondary stats panel.
     */
    function renderSecondaryStats(playerState) {
        var container = $('secondary-stats-panel');
        if (!container) { return; }

        container.innerHTML = '';

        // Energy bar
        var energyPct = Math.round((playerState.energy / playerState.maxEnergy) * 100);
        var energyBar = renderStatBar('Energy', energyPct, 'bar-energy');
        container.appendChild(energyBar);

        var energyNote = createEl('div', { class: 'energy-note' },
            playerState.energy + ' / ' + playerState.maxEnergy + ' energy remaining this season');
        container.appendChild(energyNote);

        // Secondary stats grid
        var grid = createEl('div', { class: 'secondary-grid' });

        var secondaryItems = [
            { label: 'Wealth', value: '£' + playerState.wealth },
            { label: 'Stress', value: playerState.stressLevel + '%' },
            { label: 'Heat',   value: playerState.heat + '/100' }
        ];

        secondaryItems.forEach(function (item) {
            var cell = createEl('div', { class: 'secondary-cell' });
            var lbl = createEl('span', { class: 'secondary-label' }, item.label);
            var val = createEl('span', {
                class: 'secondary-value' + (item.label === 'Heat' && playerState.heat > 50 ? ' heat-danger' : '')
            }, item.value);
            cell.appendChild(lbl);
            cell.appendChild(val);
            grid.appendChild(cell);
        });

        container.appendChild(grid);

        // Merit score preview
        var meritScore = StatManager.calculateMeritScore(playerState.stats);
        var meritEl = createEl('div', { class: 'merit-preview' },
            'Current Merit Score: ' + Math.round(meritScore * 10) / 10);
        container.appendChild(meritEl);
    }

    /**
     * Render the action menu for the current season.
     * @param {Array}    actions      - Available actions from TurnManager
     * @param {Object}   playerState
     * @param {Function} onAction     - Callback(actionId)
     */
    function renderActions(actions, playerState, onAction) {
        var container = $('actions-panel');
        if (!container) { return; }

        container.innerHTML = '';

        var heading = createEl('h3', { class: 'panel-heading' }, 'Actions this Season');
        container.appendChild(heading);

        var categories = ['Administrative', 'Social', 'Corruption', 'Personal'];

        categories.forEach(function (category) {
            var categoryActions = actions.filter(function (a) { return a.category === category; });
            if (categoryActions.length === 0) { return; }

            var catHeader = createEl('div', { class: 'action-category-header' }, category);
            container.appendChild(catHeader);

            categoryActions.forEach(function (action) {
                var effectiveCost = StatManager.calculateEnergyCost(action.baseEnergyCost, playerState.stressLevel);
                var canAfford = playerState.energy >= effectiveCost;
                var canAffordWealth = !action.requiresWealth || playerState.wealth >= action.requiresWealth;
                var isDisabled = !canAfford || !canAffordWealth;

                var btn = createEl('button', {
                    class: 'action-btn' +
                        (action.category === 'Corruption' ? ' action-corruption' : '') +
                        (isDisabled ? ' action-disabled' : ''),
                    'data-action-id': action.id,
                    disabled: isDisabled ? 'true' : null
                });

                var nameEl = createEl('span', { class: 'action-name' }, action.name);
                var descEl = createEl('span', { class: 'action-desc' }, action.description);
                var costEl = createEl('span', { class: 'action-cost' + (!canAfford ? ' cost-too-high' : '') },
                    'Energy: ' + effectiveCost + (action.baseEnergyCost === 0 ? '' : ' (base: ' + action.baseEnergyCost + ')'));

                if (action.warning) {
                    var warnEl = createEl('span', { class: 'action-warning' }, '⚠ ' + action.warning);
                    btn.appendChild(nameEl);
                    btn.appendChild(descEl);
                    btn.appendChild(warnEl);
                    btn.appendChild(costEl);
                } else {
                    btn.appendChild(nameEl);
                    btn.appendChild(descEl);
                    btn.appendChild(costEl);
                }

                if (!canAffordWealth) {
                    var wealthWarn = createEl('span', { class: 'action-warning' },
                        '⚠ Requires £' + action.requiresWealth);
                    btn.appendChild(wealthWarn);
                }

                if (!isDisabled) {
                    btn.addEventListener('click', function () {
                        onAction(action.id);
                    });
                }

                container.appendChild(btn);
            });
        });
    }

    /**
     * Render an event card with choices.
     * @param {Object}   event
     * @param {Function} onChoice - Callback(choiceId)
     */
    function renderEvent(event, onChoice) {
        var container = $('event-panel');
        if (!container) { return; }

        container.innerHTML = '';
        container.classList.remove('hidden');

        var title = createEl('h2', { class: 'event-title' }, event.title);
        var flavour = createEl('p', { class: 'event-flavour' }, event.flavourText || event.description);
        var desc = createEl('p', { class: 'event-desc' }, event.description !== event.flavourText ? event.description : '');

        container.appendChild(title);
        container.appendChild(flavour);
        if (desc.textContent) { container.appendChild(desc); }

        var choicesDiv = createEl('div', { class: 'event-choices' });
        (event.choices || []).forEach(function (choice) {
            var btn = createEl('button', { class: 'choice-btn', 'data-choice-id': choice.id });
            btn.textContent = choice.text;
            btn.addEventListener('click', function () {
                onChoice(choice.id);
            });
            choicesDiv.appendChild(btn);
        });
        container.appendChild(choicesDiv);
    }

    /**
     * Render the result of an action or event choice.
     * @param {string} message
     * @param {Object} changes  - Stat changes
     */
    function renderResult(message, changes) {
        var container = $('result-panel');
        if (!container) { return; }

        container.innerHTML = '';
        container.classList.remove('hidden');

        var msgEl = createEl('p', { class: 'result-message' }, message);
        container.appendChild(msgEl);

        if (changes && Object.keys(changes).length > 0) {
            var changesDiv = createEl('div', { class: 'result-changes' });
            Object.keys(changes).forEach(function (key) {
                var val = changes[key];
                if (val === 0) { return; }
                var sign = val > 0 ? '+' : '';
                var changeEl = createEl('span', {
                    class: 'change-tag ' + (val > 0 ? 'change-positive' : 'change-negative')
                }, key + ': ' + sign + val);
                changesDiv.appendChild(changeEl);
            });
            container.appendChild(changesDiv);
        }
    }

    /**
     * Render the scrutiny phase result.
     * @param {Object} scrutinyResult
     * @param {string} rankLabel
     */
    function renderScrutinyResult(scrutinyResult, rankLabel) {
        var container = $('event-panel');
        if (!container) { return; }

        container.innerHTML = '';
        container.classList.remove('hidden');

        var outcomeClass = {
            'promoted': 'scrutiny-promoted',
            'stable': 'scrutiny-stable',
            'demoted': 'scrutiny-demoted',
            'scandal': 'scrutiny-scandal',
            'arrest': 'scrutiny-arrest'
        }[scrutinyResult.outcome] || 'scrutiny-stable';

        var heading = createEl('h2', { class: 'scrutiny-heading ' + outcomeClass },
            'Annual Scrutiny — ' + scrutinyResult.outcome.toUpperCase());

        var message = createEl('p', { class: 'scrutiny-message' }, scrutinyResult.message);
        container.appendChild(heading);
        container.appendChild(message);

        if (scrutinyResult.newRank && rankLabel) {
            var rankEl = createEl('p', { class: 'scrutiny-rank' },
                'Current Rank: ' + rankLabel);
            container.appendChild(rankEl);
        }

        var detailsList = createEl('ul', { class: 'scrutiny-details' });
        (scrutinyResult.details || []).forEach(function (detail) {
            var li = createEl('li', {}, detail);
            detailsList.appendChild(li);
        });
        container.appendChild(detailsList);

        var continueBtn = createEl('button', { class: 'continue-btn', id: 'scrutiny-continue-btn' },
            'Continue');
        container.appendChild(continueBtn);
    }

    /**
     * Render the character creation screen.
     * @param {Object} config - { entryPaths, backgrounds, educationData }
     * @param {Function} onComplete - Callback({ playerName, entryPath, background, schoolId, universityId })
     */
    function renderCharacterCreation(config, onComplete) {
        var mainArea = $('main-content');
        if (!mainArea) { return; }

        mainArea.innerHTML = '';
        mainArea.className = 'char-creation';

        var heading = createEl('h1', { class: 'creation-heading' },
            'Enter the Service: Character Creation');
        var subheading = createEl('p', { class: 'creation-subheading' },
            'The year is 1890. You stand at the threshold of a career in His Majesty\'s Civil Service. Choose your origins carefully — they will shape your every step upon the Greasy Pole.');
        mainArea.appendChild(heading);
        mainArea.appendChild(subheading);

        var form = createEl('form', { id: 'creation-form', class: 'creation-form' });

        // Name
        var nameGroup = createEl('div', { class: 'form-group' });
        nameGroup.appendChild(createEl('label', { for: 'input-name', class: 'form-label' }, 'Your Name:'));
        var nameInput = createEl('input', {
            type: 'text', id: 'input-name', name: 'playerName',
            placeholder: 'e.g. Arthur Pemberton', maxlength: '60',
            class: 'form-input', required: 'true'
        });
        nameGroup.appendChild(nameInput);
        form.appendChild(nameGroup);

        // Entry Path
        var pathGroup = createEl('div', { class: 'form-group' });
        pathGroup.appendChild(createEl('label', { class: 'form-label' }, 'Entry Pathway:'));

        config.entryPaths.forEach(function (path) {
            var label = createEl('label', { class: 'radio-label' });
            var radio = createEl('input', {
                type: 'radio', name: 'entryPath', value: path.id, required: 'true'
            });
            if (path.id === 'first_division') { radio.setAttribute('checked', 'true'); }

            var info = createEl('span', { class: 'radio-info' });
            info.innerHTML = '<strong>' + escapeHtml(path.name) + '</strong> — ' +
                escapeHtml(path.description) + ' <em>Age: ' + path.age + '</em>';

            label.appendChild(radio);
            label.appendChild(info);
            pathGroup.appendChild(label);
        });
        form.appendChild(pathGroup);

        // Background
        var bgGroup = createEl('div', { class: 'form-group' });
        bgGroup.appendChild(createEl('label', { class: 'form-label' }, 'Social Background:'));

        config.backgrounds.forEach(function (bg) {
            var label = createEl('label', { class: 'radio-label' });
            var radio = createEl('input', {
                type: 'radio', name: 'background', value: bg.id, required: 'true'
            });
            var info = createEl('span', { class: 'radio-info' });
            info.innerHTML = '<strong>' + escapeHtml(bg.name) + '</strong> — ' +
                'Relations <span class="bonus">' + (bg.relationsBonus >= 0 ? '+' : '') + bg.relationsBonus + '</span>, ' +
                'Performance <span class="bonus">' + (bg.performanceBonus >= 0 ? '+' : '') + bg.performanceBonus + '</span>. ' +
                escapeHtml(bg.description);
            label.appendChild(radio);
            label.appendChild(info);
            bgGroup.appendChild(label);
        });
        form.appendChild(bgGroup);

        // School
        var schoolGroup = createEl('div', { class: 'form-group' });
        schoolGroup.appendChild(createEl('label', { class: 'form-label' }, 'Schooling:'));

        var allSchools = []
            .concat(config.educationData.secondary || [])
            .concat(config.educationData.clarendon || []);

        allSchools.forEach(function (school) {
            var label = createEl('label', { class: 'radio-label' });
            var radio = createEl('input', {
                type: 'radio', name: 'schoolId', value: school.id, required: 'true'
            });
            var info = createEl('span', { class: 'radio-info' });
            var attrs = school.attributes;
            info.innerHTML = '<strong>' + escapeHtml(school.name) + '</strong> (' + escapeHtml(school.socialImpact) + ' social impact) — ' +
                escapeHtml(school.keyAdvantage);
            label.appendChild(radio);
            label.appendChild(info);
            schoolGroup.appendChild(label);
        });
        form.appendChild(schoolGroup);

        // University (optional)
        var uniGroup = createEl('div', { class: 'form-group', id: 'university-group' });
        uniGroup.appendChild(createEl('label', { class: 'form-label' }, 'University (optional):'));

        var noUni = createEl('label', { class: 'radio-label' });
        var noUniRadio = createEl('input', { type: 'radio', name: 'universityId', value: '', checked: 'true' });
        noUni.appendChild(noUniRadio);
        noUni.appendChild(createEl('span', { class: 'radio-info' }, 'No University — Enter the service directly.'));
        uniGroup.appendChild(noUni);

        (config.educationData.university || []).forEach(function (uni) {
            var label = createEl('label', { class: 'radio-label' });
            var radio = createEl('input', { type: 'radio', name: 'universityId', value: uni.id });
            var info = createEl('span', { class: 'radio-info' });
            info.innerHTML = '<strong>' + escapeHtml(uni.name) + '</strong> (' + escapeHtml(uni.socialImpact) + ') — ' +
                escapeHtml(uni.keyAdvantage);
            label.appendChild(radio);
            label.appendChild(info);
            uniGroup.appendChild(label);
        });
        form.appendChild(uniGroup);

        // Submit
        var submitBtn = createEl('button', { type: 'submit', class: 'submit-btn' },
            'Enter the Service');
        form.appendChild(submitBtn);

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = new FormData(form);
            var playerName = (data.get('playerName') || '').trim();
            if (!playerName) {
                alert('Please enter your name before proceeding.');
                return;
            }
            onComplete({
                playerName: playerName,
                entryPath: data.get('entryPath') || 'first_division',
                background: data.get('background') || 'professional_middle',
                schoolId: data.get('schoolId') || 'grammar_school',
                universityId: data.get('universityId') || ''
            });
        });

        mainArea.appendChild(form);
    }

    /**
     * Render the main gameplay dashboard.
     */
    function renderGameplay(playerState, actions, callbacks) {
        var mainArea = $('main-content');
        if (!mainArea) { return; }

        mainArea.className = 'gameplay';
        mainArea.innerHTML = '<div id="dashboard-header"></div>' +
            '<div class="dashboard-body">' +
            '<div class="left-panel">' +
            '<div id="stats-panel" class="panel-section"></div>' +
            '<div id="secondary-stats-panel" class="panel-section"></div>' +
            '</div>' +
            '<div class="right-panel">' +
            '<div id="actions-panel" class="panel-section"></div>' +
            '</div>' +
            '</div>' +
            '<div id="event-panel" class="panel-section hidden"></div>' +
            '<div id="result-panel" class="panel-section hidden"></div>' +
            '<div class="dashboard-footer">' +
            '<button id="btn-save" class="footer-btn">Save Game</button>' +
            '<button id="btn-end-season" class="footer-btn primary-btn">End Season</button>' +
            '</div>';

        renderHeader(playerState);
        renderStats(playerState);
        renderSecondaryStats(playerState);
        renderActions(actions, playerState, callbacks.onAction);

        $('btn-end-season').addEventListener('click', callbacks.onEndSeason);
        $('btn-save').addEventListener('click', callbacks.onSave);
    }

    /**
     * Render the main menu screen.
     */
    function renderMainMenu(hasSavedGame, callbacks) {
        var mainArea = $('main-content');
        if (!mainArea) { return; }

        mainArea.className = 'main-menu';
        mainArea.innerHTML = '';

        var titleWrap = createEl('div', { class: 'menu-title-wrap' });
        var gameTitle = createEl('h1', { class: 'menu-game-title' }, 'Greasy Pole');
        var gameSubtitle = createEl('p', { class: 'menu-game-subtitle' }, 'UK Edition');
        var gameTagline = createEl('p', { class: 'menu-tagline' },
            '"The climb to the top of the British state is characterised by slipperiness, competition, and the constant threat of a precipitous fall."');
        var gameMeta = createEl('p', { class: 'menu-meta' }, 'A historical simulation of the British Civil Service, 1890–1920');

        titleWrap.appendChild(gameTitle);
        titleWrap.appendChild(gameSubtitle);
        titleWrap.appendChild(gameTagline);
        titleWrap.appendChild(gameMeta);
        mainArea.appendChild(titleWrap);

        var btnGroup = createEl('div', { class: 'menu-buttons' });

        var newGameBtn = createEl('button', { class: 'menu-btn primary-btn', id: 'btn-new-game' }, 'New Game');
        newGameBtn.addEventListener('click', callbacks.onNewGame);
        btnGroup.appendChild(newGameBtn);

        if (hasSavedGame) {
            var loadBtn = createEl('button', { class: 'menu-btn', id: 'btn-load-game' }, 'Load Game');
            loadBtn.addEventListener('click', callbacks.onLoadGame);
            btnGroup.appendChild(loadBtn);
        }

        mainArea.appendChild(btnGroup);
    }

    /**
     * Render the save/load screen.
     * @param {Array}    saves    - From SaveSystem.listSaves()
     * @param {string}   mode     - 'save' or 'load'
     * @param {Function} onSelect - Callback(slot)
     * @param {Function} onBack
     */
    function renderSaveLoadScreen(saves, mode, onSelect, onBack) {
        var mainArea = $('main-content');
        if (!mainArea) { return; }

        mainArea.innerHTML = '';
        mainArea.className = 'save-load-screen';

        var heading = createEl('h2', { class: 'sl-heading' },
            mode === 'save' ? 'Save Game' : 'Load Game');
        mainArea.appendChild(heading);

        saves.forEach(function (save) {
            var slotDiv = createEl('div', { class: 'save-slot' + (save.exists ? ' has-save' : ' empty-save') });

            var slotLabel = createEl('span', { class: 'slot-label' }, save.label);
            slotDiv.appendChild(slotLabel);

            if (save.exists) {
                var slotInfo = createEl('span', { class: 'slot-info' });
                slotInfo.innerHTML =
                    escapeHtml(save.characterName || 'Unknown') + ' — ' +
                    escapeHtml(save.rank || '') + ' — Year ' + (save.year || '?') + '<br>' +
                    '<small>Saved: ' + (save.savedAt ? new Date(save.savedAt).toLocaleString() : 'Unknown') + '</small>';
                slotDiv.appendChild(slotInfo);
            } else {
                slotDiv.appendChild(createEl('span', { class: 'slot-empty' }, 'Empty Slot'));
            }

            var actionBtn = createEl('button', {
                class: 'slot-btn',
                disabled: (!save.exists && mode === 'load') ? 'true' : null
            }, mode === 'save' ? 'Save Here' : 'Load');

            actionBtn.addEventListener('click', function () {
                onSelect(save.slot);
            });

            slotDiv.appendChild(actionBtn);
            mainArea.appendChild(slotDiv);
        });

        var backBtn = createEl('button', { class: 'back-btn' }, '← Back');
        backBtn.addEventListener('click', onBack);
        mainArea.appendChild(backBtn);
    }

    /**
     * Render a game over screen.
     * @param {Object} playerState
     * @param {string} reason
     * @param {Function} onRestart
     */
    function renderGameOver(playerState, reason, onRestart) {
        var mainArea = $('main-content');
        if (!mainArea) { return; }

        mainArea.className = 'game-over';
        mainArea.innerHTML = '';

        var heading = createEl('h1', { class: 'gameover-heading' }, 'Career Ended');
        var reasonEl = createEl('p', { class: 'gameover-reason' }, reason);
        mainArea.appendChild(heading);
        mainArea.appendChild(reasonEl);

        if (playerState) {
            var summary = createEl('div', { class: 'gameover-summary' });
            var year = TurnManager.getCurrentYear(playerState);
            var rankLabel = playerState.rankLabel || playerState.rank;
            summary.innerHTML =
                '<p><strong>' + escapeHtml(playerState.playerName || 'Unknown') + '</strong></p>' +
                '<p>Final Rank: ' + escapeHtml(rankLabel || 'Unknown') + '</p>' +
                '<p>Year: ' + year + '</p>' +
                '<p>Wealth: £' + playerState.wealth + '</p>';

            var statDefs = ['performance', 'relations', 'record', 'reputation'];
            statDefs.forEach(function (key) {
                var bar = renderStatBar(key.charAt(0).toUpperCase() + key.slice(1),
                    playerState.stats[key], 'bar-' + key);
                summary.appendChild(bar);
            });

            mainArea.appendChild(summary);
        }

        var restartBtn = createEl('button', { class: 'menu-btn primary-btn' }, 'Begin Again');
        restartBtn.addEventListener('click', onRestart);
        mainArea.appendChild(restartBtn);
    }

    /**
     * Show or hide a loading overlay.
     * @param {boolean} visible
     * @param {string}  message
     */
    function setLoading(visible, message) {
        var overlay = $('loading-overlay');
        if (!overlay) { return; }
        overlay.classList.toggle('hidden', !visible);
        if (message) {
            var msgEl = overlay.querySelector('.loading-message');
            if (msgEl) { msgEl.textContent = message; }
        }
    }

    /**
     * Display a temporary notification banner.
     * @param {string} message
     * @param {string} type - 'info' | 'warning' | 'error'
     */
    function showNotification(message, type) {
        var banner = $('notification-banner');
        if (!banner) { return; }

        banner.textContent = message;
        banner.className = 'notification-banner notification-' + (type || 'info');
        banner.classList.remove('hidden');

        clearTimeout(banner._timeout);
        banner._timeout = setTimeout(function () {
            banner.classList.add('hidden');
        }, 4000);
    }

    /**
     * Simple HTML escape utility.
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (typeof str !== 'string') { return String(str || ''); }
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Update individual panels without full re-render (for performance).
     */
    function updateStats(playerState) {
        renderStats(playerState);
        renderSecondaryStats(playerState);
        renderHeader(playerState);
    }

    /**
     * Hide the event panel.
     */
    function hideEventPanel() {
        var container = $('event-panel');
        if (container) { container.classList.add('hidden'); }
    }

    /**
     * Hide the result panel.
     */
    function hideResultPanel() {
        var container = $('result-panel');
        if (container) { container.classList.add('hidden'); }
    }

    return {
        renderMainMenu: renderMainMenu,
        renderCharacterCreation: renderCharacterCreation,
        renderGameplay: renderGameplay,
        renderSaveLoadScreen: renderSaveLoadScreen,
        renderGameOver: renderGameOver,
        renderEvent: renderEvent,
        renderResult: renderResult,
        renderScrutinyResult: renderScrutinyResult,
        renderHeader: renderHeader,
        renderStats: renderStats,
        renderSecondaryStats: renderSecondaryStats,
        renderActions: renderActions,
        updateStats: updateStats,
        hideEventPanel: hideEventPanel,
        hideResultPanel: hideResultPanel,
        setLoading: setLoading,
        showNotification: showNotification,
        escapeHtml: escapeHtml
    };
}());
