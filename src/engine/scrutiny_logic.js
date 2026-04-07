/**
 * scrutiny_logic.js
 * Handles the annual Scrutiny Phase: promotion, demotion, scandal, and arrest events.
 * This module runs once per year (every four seasons) and evaluates the player's standing.
 */

var ScrutinyLogic = (function () {
    'use strict';

    var RECORD_SCANDAL_THRESHOLD = 20;
    var RECORD_ARREST_THRESHOLD = 10;

    /**
     * Run the annual scrutiny phase.
     *
     * @param {Object} playerState  - Current player state (stats, rank, heat, wealth, etc.)
     * @param {Array}  ranksData    - Array of rank definitions from ranks.json
     * @returns {Object} result     - { outcome, newRank, meritScore, message, details }
     *   outcome: 'promoted' | 'stable' | 'demoted' | 'scandal' | 'arrest' | 'game_over'
     */
    function runScrutiny(playerState, ranksData) {
        var stats = playerState.stats;
        var currentRankId = playerState.rank;

        // Find current rank index
        var currentRankIndex = ranksData.findIndex(function (r) { return r.id === currentRankId; });
        if (currentRankIndex === -1) {
            currentRankIndex = 0;
        }
        var currentRank = ranksData[currentRankIndex];

        // Calculate Merit Score
        var meritScore = StatManager.calculateMeritScore(stats);

        // Build result object
        var result = {
            meritScore: Math.round(meritScore * 10) / 10,
            outcome: 'stable',
            newRank: currentRankId,
            message: '',
            details: []
        };

        // --- Step 1: Check for arrest (heat > record AND record very low) ---
        if (playerState.heat >= 80 || (playerState.heat > playerState.stats.record && stats.record < RECORD_ARREST_THRESHOLD)) {
            result.outcome = 'arrest';
            result.message = 'Your corrupt practices have come to light. A Royal Commission has been convened. You face arrest and the ignominious end of your career.';
            result.details.push('Heat level (' + playerState.heat + ') far exceeds your Record (' + stats.record + ').');
            result.details.push('The Metropolitan Police have been informed of irregularities.');
            return result;
        }

        // --- Step 2: Check for scandal (record below threshold) ---
        if (stats.record < RECORD_SCANDAL_THRESHOLD) {
            result.outcome = 'scandal';
            result.message = 'A scandal has erupted. Your Record has fallen to an unconscionable level. The Permanent Secretary has requested your resignation.';
            result.details.push('Your Record (' + stats.record + ') has fallen below the minimum threshold of ' + RECORD_SCANDAL_THRESHOLD + '.');
            result.details.push('Regardless of your merit score (' + result.meritScore + '), promotion is denied.');

            // Possible demotion
            if (currentRankIndex > 0) {
                var demotedRank = ranksData[currentRankIndex - 1];
                result.newRank = demotedRank.id;
                result.details.push('You have been demoted to ' + demotedRank.name + '.');
            }
            return result;
        }

        // --- Step 3: Check heat exposure (scandal warning) ---
        if (StatManager.checkCorruptionExposure(playerState)) {
            result.details.push('Warning: Your Heat (' + playerState.heat + ') exceeds your Record (' + stats.record + '). You are under scrutiny.');
            // Reduce merit score as a penalty
            meritScore *= 0.85;
            result.meritScore = Math.round(meritScore * 10) / 10;
            result.details.push('Your Merit Score has been reduced to ' + result.meritScore + ' due to the cloud of suspicion.');
        }

        // --- Step 4: Assess promotion ---
        // Top rank: no further promotion possible
        if (currentRankIndex >= ranksData.length - 1) {
            result.outcome = 'stable';
            result.message = 'You are at the summit of the Civil Service. The pole has been climbed.';
            result.details.push('Merit Score: ' + result.meritScore + '. You hold the highest office.');
            return result;
        }

        var nextRank = ranksData[currentRankIndex + 1];
        var threshold = currentRank.promotionThreshold;

        result.details.push('Merit Score: ' + result.meritScore + ' (threshold for promotion: ' + threshold + ').');
        result.details.push('Performance: ' + stats.performance + ', Relations: ' + stats.relations + ', Reputation: ' + stats.reputation + '.');

        if (meritScore >= threshold) {
            result.outcome = 'promoted';
            result.newRank = nextRank.id;
            result.message = 'Congratulations. After careful consideration, you have been advanced to the rank of ' + nextRank.name + '.';
            result.details.push('Your new salary is £' + nextRank.salary + ' per annum.');

            // Apply salary increase to wealth
            var salaryBonus = nextRank.salary - currentRank.salary;
            if (salaryBonus > 0) {
                result.wealthBonus = Math.round(salaryBonus / 4); // quarterly increment
            }
        } else {
            result.outcome = 'stable';
            result.message = 'The Scrutiny Committee has reviewed your service record. Your position remains unchanged for the present.';
            result.details.push('Your Merit Score of ' + result.meritScore + ' falls short of the required ' + threshold + '.');

            // Low merit may lead to demotion warning
            if (meritScore < threshold * 0.6 && currentRankIndex > 0) {
                result.outcome = 'demoted';
                var demotedRank2 = ranksData[currentRankIndex - 1];
                result.newRank = demotedRank2.id;
                result.message = 'The Committee has reviewed your record and found it wanting. You have been superseded.';
                result.details.push('Your Merit Score of ' + result.meritScore + ' is well below requirements.');
                result.details.push('You are demoted to ' + demotedRank2.name + '.');
            }
        }

        return result;
    }

    /**
     * Apply the results of a scrutiny phase to the player state.
     * @param {Object} playerState
     * @param {Object} scrutinyResult - From runScrutiny()
     * @param {Array}  ranksData
     * @returns {Object} Updated player state
     */
    function applyScrutinyResult(playerState, scrutinyResult, ranksData) {
        // Update rank
        playerState.rank = scrutinyResult.newRank;

        // Apply wealth bonus for promotion
        if (scrutinyResult.outcome === 'promoted' && scrutinyResult.wealthBonus) {
            playerState.wealth = StatManager.clampWealth(playerState.wealth + scrutinyResult.wealthBonus);
        }

        // Apply annual salary increment
        var rankData = ranksData.find(function (r) { return r.id === playerState.rank; });
        if (rankData) {
            var currentSalary = rankData.salary;
            var increment = rankData.increment || 0;
            var maxSal = rankData.maxSalary;
            if (currentSalary < maxSal && increment > 0) {
                playerState.wealth = StatManager.clampWealth(playerState.wealth + Math.round(increment / 4));
            }
        }

        // Reduce heat after scrutiny (investigation is concluded)
        if (scrutinyResult.outcome !== 'arrest') {
            playerState.heat = Math.max(0, playerState.heat - 10);
        }

        return playerState;
    }

    /**
     * Calculate the examination outcome based on study energy allocation and education background.
     * Used during the first-year examination event.
     * @param {Object} studyAllocation - { classics, mathematics, politicalEconomy, modernLanguages } energy spent
     * @param {Object} playerState
     * @returns {Object} - { passed, division, performanceBonus, recordBonus, message }
     */
    function calculateExaminationResult(studyAllocation, playerState) {
        var totalEnergy = Object.values(studyAllocation).reduce(function (sum, v) { return sum + v; }, 0);
        var educationBonus = 0;

        // Education background provides a bonus
        switch (playerState.education) {
            case 'oxford': educationBonus = 20; break;
            case 'cambridge': educationBonus = 18; break;
            case 'winchester': educationBonus = 12; break;
            case 'eton': educationBonus = 8; break;
            case 'harrow': educationBonus = 8; break;
            case 'westminster': educationBonus = 10; break;
            case 'grammar_school': educationBonus = 5; break;
            default: educationBonus = 0;
        }

        // Subject-specific performance bonuses
        var performanceBonus = Math.round(
            (studyAllocation.classics || 0) * 0.8 +
            (studyAllocation.mathematics || 0) * 0.6 +
            (studyAllocation.politicalEconomy || 0) * 0.5 +
            (studyAllocation.modernLanguages || 0) * 0.4
        ) / 10;

        var recordBonus = Math.round(
            (studyAllocation.mathematics || 0) * 0.4 +
            (studyAllocation.politicalEconomy || 0) * 0.3 +
            (studyAllocation.modernLanguages || 0) * 0.3
        ) / 10;

        var score = totalEnergy + educationBonus + playerState.stats.performance * 0.3;

        var passed = score >= 40;
        var division = score >= 70 ? 'First' : (score >= 50 ? 'Second' : 'Third');

        var message;
        if (!passed) {
            message = 'You have failed to achieve the standard required by the Civil Service Commission. Entry to the Second Division is your only recourse.';
        } else if (division === 'First') {
            message = 'You have placed in the First Division of the examination. Your career begins with every advantage.';
        } else if (division === 'Second') {
            message = 'You have passed in the Second Division. A creditable performance.';
        } else {
            message = 'You have passed in the Third Division. A bare pass; your superiors will expect improvement.';
        }

        return {
            passed: passed,
            division: division,
            score: Math.round(score),
            performanceBonus: Math.min(performanceBonus, 15),
            recordBonus: Math.min(recordBonus, 10),
            message: message
        };
    }

    return {
        runScrutiny: runScrutiny,
        applyScrutinyResult: applyScrutinyResult,
        calculateExaminationResult: calculateExaminationResult,
        RECORD_SCANDAL_THRESHOLD: RECORD_SCANDAL_THRESHOLD,
        RECORD_ARREST_THRESHOLD: RECORD_ARREST_THRESHOLD
    };
}());
