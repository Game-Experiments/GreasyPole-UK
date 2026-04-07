/**
 * stat_manager.js
 * Manages the four primary statistics: Performance, Relations, Record, Reputation.
 * Also tracks secondary values: Wealth, Energy, StressLevel, Heat.
 */

var StatManager = (function () {
    'use strict';

    var STAT_MIN = 0;
    var STAT_MAX = 100;

    /**
     * Clamp a value between 0 and 100.
     * @param {number} value
     * @returns {number}
     */
    function clamp(value) {
        return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
    }

    /**
     * Clamp wealth: can be negative (debt) but capped at a reasonable maximum.
     * @param {number} value
     * @returns {number}
     */
    function clampWealth(value) {
        return Math.max(-500, Math.min(5000, Math.round(value)));
    }

    /**
     * Apply a set of stat deltas to the player state.
     * Recognises: performance, relations, record, reputation, wealth, energy, stress, heat.
     * @param {Object} playerState - The mutable player state object.
     * @param {Object} effects     - Key/value pairs of stat changes.
     * @returns {Object}           - Descriptions of what changed.
     */
    function applyEffects(playerState, effects) {
        var changes = {};

        var statMap = {
            performance: function (v) {
                var before = playerState.stats.performance;
                playerState.stats.performance = clamp(playerState.stats.performance + v);
                changes.performance = playerState.stats.performance - before;
            },
            relations: function (v) {
                var before = playerState.stats.relations;
                playerState.stats.relations = clamp(playerState.stats.relations + v);
                changes.relations = playerState.stats.relations - before;
            },
            record: function (v) {
                var before = playerState.stats.record;
                playerState.stats.record = clamp(playerState.stats.record + v);
                changes.record = playerState.stats.record - before;
            },
            reputation: function (v) {
                var before = playerState.stats.reputation;
                playerState.stats.reputation = clamp(playerState.stats.reputation + v);
                changes.reputation = playerState.stats.reputation - before;
            },
            wealth: function (v) {
                var before = playerState.wealth;
                playerState.wealth = clampWealth(playerState.wealth + v);
                changes.wealth = playerState.wealth - before;
            },
            energy: function (v) {
                var before = playerState.energy;
                playerState.energy = Math.max(0, Math.min(playerState.maxEnergy, playerState.energy + v));
                changes.energy = playerState.energy - before;
            },
            stress: function (v) {
                var before = playerState.stressLevel;
                playerState.stressLevel = Math.max(0, Math.min(100, playerState.stressLevel + v));
                changes.stressLevel = playerState.stressLevel - before;
            },
            heat: function (v) {
                var before = playerState.heat;
                playerState.heat = Math.max(0, Math.min(100, playerState.heat + v));
                changes.heat = playerState.heat - before;
            }
        };

        Object.keys(effects).forEach(function (key) {
            if (statMap[key]) {
                statMap[key](effects[key]);
            }
        });

        return changes;
    }

    /**
     * Calculate the effective energy cost of an action taking stress into account.
     * Formula: Energy_Spent = BaseCost × (1 + StressLevel / 100)
     * @param {number} baseCost
     * @param {number} stressLevel
     * @returns {number}
     */
    function calculateEnergyCost(baseCost, stressLevel) {
        return Math.ceil(baseCost * (1 + stressLevel / 100));
    }

    /**
     * Calculate the Merit Score for a scrutiny/promotion check.
     * MeritScore = (0.5 × Performance) + (0.3 × Relations) + (0.2 × Reputation)
     * @param {Object} stats - { performance, relations, record, reputation }
     * @returns {number}
     */
    function calculateMeritScore(stats) {
        return (0.5 * stats.performance) + (0.3 * stats.relations) + (0.2 * stats.reputation);
    }

    /**
     * Apply end-of-season natural decay/drift to stats.
     * Minor reversion to mean prevents runaway values.
     * @param {Object} playerState
     */
    function applySeasonalDecay(playerState) {
        // Stress naturally reduces slightly each season (rest)
        playerState.stressLevel = Math.max(0, playerState.stressLevel - 3);
        // Heat decays if no corrupt actions taken
        if (playerState.heat > 0) {
            playerState.heat = Math.max(0, playerState.heat - 2);
        }
    }

    /**
     * Check whether the player's corruption heat exceeds their record threshold,
     * triggering a scandal/arrest event.
     * @param {Object} playerState
     * @returns {boolean}
     */
    function checkCorruptionExposure(playerState) {
        return playerState.heat > playerState.stats.record;
    }

    /**
     * Initialise the stats for a new character based on entry path, background, and education.
     * @param {Object} options - { entryPath, background, schoolId, universityId }
     * @param {Object} educationData - The parsed education_tiers.json data
     * @param {Object} backgroundDefs - Background definitions
     * @returns {Object} - Initial player stats object
     */
    function initialiseStats(options, educationData, backgroundDefs) {
        var base = {
            performance: 20,
            relations: 20,
            record: 30,
            reputation: 20
        };

        // Entry path base wealth & energy
        var wealth = 0;
        var maxEnergy = 100;

        switch (options.entryPath) {
            case 'first_division':
                wealth = 250;
                base.performance += 5;
                break;
            case 'second_division':
                wealth = 120;
                base.performance += 10;
                base.relations -= 5;
                break;
            case 'special_appointment':
                wealth = 400;
                base.relations += 10;
                break;
        }

        // Background modifiers
        var bg = backgroundDefs[options.background];
        if (bg) {
            base.relations = clamp(base.relations + (bg.relationsBonus || 0));
            base.performance = clamp(base.performance + (bg.performanceBonus || 0));
            if (bg.initialReputation === 'High') {
                base.reputation = clamp(base.reputation + 20);
            } else if (bg.initialReputation === 'Medium') {
                base.reputation = clamp(base.reputation + 10);
            }
            if (bg.initialRecord === 'High') {
                base.record = clamp(base.record + 15);
            } else if (bg.initialRecord === 'Medium') {
                base.record = clamp(base.record + 5);
            }
            if (bg.wealthModifier) {
                wealth = clampWealth(wealth + bg.wealthModifier);
            }
        }

        // School modifiers
        function applyEducation(edId, allTiers) {
            var allSchools = []
                .concat(allTiers.secondary || [])
                .concat(allTiers.clarendon || [])
                .concat(allTiers.university || []);
            allSchools.forEach(function (school) {
                if (school.id === edId) {
                    var attrs = school.attributes;
                    base.performance = clamp(base.performance + (attrs.performance || 0));
                    base.relations = clamp(base.relations + (attrs.relations || 0));
                    base.record = clamp(base.record + (attrs.record || 0));
                    base.reputation = clamp(base.reputation + (attrs.reputation || 0));
                }
            });
        }

        if (options.schoolId && educationData) {
            applyEducation(options.schoolId, educationData);
        }
        if (options.universityId && educationData) {
            applyEducation(options.universityId, educationData);
        }

        return {
            stats: base,
            wealth: wealth,
            maxEnergy: maxEnergy,
            energy: maxEnergy,
            stressLevel: 0,
            heat: 0
        };
    }

    return {
        clamp: clamp,
        clampWealth: clampWealth,
        applyEffects: applyEffects,
        calculateEnergyCost: calculateEnergyCost,
        calculateMeritScore: calculateMeritScore,
        applySeasonalDecay: applySeasonalDecay,
        checkCorruptionExposure: checkCorruptionExposure,
        initialiseStats: initialiseStats
    };
}());
