// digimon_legend_website/frontend/js/data.js

const API_BASE_URL = '/api';

// Global data stores
let digimonData = [];
let evolutionData = {};
let guidesData = []; // Now a single array for all guides
let changelogData = []; // This can be added later if needed
let equipmentData = []; // To store equipment data
let itemsData = []; // To store item data
let synthesisData = []; // To store synthesis data

// Global data indexes (for new ID-based system)
let allItemsById = {};
let synthesisRecipesById = {};

// --- Data Loading Functions ---

/**
 * Fetches all necessary data from the backend APIs in parallel.
 * This is the main function to initialize all application data.
 */
async function initData() {
    console.log('Initializing all data from APIs and local files...');
    try {
        const cacheBuster = `v=${new Date().getTime()}`;
        // Fetch all primary data sources in parallel for faster loading.
        const fetchPromises = [
            fetch(`${API_BASE_URL}/digimons?${cacheBuster}`),
            fetch(`${API_BASE_URL}/evolutions?${cacheBuster}`),
            // fetch(`${API_BASE_URL}/guides?${cacheBuster}`), // We now load this from a local JSON
            fetch(`js/data/guides.json?${cacheBuster}`), // Load the new merged guides file
            fetch(`${API_BASE_URL}/changelogs?${cacheBuster}`),
            fetch(`${API_BASE_URL}/equipment?${cacheBuster}`),
            fetch(`${API_BASE_URL}/items?${cacheBuster}`),
            fetch(`${API_BASE_URL}/synthesis?${cacheBuster}`)
        ];

        // Use Promise.allSettled to handle potential errors gracefully
        const results = await Promise.allSettled(fetchPromises);

        // Helper to process responses
        const processResponse = async (result, name) => {
            if (result.status === 'fulfilled') {
                const response = result.value;
                if (!response.ok) {
                    console.warn(`API request for '${name}' failed with status: ${response.status}`);
                    return null; // Return null if response is not OK (e.g., 404)
                }
                return response.json();
            } else {
                console.error(`Network or other error fetching '${name}':`, result.reason);
                return null;
            }
        };

        // Assign results to variables
        const [
            digimonsResult,
            evolutionsResult,
            guidesResult,
            changelogsResult,
            equipmentsResult,
            itemsResult,
            synthesisResult
        ] = results;

        const [digimons, evolutions, guides, changelogs, equipments, items, synthesis] = await Promise.all([
            processResponse(digimonsResult, 'digimons'),
            processResponse(evolutionsResult, 'evolutions'),
            processResponse(guidesResult, 'guides'),
            processResponse(changelogsResult, 'changelogs'),
            processResponse(equipmentsResult, 'equipments'),
            processResponse(itemsResult, 'items'),
            processResponse(synthesisResult, 'synthesis')
        ]);

        // --- Data Cleaning ---
        // Normalize item data before it's used anywhere else.
        if (items) {
            items.forEach(item => {
                if (item.acquisition_method && !item.acquisitionMethod) {
                    item.acquisitionMethod = item.acquisition_method;
                    // We don't delete the old key, just in case.
                }
                // Rename "关键道具" to "进化道具"
                if (item.category === '关键道具') {
                    item.category = '进化道具';
                }
            });
        }

        // Store fetched data in global variables, only if successful
        if (digimons) digimonData = digimons;
        if (evolutions) evolutionData = evolutions;
        if (equipments) equipmentData = equipments;
        if (changelogs) changelogData = changelogs;
        if (items) itemsData = items;
        if (synthesis) synthesisData = synthesis;
        
        // --- NEW: Handle guides data directly ---
        if (guides) {
            guidesData = guides;
        }

        // --- NEW: Build ID-based indexes ---
        // 1. Index all items and equipment by their ID
        allItemsById = {};
        if (items) {
            items.forEach(item => {
                if (item.id) allItemsById[item.id] = item;
            });
        }
        if (equipments) {
            equipments.forEach(dungeon => {
                dungeon.looseItems?.forEach(item => {
                    if(item.id) allItemsById[item.id] = item;
                });
                dungeon.equipmentSets?.forEach(set => {
                    set.items?.forEach(item => {
                        if(item.id) allItemsById[item.id] = item;
                    });
                });
            });
        }
        
        // 2. Index all synthesis recipes by their target item ID
        synthesisRecipesById = {};
        if(synthesis) {
            synthesis.forEach(recipe => {
                if(recipe.targetItemId) {
                    synthesisRecipesById[recipe.targetItemId] = recipe.materials;
                }
            });
        }

        console.log('Data initialization finished.');
        
        // Expose data to the global window object for other scripts
        window.digimonData = digimonData;
        window.evolutionData = evolutionData;
        window.guidesData = guidesData;
        window.equipmentData = equipmentData; // Expose equipment data
        window.changelogData = changelogData;
        window.itemsData = itemsData;
        window.synthesisData = synthesisData;

        // Fire a custom event to notify other parts of the app that data is ready
        document.dispatchEvent(new CustomEvent('dataLoaded'));

    } catch (error) {
        console.error('Fatal Error: Could not initialize data. Please ensure the backend server is running.', error);
        // Optionally, display an error message to the user on the page
        document.body.innerHTML = '<div style="color: red; padding: 20px;">无法加载网站数据，请确认后台服务已启动，并刷新页面。</div>';
    }
}

// --- Data Accessor Functions ---

// These functions provide a clean way for other scripts to access the data
// without needing to know about the global variables.

function getDigimonData() {
    return window.digimonData || [];
}

function getEvolutionData() {
    return window.evolutionData || {};
}

function getEquipmentData() {
    return window.equipmentData || [];
}

function getChangelogData() {
    return window.changelogData || [];
}

function getItemsData() {
    return window.itemsData || [];
}

function getSynthesisData() {
    return window.synthesisData || [];
}

function getAllGuides() {
    // Directly return the loaded guides, sorted by date.
    const all = window.guidesData || [];
    return all.sort((a, b) => {
        const dateA = new Date(a.updateDate || a.updatedAt || 0);
        const dateB = new Date(b.updateDate || b.updatedAt || 0);
        return dateB - dateA;
    });
}

function getGuidesByCategory(category) {
    if (!category || category === 'all') {
        return getAllGuides();
    }
    return window.guidesData?.[category] || [];
}

function getGuideBySlug(slug) {
    return getAllGuides().find(g => g.slug === slug);
}

// --- NEW Accessors for ID-based indexes ---
function getItemById(id) {
    return allItemsById[id] || null;
}

function getSynthesisRecipeById(id) {
    return synthesisRecipesById[id] || null;
}

// --- Expose functions to global scope ---
window.getDigimonData = getDigimonData;
window.getEvolutionData = getEvolutionData;
window.getEquipmentData = getEquipmentData;
window.getChangelogData = getChangelogData;
window.getItemsData = getItemsData;
window.getSynthesisData = getSynthesisData;
window.getAllGuides = getAllGuides;
window.getGuidesByCategory = getGuidesByCategory;
window.getGuideBySlug = getGuideBySlug;
window.getItemById = getItemById;
window.getSynthesisRecipeById = getSynthesisRecipeById;

// 在文件末尾添加用途查找函数
function findUsageRecipes(itemId) {
    if (!synthesisData) return [];
    return synthesisData.filter(recipe => 
        recipe.materials && recipe.materials.some(material => material.materialId === itemId)
    );
}

// 确保函数可以全局访问
window.findUsageRecipes = findUsageRecipes;

// --- Initializer ---
// Start the data loading process as soon as the DOM is ready.
document.addEventListener('DOMContentLoaded', initData);

