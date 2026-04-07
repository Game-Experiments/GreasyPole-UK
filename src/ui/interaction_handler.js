/**
 * interaction_handler.js
 * Manages the choice-based action menu, event responses, and player interactions.
 * Acts as the bridge between player input and the game engine.
 */

var InteractionHandler = (function () {
    'use strict';

    var _gameState = null;
    var _ranksData = null;
    var _eventsData = null;
    var _educationData = null;

    /**
     * Initialise the interaction handler with loaded game data.
     * @param {Object} gameState
     * @param {Array}  ranksData
     * @param {Object} eventsData
     * @param {Object} educationData
     */
    function init(gameState, ranksData, eventsData, educationData) {
        _gameState = gameState;
        _ranksData = ranksData;
        _eventsData = eventsData;
        _educationData = educationData;
    }

    /**
     * Handle the player selecting an action from the action menu.
     * @param {string} actionId
     * @returns {Object} - { success, message, changes }
     */
    function handleAction(actionId) {
        var player = _gameState.player;
        var actions = TurnManager.getAvailableActions(player, _ranksData);
        var action = actions.find(function (a) { return a.id === actionId; });

        if (!action) {
            return { success: false, message: 'Action not found: ' + actionId };
        }

        var effectiveCost = StatManager.calculateEnergyCost(action.baseEnergyCost, player.stressLevel);

        // Validate energy
        if (player.energy < effectiveCost) {
            return {
                success: false,
                message: 'Insufficient energy for this action. Energy remaining: ' + player.energy + ', required: ' + effectiveCost + '.'
            };
        }

        // Validate wealth requirement
        if (action.requiresWealth && player.wealth < action.requiresWealth) {
            return {
                success: false,
                message: 'Insufficient funds. This action requires £' + action.requiresWealth + '.'
            };
        }

        // Deduct energy
        player.energy = Math.max(0, player.energy - effectiveCost);

        // Apply effects
        var changes = StatManager.applyEffects(player, action.effects);

        // Track corruption actions
        if (action.category === 'Corruption') {
            player.corruptionCount = (player.corruptionCount || 0) + 1;
        }

        // Record action in history
        if (!player.actionHistory) { player.actionHistory = []; }
        player.actionHistory.push({
            turn: player.turnCount,
            action: actionId,
            season: TurnManager.getCurrentSeason(player),
            year: TurnManager.getCurrentYear(player)
        });

        // Check for energy exhaustion penalty
        var healthPenalty = false;
        if (player.energy === 0) {
            var healthEffects = { performance: -5, stress: 10 };
            StatManager.applyEffects(player, healthEffects);
            healthPenalty = true;
        }

        var message = action.name + ' completed.';
        if (effectiveCost > action.baseEnergyCost) {
            message += ' (Stress increased the energy cost from ' + action.baseEnergyCost + ' to ' + effectiveCost + '.)';
        }
        if (healthPenalty) {
            message += ' You have exhausted yourself completely. Your health suffers.';
        }

        return { success: true, message: message, changes: changes, action: action };
    }

    /**
     * Handle the player making a choice in an event.
     * @param {Object} event     - The event object
     * @param {string} choiceId  - The selected choice ID
     * @returns {Object} - { message, changes, flavorResponse }
     */
    function handleEventChoice(event, choiceId) {
        var player = _gameState.player;
        var choice = (event.choices || []).find(function (c) { return c.id === choiceId; });

        if (!choice) {
            return { message: 'Invalid choice.', changes: {} };
        }

        // Apply effects
        var changes = StatManager.applyEffects(player, choice.effects || {});

        // Apply permanent effects if any
        if (choice.permanent) {
            if (choice.permanent.energyCostMultiplier) {
                player.warTime = true;
            }
        }

        // Mark event as fired
        TurnManager.markEventFired(player, event.id);

        return {
            message: choice.flavorResponse || 'The matter is resolved.',
            changes: changes,
            choice: choice
        };
    }

    /**
     * Handle the end of a season:
     * 1. Check for fixed historical event
     * 2. Possibly trigger a procedural event
     * 3. Advance the turn
     * 4. Check for scrutiny if it is winter
     * 5. Check for game over
     * @param {Function} onEvent          - Callback when an event fires: (event)
     * @param {Function} onScrutiny       - Callback when scrutiny triggers: (scrutinyResult)
     * @param {Function} onTurnAdvanced   - Callback after turn advances: (turnInfo)
     * @param {Function} onGameOver       - Callback if game is over: (reason)
     */
    function handleEndSeason(onEvent, onScrutiny, onTurnAdvanced, onGameOver) {
        var player = _gameState.player;

        // Check for fixed event first
        var fixedEvent = TurnManager.getFixedEvent(player, _eventsData);
        if (fixedEvent) {
            onEvent(fixedEvent, 'fixed');
            return; // Wait for event resolution before advancing
        }

        // Check for procedural event
        if (TurnManager.shouldFireProceduralEvent(player)) {
            var procEvent = TurnManager.getProceduralEvent(player, _eventsData);
            if (procEvent) {
                onEvent(procEvent, 'procedural');
                return; // Wait for event resolution
            }
        }

        // Advance the turn
        _advanceTurn(onScrutiny, onTurnAdvanced, onGameOver);
    }

    /**
     * Called after an event has been resolved to advance the turn.
     * @param {Function} onScrutiny
     * @param {Function} onTurnAdvanced
     * @param {Function} onGameOver
     */
    function continueAfterEvent(onScrutiny, onTurnAdvanced, onGameOver) {
        _advanceTurn(onScrutiny, onTurnAdvanced, onGameOver);
    }

    /**
     * Internal: advance the turn and handle scrutiny/game over.
     */
    function _advanceTurn(onScrutiny, onTurnAdvanced, onGameOver) {
        var player = _gameState.player;

        // Check if scrutiny is due BEFORE advancing (end of Winter)
        var scrutinyDue = TurnManager.isScrutinyDue(player);

        // Advance turn
        var turnInfo = TurnManager.advanceTurn(player, _ranksData);

        // Autosave
        SaveSystem.autosave(player);

        if (scrutinyDue) {
            var scrutinyResult = ScrutinyLogic.runScrutiny(player, _ranksData);
            ScrutinyLogic.applyScrutinyResult(player, scrutinyResult, _ranksData);

            // Update rank label
            var newRankData = _ranksData.find(function (r) { return r.id === player.rank; });
            if (newRankData) { player.rankLabel = newRankData.name; }

            if (scrutinyResult.outcome === 'arrest') {
                onGameOver('You have been arrested for corrupt practices. Your career — and your liberty — are at an end.');
                return;
            }

            onScrutiny(scrutinyResult, newRankData ? newRankData.name : player.rank);
            return;
        }

        // Check game over
        var gameOver = TurnManager.checkGameOver(player);
        if (gameOver.over) {
            onGameOver(gameOver.reason);
            return;
        }

        onTurnAdvanced(turnInfo);
    }

    /**
     * Initialise a new player state.
     * @param {Object} creationData - From character creation form
     * @returns {Object} playerState
     */
    function createNewPlayer(creationData) {
        var backgroundDefs = {
            aristocratic_scion: {
                name: 'Aristocratic Scion',
                relationsBonus: 25,
                performanceBonus: 0,
                initialReputation: 'High',
                initialRecord: 'High',
                wealthModifier: 150,
                description: 'Born to the purple. Your connections are unmatched; your administrative instincts, less so.'
            },
            professional_middle: {
                name: 'Professional Middle Class',
                relationsBonus: 10,
                performanceBonus: 15,
                initialReputation: 'Medium',
                initialRecord: 'Medium',
                wealthModifier: 50,
                description: 'The son of a solicitor or physician. Competent and socially respectable.'
            },
            industrial_wealth: {
                name: 'Industrial Wealth',
                relationsBonus: 5,
                performanceBonus: 10,
                initialReputation: 'Low',
                initialRecord: 'Medium',
                wealthModifier: 200,
                description: 'Money from trade. Your wealth opens doors that breeding alone cannot.'
            },
            clerical_family: {
                name: 'Clerical Family',
                relationsBonus: 0,
                performanceBonus: 20,
                initialReputation: 'Medium',
                initialRecord: 'High',
                wealthModifier: 0,
                description: 'The son of a Church or Chapel man. Diligent, honest, and quietly ambitious.'
            }
        };

        var initialData = StatManager.initialiseStats(creationData, _educationData, backgroundDefs);

        // Determine starting rank based on entry path
        var startingRankId = 'junior_clerk';
        var startingAge = 22;
        if (creationData.entryPath === 'second_division') {
            startingAge = 18;
        } else if (creationData.entryPath === 'special_appointment') {
            startingRankId = 'senior_clerk';
            startingAge = 28;
        }

        var startingRank = _ranksData.find(function (r) { return r.id === startingRankId; });

        return Object.assign({
            playerName: creationData.playerName,
            entryPath: creationData.entryPath,
            background: creationData.background,
            education: creationData.universityId || creationData.schoolId,
            schoolId: creationData.schoolId,
            universityId: creationData.universityId || null,
            rank: startingRankId,
            rankLabel: startingRank ? startingRank.name : startingRankId,
            age: startingAge,
            turnCount: 0,
            seasonIndex: 0,
            firedEvents: [],
            recentProceduralEvents: [],
            actionHistory: [],
            corruptionCount: 0,
            warTime: false,
            gamePhase: 'gameplay'
        }, initialData);
    }

    /**
     * Get background definitions (for use in character creation rendering).
     * @returns {Array}
     */
    function getBackgrounds() {
        return [
            {
                id: 'aristocratic_scion',
                name: 'Aristocratic Scion',
                relationsBonus: 25,
                performanceBonus: 0,
                description: 'Born to the purple. Unmatched connections, modest administrative instincts.'
            },
            {
                id: 'professional_middle',
                name: 'Professional Middle Class',
                relationsBonus: 10,
                performanceBonus: 15,
                description: 'The son of a solicitor or physician. Competent and socially respectable.'
            },
            {
                id: 'industrial_wealth',
                name: 'Industrial Wealth',
                relationsBonus: 5,
                performanceBonus: 10,
                description: 'New money from trade. Wealth opens many doors that breeding cannot.'
            },
            {
                id: 'clerical_family',
                name: 'Clerical Family',
                relationsBonus: 0,
                performanceBonus: 20,
                description: 'The son of a Church or Chapel man. Diligent, honest, and quietly ambitious.'
            }
        ];
    }

    /**
     * Get entry path definitions.
     * @returns {Array}
     */
    function getEntryPaths() {
        return [
            {
                id: 'first_division',
                name: 'First Division (Class I)',
                age: '22',
                description: 'University graduate. Competitive examination. Access to the highest posts.',
                startingRank: 'junior_clerk',
                wealthRange: 'Medium to High'
            },
            {
                id: 'second_division',
                name: 'Second Division',
                age: '17–19',
                description: 'Secondary or commercial school background. Diligent, efficient, overlooked.',
                startingRank: 'junior_clerk',
                wealthRange: 'Low to Medium'
            },
            {
                id: 'special_appointment',
                name: 'Special Appointment',
                age: '25–30',
                description: 'Previous service or patronage. Enters at a higher grade but with uncertain standing.',
                startingRank: 'senior_clerk',
                wealthRange: 'Variable'
            }
        ];
    }

    /**
     * Get current game state reference.
     * @returns {Object}
     */
    function getGameState() {
        return _gameState;
    }

    return {
        init: init,
        handleAction: handleAction,
        handleEventChoice: handleEventChoice,
        handleEndSeason: handleEndSeason,
        continueAfterEvent: continueAfterEvent,
        createNewPlayer: createNewPlayer,
        getBackgrounds: getBackgrounds,
        getEntryPaths: getEntryPaths,
        getGameState: getGameState
    };
}());
