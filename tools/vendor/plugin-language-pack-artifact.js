"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLUGIN_LANGUAGE_CATALOG_MAX_DEPTH = exports.PLUGIN_LANGUAGE_CATALOG_MAX_ENTRIES = void 0;
exports.isPluginLanguagePackRegistration = isPluginLanguagePackRegistration;
exports.pluginLanguageResourceId = pluginLanguageResourceId;
exports.parsePluginLanguagePackArtifact = parsePluginLanguagePackArtifact;
exports.validatePluginLanguagePackCatalog = validatePluginLanguagePackCatalog;
exports.checkPluginLanguagePackCatalog = checkPluginLanguagePackCatalog;
const plugin_translatable_chrome_1 = require("./plugin-translatable-chrome");
exports.PLUGIN_LANGUAGE_CATALOG_MAX_ENTRIES = 20_000;
exports.PLUGIN_LANGUAGE_CATALOG_MAX_DEPTH = 16;
const DANGEROUS_CATALOG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
// Why: every plugin-facing security surface lives under this namespace, so
// protecting the whole subtree keeps a new dialog from silently becoming
// plugin-writable the way PluginConsentProvenance did when it was extracted.
// The subtree also holds copy with no security meaning; those exact paths are
// listed in plugin-translatable-chrome.ts and stay translatable.
const PROTECTED_TRANSLATION_ROOT = 'auto.components.settings.';
const PROTECTED_TRANSLATION_MODULE = /^plugin/i;
function isPluginLanguagePackRegistration(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const pack = value;
    return (typeof pack.id === 'string' &&
        pack.id.startsWith('plugin:') &&
        typeof pack.resourceLanguage === 'string' &&
        pack.resourceLanguage === pluginLanguageResourceId(pack.id) &&
        typeof pack.pluginKey === 'string' &&
        typeof pack.locale === 'string' &&
        checkPluginLanguagePackCatalog(pack.catalog).ok);
}
function pluginLanguageResourceId(id) {
    let encoded = '';
    for (let index = 0; index < id.length; index += 1) {
        encoded += id.charCodeAt(index).toString(16).padStart(4, '0');
    }
    // Why: i18next parses punctuation in language tags during resource lookup;
    // fixed-width UTF-16 hex preserves a collision-free qualified-ID mapping.
    return `plugin${encoded}`;
}
function isCatalogObject(value) {
    return (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype);
}
function protectedTranslation(path) {
    if (!path.startsWith(PROTECTED_TRANSLATION_ROOT)) {
        return false;
    }
    if ((0, plugin_translatable_chrome_1.translatablePluginChrome)(path)) {
        return false;
    }
    return PROTECTED_TRANSLATION_MODULE.test(path.slice(PROTECTED_TRANSLATION_ROOT.length));
}
function hasUnsafeCatalogKeyCharacter(key) {
    if (key.includes('.')) {
        return true;
    }
    for (let index = 0; index < key.length; index += 1) {
        if (key.charCodeAt(index) <= 31) {
            return true;
        }
    }
    return false;
}
function parsePluginLanguagePackArtifact(raw) {
    let json;
    try {
        json = JSON.parse(raw);
    }
    catch {
        return { ok: false, error: 'language pack must contain one JSON object' };
    }
    return validatePluginLanguagePackCatalog(json);
}
function validatePluginLanguagePackCatalog(source) {
    const result = walkPluginLanguagePackCatalog(source, true);
    if (!result.ok) {
        return result;
    }
    return { ok: true, catalog: result.catalog, entries: result.entries };
}
function checkPluginLanguagePackCatalog(source) {
    const result = walkPluginLanguagePackCatalog(source, false);
    return result.ok ? { ok: true, entries: result.entries } : result;
}
function walkPluginLanguagePackCatalog(source, copyCatalog) {
    if (!isCatalogObject(source)) {
        return { ok: false, error: 'language pack root must be an object' };
    }
    const catalog = copyCatalog ? {} : null;
    const stack = [{ source, target: catalog, path: '', depth: 0 }];
    const seen = new WeakSet([source]);
    let entries = 0;
    while (stack.length > 0) {
        const frame = stack.pop();
        if (frame.depth > exports.PLUGIN_LANGUAGE_CATALOG_MAX_DEPTH) {
            return { ok: false, error: `catalog exceeds depth ${exports.PLUGIN_LANGUAGE_CATALOG_MAX_DEPTH}` };
        }
        for (const key of Object.keys(frame.source)) {
            const value = frame.source[key];
            entries += 1;
            if (entries > exports.PLUGIN_LANGUAGE_CATALOG_MAX_ENTRIES) {
                return {
                    ok: false,
                    error: `catalog exceeds ${exports.PLUGIN_LANGUAGE_CATALOG_MAX_ENTRIES} entries`
                };
            }
            if (key.length === 0 ||
                key.length > 128 ||
                DANGEROUS_CATALOG_KEYS.has(key) ||
                hasUnsafeCatalogKeyCharacter(key)) {
                return { ok: false, error: `catalog key ${key || '(empty)'} is not safe` };
            }
            const path = frame.path ? `${frame.path}.${key}` : key;
            // A protected container stays walkable only when exempt chrome sits below
            // it; every leaf inside is still matched against its own full path.
            if (protectedTranslation(path) &&
                !(isCatalogObject(value) && (0, plugin_translatable_chrome_1.translatablePluginChromeContainer)(path))) {
                return { ok: false, error: `catalog cannot replace protected security copy at ${path}` };
            }
            if (typeof value === 'string') {
                if (value.length > 8192) {
                    return { ok: false, error: `translation at ${path} exceeds 8192 characters` };
                }
                if (frame.target) {
                    frame.target[key] = value;
                }
                continue;
            }
            if (!isCatalogObject(value)) {
                return { ok: false, error: `translation at ${path} must be a string or object` };
            }
            if (seen.has(value)) {
                return { ok: false, error: `catalog contains a repeated or cyclic object at ${path}` };
            }
            seen.add(value);
            const child = frame.target ? {} : null;
            if (frame.target && child) {
                frame.target[key] = child;
            }
            stack.push({ source: value, target: child, path, depth: frame.depth + 1 });
        }
    }
    return { ok: true, catalog, entries };
}
