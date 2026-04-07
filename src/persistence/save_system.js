/**
 * save_system.js
 * Serialises and deserialises the player state using LocalStorage.
 * Supports save, load, autosave, and delete operations.
 */

var SaveSystem = (function () {
    'use strict';

    var SAVE_KEY_PREFIX = 'greasy_pole_save_';
    var AUTOSAVE_KEY = SAVE_KEY_PREFIX + 'autosave';
    var SAVE_SLOT_COUNT = 3;
    var GAME_VERSION = '1.0.0';

    /**
     * Serialise the current game state to a JSON string.
     * @param {Object} gameState
     * @returns {string}
     */
    function serialise(gameState) {
        var saveData = {
            version: GAME_VERSION,
            savedAt: new Date().toISOString(),
            state: gameState
        };
        return JSON.stringify(saveData);
    }

    /**
     * Deserialise a JSON string into a game state object.
     * @param {string} jsonString
     * @returns {Object|null}
     */
    function deserialise(jsonString) {
        try {
            var parsed = JSON.parse(jsonString);
            if (parsed && parsed.state) {
                return parsed;
            }
        } catch (e) {
            console.error('SaveSystem: Failed to parse save data.', e);
        }
        return null;
    }

    /**
     * Save the game state to a named slot in LocalStorage.
     * @param {Object} gameState
     * @param {string|number} slot - Slot identifier (0, 1, 2, or 'autosave')
     * @returns {boolean} - True if successful
     */
    function saveGame(gameState, slot) {
        try {
            var key = (slot === 'autosave') ? AUTOSAVE_KEY : SAVE_KEY_PREFIX + 'slot_' + slot;
            var data = serialise(gameState);
            localStorage.setItem(key, data);
            return true;
        } catch (e) {
            console.error('SaveSystem: Failed to save game.', e);
            return false;
        }
    }

    /**
     * Load the game state from a named slot.
     * @param {string|number} slot
     * @returns {Object|null} - The parsed save data object, or null if not found
     */
    function loadGame(slot) {
        try {
            var key = (slot === 'autosave') ? AUTOSAVE_KEY : SAVE_KEY_PREFIX + 'slot_' + slot;
            var raw = localStorage.getItem(key);
            if (!raw) { return null; }
            return deserialise(raw);
        } catch (e) {
            console.error('SaveSystem: Failed to load game.', e);
            return null;
        }
    }

    /**
     * Delete a save slot.
     * @param {string|number} slot
     */
    function deleteSave(slot) {
        try {
            var key = (slot === 'autosave') ? AUTOSAVE_KEY : SAVE_KEY_PREFIX + 'slot_' + slot;
            localStorage.removeItem(key);
        } catch (e) {
            console.error('SaveSystem: Failed to delete save.', e);
        }
    }

    /**
     * Check whether any save data exists in a given slot.
     * @param {string|number} slot
     * @returns {boolean}
     */
    function hasSave(slot) {
        try {
            var key = (slot === 'autosave') ? AUTOSAVE_KEY : SAVE_KEY_PREFIX + 'slot_' + slot;
            return localStorage.getItem(key) !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * List all available save slots with their metadata.
     * @returns {Array} - Array of { slot, exists, savedAt, characterName, rank, year }
     */
    function listSaves() {
        var saves = [];

        // Check autosave
        var autoData = loadGame('autosave');
        saves.push({
            slot: 'autosave',
            label: 'Autosave',
            exists: autoData !== null,
            savedAt: autoData ? autoData.savedAt : null,
            characterName: autoData && autoData.state ? autoData.state.playerName : null,
            rank: autoData && autoData.state ? autoData.state.rank : null,
            year: autoData && autoData.state ? TurnManager.getCurrentYear(autoData.state) : null
        });

        // Check numbered slots
        for (var i = 0; i < SAVE_SLOT_COUNT; i++) {
            var slotData = loadGame(i);
            saves.push({
                slot: i,
                label: 'Save ' + (i + 1),
                exists: slotData !== null,
                savedAt: slotData ? slotData.savedAt : null,
                characterName: slotData && slotData.state ? slotData.state.playerName : null,
                rank: slotData && slotData.state ? slotData.state.rank : null,
                year: slotData && slotData.state && slotData.state.turnCount !== undefined
                    ? TurnManager.getCurrentYear(slotData.state) : null
            });
        }

        return saves;
    }

    /**
     * Perform an autosave.
     * @param {Object} gameState
     * @returns {boolean}
     */
    function autosave(gameState) {
        return saveGame(gameState, 'autosave');
    }

    /**
     * Export the save state as a downloadable JSON string (for manual backup).
     * @param {Object} gameState
     * @returns {string}
     */
    function exportSave(gameState) {
        return serialise(gameState);
    }

    /**
     * Import a save from a JSON string.
     * @param {string} jsonString
     * @returns {Object|null}
     */
    function importSave(jsonString) {
        return deserialise(jsonString);
    }

    return {
        SAVE_SLOT_COUNT: SAVE_SLOT_COUNT,
        saveGame: saveGame,
        loadGame: loadGame,
        deleteSave: deleteSave,
        hasSave: hasSave,
        listSaves: listSaves,
        autosave: autosave,
        exportSave: exportSave,
        importSave: importSave,
        serialise: serialise,
        deserialise: deserialise
    };
}());
