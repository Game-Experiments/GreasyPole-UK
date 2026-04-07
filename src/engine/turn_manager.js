/**
 * turn_manager.js
 * Handles the seasonal turn cycle and energy replenishment.
 * Each "turn" is one Season (Spring, Summer, Autumn, Winter).
 * Four seasons = one year.
 */

var TurnManager = (function () {
    'use strict';

    var SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
    var START_YEAR = 1890;
    var END_YEAR = 1920;

    /**
     * Get the display name of the current season.
     * @param {Object} playerState
     * @returns {string}
     */
    function getCurrentSeason(playerState) {
        return SEASONS[playerState.seasonIndex];
    }

    /**
     * Get the current year based on the turn counter.
     * @param {Object} playerState
     * @returns {number}
     */
    function getCurrentYear(playerState) {
        return START_YEAR + Math.floor(playerState.turnCount / 4);
    }

    /**
     * Determine whether it is time for the annual Scrutiny Phase.
     * Scrutiny occurs at the end of Winter (every 4 turns).
     * @param {Object} playerState
     * @returns {boolean}
     */
    function isScrutinyDue(playerState) {
        return playerState.seasonIndex === 3 && playerState.turnCount > 0;
    }

    /**
     * Check whether the game should end (year exceeds 1920 or player dies/goes bust).
     * @param {Object} playerState
     * @returns {{ over: boolean, reason: string }}
     */
    function checkGameOver(playerState) {
        var year = getCurrentYear(playerState);
        if (year > END_YEAR) {
            return { over: true, reason: 'Your career has run its course. The year ' + END_YEAR + ' draws the curtain on this tale.' };
        }
        if (playerState.stats.performance <= 0 && playerState.stats.relations <= 0) {
            return { over: true, reason: 'Utterly broken in body and in standing, you retire from the service. It has claimed everything.' };
        }
        if (playerState.wealth < -400) {
            return { over: true, reason: 'Your debts have become unmanageable. You are declared insolvent. The service shows no mercy to bankrupts.' };
        }
        return { over: false, reason: '' };
    }

    /**
     * Advance the game by one season (one turn).
     * Updates seasonIndex, turnCount, replenishes energy, applies annual salary.
     * @param {Object} playerState
     * @param {Array}  ranksData
     * @returns {Object} - { newSeason, newYear, isNewYear, isScrutiny }
     */
    function advanceTurn(playerState, ranksData) {
        var wasScrutiny = isScrutinyDue(playerState);

        // Advance season
        playerState.seasonIndex = (playerState.seasonIndex + 1) % 4;
        playerState.turnCount += 1;

        var newYear = getCurrentYear(playerState);
        var isNewYear = playerState.seasonIndex === 0 && playerState.turnCount > 0;

        // Apply quarterly salary income
        var rankData = ranksData.find(function (r) { return r.id === playerState.rank; });
        if (rankData) {
            var quarterlyIncome = Math.round(rankData.salary / 4);
            playerState.wealth = StatManager.clampWealth(playerState.wealth + quarterlyIncome);
        }

        // Replenish energy for the new season
        // Base energy restores fully, but stress reduces effective max
        var stressReduction = Math.floor(playerState.stressLevel / 10);
        playerState.maxEnergy = Math.max(50, 100 - stressReduction * 5);
        playerState.energy = playerState.maxEnergy;

        // Apply seasonal stat decay
        StatManager.applySeasonalDecay(playerState);

        // Apply war-time energy multiplier if active
        if (playerState.warTime && playerState.seasonIndex !== undefined) {
            playerState.maxEnergy = Math.max(40, Math.floor(playerState.maxEnergy * 0.75));
            playerState.energy = playerState.maxEnergy;
        }

        return {
            newSeason: getCurrentSeason(playerState),
            newYear: newYear,
            isNewYear: isNewYear,
            isScrutinyDue: isScrutinyDue(playerState)
        };
    }

    /**
     * Find any fixed historical event that applies to the current turn.
     * @param {Object} playerState
     * @param {Object} eventsData  - Parsed events.json
     * @returns {Object|null}      - The event object, or null
     */
    function getFixedEvent(playerState, eventsData) {
        var year = getCurrentYear(playerState);
        var season = getCurrentSeason(playerState);
        var fired = playerState.firedEvents || [];

        if (!eventsData || !eventsData.fixed) { return null; }

        return eventsData.fixed.find(function (evt) {
            return evt.year === year &&
                evt.season === season &&
                fired.indexOf(evt.id) === -1;
        }) || null;
    }

    /**
     * Select a random procedural event appropriate for the current turn.
     * Avoids repeating recently fired events.
     * @param {Object} playerState
     * @param {Object} eventsData
     * @returns {Object|null}
     */
    function getProceduralEvent(playerState, eventsData) {
        if (!eventsData || !eventsData.procedural) { return null; }

        var fired = playerState.firedEvents || [];
        var recent = playerState.recentProceduralEvents || [];

        // Filter: exclude zero-weight (examination), recently fired, and special "examination_result"
        var pool = eventsData.procedural.filter(function (evt) {
            return evt.weight > 0 &&
                evt.id !== 'examination_result' &&
                recent.indexOf(evt.id) === -1;
        });

        if (pool.length === 0) {
            // Reset recent list if pool is empty
            pool = eventsData.procedural.filter(function (evt) {
                return evt.weight > 0 && evt.id !== 'examination_result';
            });
        }

        if (pool.length === 0) { return null; }

        // Weighted random selection
        var totalWeight = pool.reduce(function (sum, e) { return sum + e.weight; }, 0);
        var rand = Math.random() * totalWeight;
        var cumulative = 0;

        for (var i = 0; i < pool.length; i++) {
            cumulative += pool[i].weight;
            if (rand < cumulative) {
                return pool[i];
            }
        }

        return pool[pool.length - 1];
    }

    /**
     * Mark an event as having been fired, so it is not repeated.
     * @param {Object} playerState
     * @param {string} eventId
     */
    function markEventFired(playerState, eventId) {
        if (!playerState.firedEvents) {
            playerState.firedEvents = [];
        }
        if (playerState.firedEvents.indexOf(eventId) === -1) {
            playerState.firedEvents.push(eventId);
        }

        // Track recent procedural events (rolling window of 3)
        if (!playerState.recentProceduralEvents) {
            playerState.recentProceduralEvents = [];
        }
        playerState.recentProceduralEvents.push(eventId);
        if (playerState.recentProceduralEvents.length > 3) {
            playerState.recentProceduralEvents.shift();
        }
    }

    /**
     * Determine whether a procedural event should fire this turn.
     * Events fire approximately every other turn, with some randomness.
     * @param {Object} playerState
     * @returns {boolean}
     */
    function shouldFireProceduralEvent(playerState) {
        // Higher chance in later years or when heat is elevated
        var baseChance = 0.5;
        if (playerState.heat > 40) { baseChance += 0.2; }
        if (playerState.stressLevel > 50) { baseChance += 0.1; }
        return Math.random() < baseChance;
    }

    /**
     * Get the list of available actions for the current season and player state.
     * @param {Object} playerState
     * @param {Object} ranksData
     * @returns {Array} - Array of action objects
     */
    function getAvailableActions(playerState, ranksData) {
        var season = getCurrentSeason(playerState);
        var actions = [];

        // --- Administrative Actions ---
        actions.push({
            id: 'draft_minutes',
            category: 'Administrative',
            name: 'Draft Minutes',
            description: 'Compose and preserve the internal minutes and correspondence of your department.',
            baseEnergyCost: 20,
            effects: { performance: 6, record: 3 },
            alwaysAvailable: true
        });

        actions.push({
            id: 'index_ledgers',
            category: 'Administrative',
            name: 'Index Ledgers',
            description: 'Organise and check the waste ledgers and departmental accounts.',
            baseEnergyCost: 15,
            effects: { performance: 4, record: 2 },
            alwaysAvailable: true
        });

        actions.push({
            id: 'cypher_despatches',
            category: 'Administrative',
            name: 'Cypher Despatches',
            description: 'Encode and decode sensitive Foreign Office communications. High responsibility, high reward.',
            baseEnergyCost: 30,
            effects: { performance: 5, record: 8 },
            alwaysAvailable: true
        });

        actions.push({
            id: 'supervise_typewriters',
            category: 'Administrative',
            name: 'Supervise Typewriters',
            description: 'Manage the female typewriting pool. Administrative efficiency requires order.',
            baseEnergyCost: 15,
            effects: { performance: 3, relations: 4 },
            alwaysAvailable: true
        });

        actions.push({
            id: 'study_files',
            category: 'Administrative',
            name: 'Study Policy Files',
            description: 'Devote extra hours to mastering the intricacies of departmental policy.',
            baseEnergyCost: 25,
            effects: { performance: 10, stress: 5 },
            alwaysAvailable: true
        });

        // --- Social Actions ---
        actions.push({
            id: 'club_attendance',
            category: 'Social',
            name: 'Club Attendance',
            description: 'Visit the Reform Club or the Athenaeum. Build relations with peers and superiors.',
            baseEnergyCost: 20,
            effects: { relations: 7, reputation: 2, wealth: -10 },
            alwaysAvailable: true
        });

        // Afternoon tea: Summer only
        if (season === 'Summer') {
            actions.push({
                id: 'afternoon_tea',
                category: 'Social',
                name: 'Afternoon Tea',
                description: 'Visit a prominent hostess between 3 PM and 5:30 PM. Summer calls are de rigueur.',
                baseEnergyCost: 15,
                effects: { relations: 6, reputation: 4, wealth: -5 },
                seasonal: true,
                seasonRequired: 'Summer'
            });
        }

        actions.push({
            id: 'host_dinner',
            category: 'Social',
            name: 'Host a Dinner',
            description: 'Entertain colleagues and superiors at a formal dinner. Expensive, but invaluable for advancement.',
            baseEnergyCost: 25,
            effects: { relations: 10, reputation: 5, wealth: -40 },
            alwaysAvailable: true,
            requiresWealth: 40
        });

        // Country house: Spring or Summer
        if (season === 'Spring' || season === 'Summer') {
            actions.push({
                id: 'country_house_weekend',
                category: 'Social',
                name: 'Country House Weekend',
                description: 'Attend a weekend at a distinguished estate. Special appointments are negotiated in such surroundings.',
                baseEnergyCost: 30,
                effects: { relations: 12, reputation: 6, wealth: -25 },
                seasonal: true,
                seasonRequired: 'Spring/Summer'
            });
        }

        // --- Corruption Actions (always available but risky) ---
        actions.push({
            id: 'tobacco_box',
            category: 'Corruption',
            name: 'The Tobacco Box',
            description: 'Accept a gratuity disguised as tobacco in a public house. Supplements a modest salary discreetly.',
            baseEnergyCost: 10,
            effects: { wealth: 50, record: -12, heat: 12 },
            alwaysAvailable: true,
            warning: 'This action will reduce your Record and increase your Heat.'
        });

        actions.push({
            id: 'treating',
            category: 'Corruption',
            name: 'Treating',
            description: 'Provide "innocent hospitality" — food and drink — to influence a pending decision.',
            baseEnergyCost: 15,
            effects: { relations: 8, record: -8, heat: 8, wealth: -20 },
            alwaysAvailable: true,
            warning: 'This action will reduce your Record and increase your Heat.'
        });

        actions.push({
            id: 'influence_peddling',
            category: 'Corruption',
            name: 'Influence Peddling',
            description: 'Use your position to secure a Special Appointment for a connected party in exchange for financial support.',
            baseEnergyCost: 20,
            effects: { wealth: 80, record: -18, heat: 18, relations: -3 },
            alwaysAvailable: true,
            warning: 'High risk of scandal. Record and Heat severely affected.'
        });

        // --- Rest Action ---
        actions.push({
            id: 'rest',
            category: 'Personal',
            name: 'Rest and Recuperation',
            description: 'Take a period of rest. Your constitution is not inexhaustible.',
            baseEnergyCost: 0,
            effects: { stress: -15 },
            alwaysAvailable: true
        });

        return actions;
    }

    return {
        SEASONS: SEASONS,
        START_YEAR: START_YEAR,
        END_YEAR: END_YEAR,
        getCurrentSeason: getCurrentSeason,
        getCurrentYear: getCurrentYear,
        isScrutinyDue: isScrutinyDue,
        checkGameOver: checkGameOver,
        advanceTurn: advanceTurn,
        getFixedEvent: getFixedEvent,
        getProceduralEvent: getProceduralEvent,
        markEventFired: markEventFired,
        shouldFireProceduralEvent: shouldFireProceduralEvent,
        getAvailableActions: getAvailableActions
    };
}());
